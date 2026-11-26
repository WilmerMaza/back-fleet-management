/**
 * Entrypoint DIAGNÓSTICO temporal (sin Nest).
 *
 * Si esto responde JSON en Vercel, el runtime funciona y el fallo está en Nest/deps.
 * Si sigue INTERNAL_FUNCTION_INVOCATION_FAILED, el problema es de plataforma/framework.
 */
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);

function safeEnv() {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  let databaseHost = '(none)';
  try {
    if (databaseUrl) {
      databaseHost = new URL(databaseUrl.replace(/^postgres(ql)?:/i, 'http:')).host;
    }
  } catch {
    databaseHost = '(url-inválida)';
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? '(unset)',
    vercel: Boolean(process.env.VERCEL),
    vercelEnv: process.env.VERCEL_ENV ?? '(unset)',
    port: String(port),
    emailProvider: (process.env.EMAIL_PROVIDER?.trim() || 'dev').toLowerCase(),
    resendApiKeySet: Boolean(process.env.RESEND_API_KEY?.trim()),
    emailFromSet: Boolean(process.env.EMAIL_FROM?.trim()),
    jwtSecretLength: (process.env.JWT_SECRET?.trim() ?? '').length,
    databaseUrlSet: databaseUrl.length > 0,
    databaseHost,
  };
}

const payload = {
  status: 'diagnostic_ok',
  message:
    'Entrypoint mínimo sin Nest. Si ves esto, Vercel Functions OK; el crash está en Nest/Prisma/argon2/env.',
  env: safeEnv(),
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify({ level: 'info', event: 'diagnostic:start', payload }));

createServer((req, res) => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'diagnostic:request',
      path: req.url,
      method: req.method,
    }),
  );
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}).listen(port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'diagnostic:listening',
      port,
    }),
  );
});
