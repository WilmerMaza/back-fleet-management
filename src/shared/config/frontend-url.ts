/**
 * URL pública del frontend Angular (enlaces en correos e invitaciones).
 */
export function frontendBaseUrl(): string {
  return (process.env.APP_FRONTEND_URL ?? 'http://localhost:4200').replace(/\/$/, '');
}

export function frontendInvitationUrl(token: string): string {
  return `${frontendBaseUrl()}/auth/invitation/${encodeURIComponent(token)}`;
}
