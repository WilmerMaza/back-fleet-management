/**
 * Verifica en PostgreSQL las restricciones SQL que Prisma no modela (H-03).
 *
 * Comprueba nombres, tipo (UNIQUE / CHECK), predicados o expresiones
 * normalizadas, y que los objetos estén válidos y habilitados.
 * Solo lectura. Exit 1 si falta o difiere alguna restricción.
 *
 * Uso: npm run db:verify-constraints
 * Conexión: DATABASE_URL (Prisma carga .env del proyecto).
 */
import { PrismaClient } from '@prisma/client';

type IndexExpectation = {
  kind: 'partial_unique_index';
  name: string;
  table: string;
  /** Fragmentos que deben aparecer en el predicado normalizado. */
  predicateMustInclude: string[];
  /** Columnas indexadas en orden (normalizadas). */
  columns: string[];
};

type CheckExpectation = {
  kind: 'check';
  name: string;
  table: string;
  /** Fragmentos que deben aparecer en la expresión CHECK normalizada. */
  expressionMustInclude: string[];
};

const EXPECTATIONS: Array<IndexExpectation | CheckExpectation> = [
  {
    kind: 'partial_unique_index',
    name: 'customers_person_document_unique',
    table: 'customers',
    columns: ['business_id', 'document_type', 'document_number'],
    predicateMustInclude: ["type='person'"],
  },
  {
    kind: 'partial_unique_index',
    name: 'customers_company_nit_unique',
    table: 'customers',
    columns: ['business_id', 'nit'],
    predicateMustInclude: ["type='company'"],
  },
  {
    kind: 'partial_unique_index',
    name: 'fleet_vehicles_open_assignment_unique',
    table: 'fleet_vehicles',
    columns: ['vehicle_id'],
    predicateMustInclude: ['unassigned_atisnull'],
  },
  {
    kind: 'check',
    name: 'products_stock_non_negative',
    table: 'products',
    expressionMustInclude: ['stock>=0'],
  },
  {
    kind: 'check',
    name: 'products_min_stock_non_negative',
    table: 'products',
    expressionMustInclude: ['min_stock>=0'],
  },
  {
    kind: 'check',
    name: 'inventory_movements_quantity_valid',
    table: 'inventory_movements',
    expressionMustInclude: [
      "type='adjustment'",
      'quantity>=0',
      "type<>'adjustment'",
      'quantity>0',
    ],
  },
  {
    kind: 'check',
    name: 'inventory_movements_stock_after_non_negative',
    table: 'inventory_movements',
    expressionMustInclude: ['stock_after>=0'],
  },
  {
    kind: 'check',
    name: 'vehicles_mileage_non_negative',
    table: 'vehicles',
    expressionMustInclude: ['current_mileage>=0'],
  },
  {
    kind: 'check',
    name: 'vehicle_mileage_logs_mileage_non_negative',
    table: 'vehicle_mileage_logs',
    expressionMustInclude: ['mileage>=0'],
  },
];

