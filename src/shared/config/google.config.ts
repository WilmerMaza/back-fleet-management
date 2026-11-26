/**
 * Configuración OIDC Google (validación de ID token en backend).
 */
export function googleClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!value) {
    throw new Error('GOOGLE_CLIENT_ID is required for Google authentication.');
  }
  return value;
}

export function googleClientIdOrNull(): string | null {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  return value || null;
}
