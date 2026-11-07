/**
 * Fase 0 H-07 — Diagnóstico de integridad referencial multi-tenant (solo lectura).
 *
 * Detecta relaciones cruzadas entre `business_id` y otras inconsistencias.
 * No modifica datos ni esquema. Exit ≠ 0 si hay FAIL/ERROR.
 *
 * Uso: npm run db:verify-tenant-fks
 * Conexión: DATABASE_URL (Prisma carga .env del proyecto).
 *
 * Ver: docs/audits/tenant-referential-integrity-audit.md
 */
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

export const SAMPLE_LIMIT = 5;

export type CheckStatus = 'PASS' | 'FAIL' | 'ERROR';

export type CheckResult = {
  id: string;
  name: string;
  status: CheckStatus;
  count: number;
  samples: Record<string, unknown>[];
  error?: string;
};

export type VerificationReport = {
  results: CheckResult[];
  ok: boolean;
  failedCount: number;
  errorCount: number;
  totalInconsistencies: number;
};

type CheckDefinition = {
  id: string;
  name: string;
  /** Tablas que deben existir (schema public). */
  requiredTables: string[];
  /** Solo SELECT; debe devolver filas inconsistentes (ids, sin PII). */
  sql: string;
};

/**
 * Las 12 verificaciones obligatorias (nombres de tablas/columnas alineados a migraciones).
 */
