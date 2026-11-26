import { describe, expect, it } from 'vitest';
import { renderInvitationEmail } from './invitation-email.template.js';

describe('renderInvitationEmail', () => {
  it('incluye empresa, rol, enlace y marca KONTI', () => {
    const expiresAt = new Date('2026-12-01T18:30:00.000Z');
    const result = renderInvitationEmail({
      businessName: 'Taller KONTI',
      roleCode: 'ADMIN',
      inviteUrl: 'http://localhost:4200/auth/invitation/abc',
      expiresAt,
      inviterName: 'Wilmer Maza',
    });

    expect(result.subject).toContain('Taller KONTI');
    expect(result.html).toContain('KONTI');
    expect(result.html).toContain('#0F5B5B');
    expect(result.html).toContain('ADMIN');
    expect(result.html).toContain('http://localhost:4200/auth/invitation/abc');
    expect(result.text).toContain('Taller KONTI');
    expect(result.text).toContain('http://localhost:4200/auth/invitation/abc');
  });
});
