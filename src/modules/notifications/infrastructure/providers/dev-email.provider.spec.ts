import { describe, expect, it, vi } from 'vitest';
import { DevEmailProvider } from './dev-email.provider.js';

describe('DevEmailProvider', () => {
  it('devuelve providerMessageId sin lanzar', async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const provider = new DevEmailProvider(logger as never);
    const result = await provider.send({
      from: { email: 'noreply@test.local', name: 'KONTI' },
      to: { email: 'invitado@test.local' },
      subject: 'Prueba',
      html: '<p><a href="http://localhost:4200/auth/invitation/SECRET_TOKEN">x</a></p>',
      text: 'http://localhost:4200/auth/invitation/SECRET_TOKEN',
    });
    expect(result.providerMessageId).toMatch(/^dev_/);
    expect(provider.providerId).toBe('dev');
    expect(logger.info).toHaveBeenCalledOnce();
    const attrs = logger.info.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(attrs).toBeDefined();
    expect(attrs).not.toHaveProperty('html');
    expect(JSON.stringify(attrs)).not.toContain('SECRET_TOKEN');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('SECRET_TOKEN');
  });
});