export const TENANT_FK_CHECKS: CheckDefinition[] = [
  {
    id: 'vehicles_customer_cross_tenant',
    name: 'vehicles.customer_id ↔ customers (mismo business_id)',
    requiredTables: ['vehicles', 'customers'],
    sql: `
      SELECT v.id AS vehicle_id, v.business_id AS vehicle_business_id,
             c.id AS customer_id, c.business_id AS customer_business_id
      FROM vehicles v
      JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id <> c.business_id
    `,
  },
  {
    id: 'fleets_customer_cross_tenant',
    name: 'fleets.customer_id ↔ customers (mismo business_id)',
    requiredTables: ['fleets', 'customers'],
    sql: `
      SELECT f.id AS fleet_id, f.business_id AS fleet_business_id,
             c.id AS customer_id, c.business_id AS customer_business_id
      FROM fleets f
      JOIN customers c ON c.id = f.customer_id
      WHERE f.business_id <> c.business_id
    `,
  },
  {
    id: 'fleet_vehicles_fleet_cross_tenant',
    name: 'fleet_vehicles.fleet_id ↔ fleets (mismo business_id)',
    requiredTables: ['fleet_vehicles', 'fleets'],
    sql: `
      SELECT fv.id AS assignment_id, fv.business_id AS row_business_id,
             f.id AS fleet_id, f.business_id AS fleet_business_id
      FROM fleet_vehicles fv
      JOIN fleets f ON f.id = fv.fleet_id
      WHERE fv.business_id <> f.business_id
    `,
  },
  {
    id: 'fleet_vehicles_vehicle_cross_tenant',
    name: 'fleet_vehicles.vehicle_id ↔ vehicles (mismo business_id)',
    requiredTables: ['fleet_vehicles', 'vehicles'],
    sql: `
      SELECT fv.id AS assignment_id, fv.business_id AS row_business_id,
             v.id AS vehicle_id, v.business_id AS vehicle_business_id
      FROM fleet_vehicles fv
      JOIN vehicles v ON v.id = fv.vehicle_id
      WHERE fv.business_id <> v.business_id
    `,
  },
  {
    id: 'vehicles_fleet_cross_tenant',
    name: 'vehicles.fleet_id ↔ fleets (mismo business_id)',
    requiredTables: ['vehicles', 'fleets'],
    sql: `
      SELECT v.id AS vehicle_id, v.business_id AS vehicle_business_id,
             f.id AS fleet_id, f.business_id AS fleet_business_id
      FROM vehicles v
      JOIN fleets f ON f.id = v.fleet_id
      WHERE v.fleet_id IS NOT NULL AND v.business_id <> f.business_id
    `,
  },
  {
    id: 'movements_product_cross_tenant',
    name: 'inventory_movements.product_id ↔ products (mismo business_id)',
    requiredTables: ['inventory_movements', 'products'],
    sql: `
      SELECT m.id AS movement_id, m.business_id AS movement_business_id,
             p.id AS product_id, p.business_id AS product_business_id
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      WHERE m.business_id <> p.business_id
    `,
  },
  {
    id: 'mileage_vehicle_cross_tenant',
    name: 'vehicle_mileage_logs.vehicle_id ↔ vehicles (mismo business_id)',
    requiredTables: ['vehicle_mileage_logs', 'vehicles'],
    sql: `
      SELECT l.id AS log_id, l.business_id AS log_business_id,
             v.id AS vehicle_id, v.business_id AS vehicle_business_id
      FROM vehicle_mileage_logs l
      JOIN vehicles v ON v.id = l.vehicle_id
      WHERE l.business_id <> v.business_id
    `,
  },
  {
    id: 'movements_reversal_cross_tenant',
    name: 'inventory_movements.reverses_movement_id ↔ mismo business_id',
    requiredTables: ['inventory_movements'],
    sql: `
      SELECT m.id AS movement_id, m.business_id AS movement_business_id,
             r.id AS reversed_id, r.business_id AS reversed_business_id
      FROM inventory_movements m
      JOIN inventory_movements r ON r.id = m.reverses_movement_id
      WHERE m.reverses_movement_id IS NOT NULL AND m.business_id <> r.business_id
    `,
  },
  {
    id: 'vehicle_fleet_owner_mismatch',
    name: 'Propiedad: customer del vehículo vs customer de flota (proyección o asignación abierta)',
    requiredTables: ['vehicles', 'fleets', 'fleet_vehicles'],
    sql: `
      SELECT DISTINCT v.id AS vehicle_id, v.business_id,
             v.customer_id AS vehicle_customer_id,
             f.id AS fleet_id, f.customer_id AS fleet_customer_id,
             'projection'::text AS via
      FROM vehicles v
      JOIN fleets f ON f.id = v.fleet_id
      WHERE v.fleet_id IS NOT NULL AND v.customer_id <> f.customer_id
      UNION
      SELECT DISTINCT v.id AS vehicle_id, v.business_id,
             v.customer_id AS vehicle_customer_id,
             f.id AS fleet_id, f.customer_id AS fleet_customer_id,
             'open_assignment'::text AS via
      FROM vehicles v
      JOIN fleet_vehicles fv ON fv.vehicle_id = v.id AND fv.unassigned_at IS NULL
      JOIN fleets f ON f.id = fv.fleet_id
      WHERE v.customer_id <> f.customer_id
    `,
  },
  {
    id: 'fleet_projection_drift',
    name: 'Proyección vehicles.fleet_id ↔ asignación abierta en fleet_vehicles',
    requiredTables: ['vehicles', 'fleet_vehicles'],
    sql: `
      SELECT v.id AS vehicle_id, v.business_id AS vehicle_business_id,
             v.fleet_id AS projected_fleet_id,
             o.fleet_id AS open_fleet_id,
             o.business_id AS open_business_id
      FROM vehicles v
      FULL OUTER JOIN (
        SELECT vehicle_id, fleet_id, business_id
        FROM fleet_vehicles
        WHERE unassigned_at IS NULL
      ) o ON o.vehicle_id = v.id
      WHERE (v.fleet_id IS DISTINCT FROM o.fleet_id)
         OR (v.id IS NOT NULL AND o.vehicle_id IS NOT NULL AND v.business_id IS DISTINCT FROM o.business_id)
         OR (v.fleet_id IS NOT NULL AND o.vehicle_id IS NULL)
         OR (v.fleet_id IS NULL AND o.vehicle_id IS NOT NULL)
    `,
  },
  {
    id: 'auth_session_orphan_business',
    name: 'auth_refresh_sessions.active_business_id existe en businesses',
    requiredTables: ['auth_refresh_sessions', 'businesses'],
    sql: `
      SELECT s.id AS session_id, s.user_id, s.active_business_id
      FROM auth_refresh_sessions s
      LEFT JOIN businesses b ON b.id = s.active_business_id
      WHERE b.id IS NULL
    `,
  },
  {
    id: 'auth_session_missing_membership',
    name: 'auth_refresh_sessions: usuario con membresía en active_business_id',
    requiredTables: ['auth_refresh_sessions', 'user_business_roles'],
    sql: `
      SELECT s.id AS session_id, s.user_id, s.active_business_id
      FROM auth_refresh_sessions s
      LEFT JOIN user_business_roles ubr
        ON ubr.user_id = s.user_id AND ubr.business_id = s.active_business_id
      WHERE ubr.user_id IS NULL
    `,
  },
];

