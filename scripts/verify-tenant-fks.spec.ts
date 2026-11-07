/**
 * Unitarios del formateo / metadatos del diagnóstico H-07 (sin PostgreSQL).
 */
import { describe, expect, it } from 'vitest';
import {
  TENANT_FK_CHECKS,
  formatReport,
  redactedDatabaseTarget,
  type VerificationReport,
} from './verify-tenant-fks.js';

describe('verify-tenant-fks (metadatos)', () => {
  it('define exactamente 12 verificaciones con ids únicos', () => {
    expect(TENANT_FK_CHECKS).toHaveLength(12);
    const ids = TENANT_FK_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(12);
  });

  it('redacta DATABASE_URL sin credenciales', () => {
    expect(
      redactedDatabaseTarget('postgresql://konti:secret@localhost:5432/konti'),
    ).toBe('postgresql://localhost:5432/konti');
    expect(redactedDatabaseTarget(undefined)).toContain('no definida');
  });

  it('formatReport resume PASS/FAIL/ERROR', () => {
    const report: VerificationReport = {
      ok: false,
      failedCount: 1,
      errorCount: 1,
      totalInconsistencies: 2,
      results: [
        {
          id: 'a',
          name: 'ok',
          status: 'PASS',
          count: 0,
          samples: [],
        },
        {
          id: 'b',
          name: 'fail',
          status: 'FAIL',
          count: 2,
          samples: [{ vehicle_id: 'x' }],
        },
        {
          id: 'c',
          name: 'err',
          status: 'ERROR',
          count: 0,
          samples: [],
          error: 'tabla ausente',
        },
      ],
    };
    const text = formatReport(report);
    expect(text).toContain('[PASS ]');
    expect(text).toContain('[FAIL ]');
    expect(text).toContain('[ERROR]');
    expect(text).toContain('FAIL: 1');
    expect(text).toContain('ERROR: 1');
    expect(text).toContain('Solo lectura');
  });
});
