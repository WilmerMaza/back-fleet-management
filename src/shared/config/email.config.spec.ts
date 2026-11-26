import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEmailConfig } from './email.config.js';

describe('loadEmailConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('acepta proveedor dev en desarrollo (NODE_ENV≠production)', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EMAIL_PROVIDER', 'dev');
    vi.stubEnv('EMAIL_FROM', 'noreply@konti.test');
    const config = loadEmailConfig();
    expect(config.provider).toBe('dev');
    expect(config.from).toBe('noreply@konti.test');
  });

  it('acepta proveedor dev en Vitest sin exigir EMAIL_FROM', () => {
    vi.stubEnv('VITEST', 'true');
    const config = loadEmailConfig();
    expect(config.provider).toBe('dev');
    expect(config.from).toContain('@');
  });

  it('rechaza dev en producción', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'dev');
    vi.stubEnv('EMAIL_FROM', 'noreply@konti.test');
    expect(() => loadEmailConfig()).toThrow(/no está permitido en NODE_ENV=production/);
  });

  it('exige RESEND_API_KEY cuando EMAIL_PROVIDER=resend', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('EMAIL_FROM', 'onboarding@resend.dev');
    vi.stubEnv('RESEND_API_KEY', '');
    expect(() => loadEmailConfig()).toThrow(/RESEND_API_KEY/);
  });

  it('acepta resend con API key en desarrollo', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('EMAIL_FROM', 'onboarding@resend.dev');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    expect(loadEmailConfig().provider).toBe('resend');
  });

  it('acepta proveedor futuro (ses) en producción a nivel de configuración', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'ses');
    vi.stubEnv('EMAIL_FROM', 'noreply@konti.test');
    const config = loadEmailConfig();
    expect(config.provider).toBe('ses');
  });

  it('rechaza proveedor desconocido', () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EMAIL_PROVIDER', 'mailgun');
    vi.stubEnv('EMAIL_FROM', 'noreply@konti.test');
    expect(() => loadEmailConfig()).toThrow(/EMAIL_PROVIDER/);
  });
});
