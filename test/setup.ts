import 'reflect-metadata';

/** Secreto válido para Vitest (AppModule valida JWT_SECRET al cargar JwtModule). */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'vitest-jwt-secret-konti-h04-tests-32b';
}
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = '15m';
}
if (!process.env.JWT_REFRESH_EXPIRES_IN) {
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
}
/** Límites altos por defecto en Vitest; SEC-01 baja límites en su propio archivo. */
if (!process.env.AUTH_LOGIN_IP_MAX) {
  process.env.AUTH_LOGIN_IP_MAX = '1000';
}
if (!process.env.AUTH_LOGIN_ACCOUNT_MAX) {
  process.env.AUTH_LOGIN_ACCOUNT_MAX = '1000';
}
if (!process.env.AUTH_REFRESH_IP_MAX) {
  process.env.AUTH_REFRESH_IP_MAX = '1000';
}
if (!process.env.AUTH_SESSION_CACHE_TTL_MS) {
  process.env.AUTH_SESSION_CACHE_TTL_MS = '0';
}