/** Normaliza SQL de catálogo para comparar semántica sin ruido de casts/espacios. */
function normalizeSql(input: string): string {
  return input
    .toLowerCase()
    .replace(/::[a-z_][\w."]*/gi, '')
    .replace(/"/g, '')
    .replace(/\s+/g, '')
    .replace(/\((0)\)/g, '$1');
}

function redactedDatabaseTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return '(DATABASE_URL no definida)';
  }
  try {
    const url = new URL(raw);
    const db = url.pathname.replace(/^\//, '') || '?';
    return `${url.protocol}//${url.hostname}:${url.port || '5432'}/${db}`;
  } catch {
    return '(DATABASE_URL presente, formato no parseable)';
  }
}

type IndexRow = {
  index_name: string;
  table_name: string;
  indisunique: boolean;
  indisvalid: boolean;
  indisready: boolean;
  indislive: boolean;
  predicate: string | null;
  indexdef: string;
  columns: string[] | null;
};

type CheckRow = {
  conname: string;
  table_name: string;
  convalidated: boolean;
  condeferred: boolean;
  definition: string;
  expression: string;
};

async function loadIndexes(prisma: PrismaClient): Promise<Map<string, IndexRow>> {
  const rows = await prisma.$queryRaw<IndexRow[]>`
    SELECT
      i.relname AS index_name,
      t.relname AS table_name,
      ix.indisunique,
      ix.indisvalid,
      ix.indisready,
      ix.indislive,
      pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
      pg_get_indexdef(ix.indexrelid) AS indexdef,
      (
        SELECT array_agg(a.attname::text ORDER BY ord.ordinality)
        FROM unnest(ix.indkey) WITH ORDINALITY AS ord(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = ix.indrelid AND a.attnum = ord.attnum
      ) AS columns
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND i.relname IN (
        'customers_person_document_unique',
        'customers_company_nit_unique',
        'fleet_vehicles_open_assignment_unique'
      )
  `;
  return new Map(rows.map((r) => [r.index_name, r]));
}

async function loadChecks(prisma: PrismaClient): Promise<Map<string, CheckRow>> {
  const rows = await prisma.$queryRaw<CheckRow[]>`
    SELECT
      c.conname,
      t.relname AS table_name,
      c.convalidated,
      c.condeferred,
      pg_get_constraintdef(c.oid) AS definition,
      pg_get_expr(c.conbin, c.conrelid) AS expression
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND c.contype = 'c'
      AND c.conname IN (
        'products_stock_non_negative',
        'products_min_stock_non_negative',
        'inventory_movements_quantity_valid',
        'inventory_movements_stock_after_non_negative',
        'vehicles_mileage_non_negative',
        'vehicle_mileage_logs_mileage_non_negative'
      )
  `;
  return new Map(rows.map((r) => [r.conname, r]));
}

function verifyIndex(expected: IndexExpectation, actual: IndexRow | undefined): string[] {
  const errors: string[] = [];
  if (!actual) {
    errors.push(`FALTA índice "${expected.name}" en tabla "${expected.table}".`);
    return errors;
  }
  if (actual.table_name !== expected.table) {
    errors.push(
      `Índice "${expected.name}": tabla esperada "${expected.table}", encontrada "${actual.table_name}".`,
    );
  }
  if (!actual.indisunique) {
    errors.push(`Índice "${expected.name}": debe ser UNIQUE.`);
  }
  if (!actual.indisvalid || !actual.indisready || !actual.indislive) {
    errors.push(
      `Índice "${expected.name}": no está válido/listo (valid=${actual.indisvalid}, ready=${actual.indisready}, live=${actual.indislive}).`,
    );
  }
  if (actual.predicate == null || actual.predicate.trim() === '') {
    errors.push(`Índice "${expected.name}": debe ser parcial (predicado WHERE ausente).`);
  } else {
    const pred = normalizeSql(actual.predicate);
    for (const fragment of expected.predicateMustInclude) {
      if (!pred.includes(fragment)) {
        errors.push(
          `Índice "${expected.name}": predicado inesperado. Falta "${fragment}" en "${actual.predicate}".`,
        );
      }
    }
  }
  const cols = (actual.columns ?? []).map((c) => c.toLowerCase());
  if (cols.length !== expected.columns.length || expected.columns.some((c, i) => cols[i] !== c)) {
    errors.push(
      `Índice "${expected.name}": columnas esperadas [${expected.columns.join(', ')}], encontradas [${cols.join(', ')}].`,
    );
  }
  return errors;
}

function verifyCheck(expected: CheckExpectation, actual: CheckRow | undefined): string[] {
  const errors: string[] = [];
  if (!actual) {
    errors.push(`FALTA CHECK "${expected.name}" en tabla "${expected.table}".`);
    return errors;
  }
  if (actual.table_name !== expected.table) {
    errors.push(
      `CHECK "${expected.name}": tabla esperada "${expected.table}", encontrada "${actual.table_name}".`,
    );
  }
  if (!actual.convalidated) {
    errors.push(`CHECK "${expected.name}": no está validado (convalidated=false).`);
  }
  if (actual.condeferred) {
    errors.push(`CHECK "${expected.name}": no debe ser DEFERRABLE (condeferred=true).`);
  }
  const expr = normalizeSql(actual.expression || actual.definition);
  for (const fragment of expected.expressionMustInclude) {
    if (!expr.includes(fragment)) {
      errors.push(
        `CHECK "${expected.name}": expresión inesperada. Falta "${fragment}" en "${actual.definition}".`,
      );
    }
  }
  return errors;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL no está definida.');
    process.exit(1);
  }

  console.log('KONTI — verificación de restricciones SQL (H-03)');
  console.log(`Destino: ${redactedDatabaseTarget()}`);
  console.log('');

  const prisma = new PrismaClient();
  const failures: string[] = [];
  const passed: string[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    const indexes = await loadIndexes(prisma);
    const checks = await loadChecks(prisma);

    for (const expected of EXPECTATIONS) {
      if (expected.kind === 'partial_unique_index') {
        const errs = verifyIndex(expected, indexes.get(expected.name));
        if (errs.length === 0) {
          passed.push(`OK  UNIQUE INDEX ${expected.table}.${expected.name}`);
        } else {
          failures.push(...errs);
        }
      } else {
        const errs = verifyCheck(expected, checks.get(expected.name));
        if (errs.length === 0) {
          passed.push(`OK  CHECK ${expected.table}.${expected.name}`);
        } else {
          failures.push(...errs);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  for (const line of passed) {
    console.log(line);
  }

  if (failures.length > 0) {
    console.log('');
    console.error(`FALLÓ: ${failures.length} problema(s) en restricciones SQL:`);
    for (const err of failures) {
      console.error(`  - ${err}`);
    }
    console.error('');
    console.error('Ver docs/db-constraints.md. No se modificó la base de datos.');
    process.exit(1);
  }

  console.log('');
  console.log(`Todas las restricciones esperadas (${EXPECTATIONS.length}) están presentes y coherentes.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR al verificar restricciones: ${message}`);
  process.exit(1);
});
