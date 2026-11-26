import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(_key: string) {}
  },
}));

describe('ResendEmailProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
  });

  it('devuelve providerMessageId cuando Resend responde OK', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_abc' }, error: null });
    const { ResendEmailProvider } = await import('./resend-email.provider.js');
    const logger = { info: vi.fn() };
    const provider = new ResendEmailProvider(logger as never);

    const result = await provider.send({
      from: { email: 'onboarding@resend.dev', name: 'KONTI' },
      to: { email: 'dest@test.local' },
      subject: 'Invitación',
      html: '<p>Hola</p>',
      text: 'Hola',
    });

    expect(result.providerMessageId).toBe('msg_abc');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'KONTI <onboarding@resend.dev>',
        to: 'dest@test.local',
      }),
    );
  });

  it('lanza si Resend devuelve error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'Dominio no verificado' } });
    const { ResendEmailProvider } = await import('./resend-email.provider.js');
    const provider = new ResendEmailProvider({ info: vi.fn() } as never);

    await expect(
      provider.send({
        from: { email: 'onboarding@resend.dev' },
        to: { email: 'x@test.local' },
        subject: 's',
        html: 'h',
        text: 't',
      }),
    ).rejects.toThrow(/Dominio no verificado/);
  });
});
