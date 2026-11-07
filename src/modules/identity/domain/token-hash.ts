/**
 * Hash determinista del refresh token para almacenamiento.
 * El JWT ya aporta alta entropía; SHA-256 evita guardar el secreto en claro.
 */
import { createHash } from 'node:crypto';

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