export function redactedDatabaseTarget(databaseUrl: string | undefined | null): string {
  if (!databaseUrl) {
    return '(DATABASE_URL no definida)';
  }
  try {
    const url = new URL(databaseUrl);
    const db = url.pathname.replace(/^\//, '') || '?';
    return `${url.protocol}//${url.hostname}:${url.port || '5432'}/${db}`;
  } catch {
    return '(DATABASE_URL presente, formato no parseable)';
  }
}

async function tableExists(
  prisma: PrismaClient,
  table: string,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      out[key] = Number(value);
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function runOneCheck(
  prisma: PrismaClient,
  check: CheckDefinition,
  sampleLimit: number,
): Promise<CheckResult> {
  try {
    for (const table of check.requiredTables) {
      if (!(await tableExists(prisma, table))) {
        return {
          id: check.id,
          name: check.name,
          status: 'ERROR',
          count: 0,
          samples: [],
          error: `Tabla pública "${table}" no existe; no se pudo ejecutar la verificación.`,
        };
      }
    }

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(check.sql);
    const count = rows.length;
    const samples = rows.slice(0, sampleLimit).map(serializeRow);
    return {
      id: check.id,
      name: check.name,
      status: count === 0 ? 'PASS' : 'FAIL',
      count,
      samples,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: check.id,
      name: check.name,
      status: 'ERROR',
      count: 0,
      samples: [],
      error: message,
    };
  }
}

/** Ejecuta las 12 verificaciones contra un PrismaClient ya conectado. */
export async function verifyTenantFks(
  prisma: PrismaClient,
  options: { sampleLimit?: number } = {},
): Promise<VerificationReport> {
  const sampleLimit = options.sampleLimit ?? SAMPLE_LIMIT;
  const results: CheckResult[] = [];
  for (const check of TENANT_FK_CHECKS) {
    results.push(await runOneCheck(prisma, check, sampleLimit));
  }
  const failedCount = results.filter((r) => r.status === 'FAIL').length;
  const errorCount = results.filter((r) => r.status === 'ERROR').length;
  const totalInconsistencies = results
    .filter((r) => r.status === 'FAIL')
    .reduce((sum, r) => sum + r.count, 0);
  return {
    results,
    ok: failedCount === 0 && errorCount === 0,
    failedCount,
    errorCount,
    totalInconsistencies,
  };
}

export function formatReport(report: VerificationReport): string {
  const lines: string[] = [];
  for (const result of report.results) {
    const badge = result.status.padEnd(5);
    lines.push(`[${badge}] ${result.id}`);
    lines.push(`         ${result.name}`);
    if (result.status === 'ERROR') {
      lines.push(`         error: ${result.error}`);
    } else {
      lines.push(`         inconsistencias: ${result.count}`);
      if (result.samples.length > 0) {
        lines.push(`         muestras (máx. ${result.samples.length}, solo ids):`);
        for (const sample of result.samples) {
          lines.push(`           ${JSON.stringify(sample)}`);
        }
      }
    }
    lines.push('');
  }
  lines.push('--- Resumen ---');
  lines.push(`Verificaciones: ${report.results.length}`);
  lines.push(`PASS: ${report.results.filter((r) => r.status === 'PASS').length}`);
  lines.push(`FAIL: ${report.failedCount}`);
  lines.push(`ERROR: ${report.errorCount}`);
  lines.push(`Total inconsistencias (FAIL): ${report.totalInconsistencies}`);
  lines.push(
    report.ok
      ? 'Resultado: OK — sin inconsistencias detectadas.'
      : 'Resultado: FALLÓ — hay inconsistencias o errores de verificación.',
  );
  lines.push('Solo lectura: no se modificó la base de datos.');
  return lines.join('\n');
}

/** CLI: conecta, corre verificaciones, imprime y sale con código apropiado. */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (!env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL no está definida.');
    return 1;
  }

  console.log('KONTI — diagnóstico de integridad multi-tenant (H-07 Fase 0)');
  console.log(`Destino: ${redactedDatabaseTarget(env.DATABASE_URL)}`);
  console.log('Modo: SOLO LECTURA (SELECT)');
  console.log('');

  const prisma = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR de conexión: ${message}`);
    await prisma.$disconnect().catch(() => undefined);
    return 1;
  }

  try {
    const report = await verifyTenantFks(prisma);
    console.log(formatReport(report));
    return report.ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isCliEntry =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntry) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERROR al verificar integridad tenant: ${message}`);
      process.exit(1);
    });
}
