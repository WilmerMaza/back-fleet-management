/**
 * Entrypoint HTTP de la API KONTI.
 *
 * Si Nest no arranca, en Vercel (y en general) aún así hacemos `listen()` con un
 * servidor mínimo que responde 503 JSON con el error real. Así el fallo es
 * visible por HTTP aunque Runtime Logs de Hobby no muestre nada.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { AppLogger } from './shared/logging/app-logger.js';

const BOOTSTRAP = 'Bootstrap';

/** Log inmediato a stderr; no depende de AppLogger ni de sinks async. */
function bootLog(
  level: 'info' | 'error',
  message: string,
  attrs?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    context: BOOTSTRAP,
    ...attrs,
  });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/** Diagnóstico seguro (sin secretos) de env críticas para arranque en prod. */
function describeStartupEnv(): Record<string, unknown> {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  let databaseHost: string | undefined;
  try {
    if (databaseUrl) {
      databaseHost = new URL(databaseUrl.replace(/^postgres(ql)?:/i, 'http:')).host;
    }
  } catch {
    databaseHost = '(url-inválida)';
  }

  const jwtSecret = process.env.JWT_SECRET?.trim() ?? '';
  const emailProvider = (process.env.EMAIL_PROVIDER?.trim() || 'dev').toLowerCase();
  const resendKey = process.env.RESEND_API_KEY?.trim() ?? '';

  return {
    nodeEnv: process.env.NODE_ENV ?? '(unset)',
    vercel: Boolean(process.env.VERCEL),
    port: process.env.PORT ?? '3000',
    emailProvider,
    resendApiKeySet: resendKey.length > 0,
    emailFromSet: Boolean(process.env.EMAIL_FROM?.trim()),
    jwtSecretLength: jwtSecret.length,
    databaseUrlSet: databaseUrl.length > 0,
    databaseHost: databaseHost ?? '(none)',
  };
}

function toBootstrapPayload(err: unknown) {
  const error = err instanceof Error ? err : new Error(String(err));
  return {
    status: 'bootstrap_failed' as const,
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack?.split('\n').slice(0, 15) ?? [],
    env: describeStartupEnv(),
  };
}

/**
 * Escucha HTTP con el error de arranque.
 * Vercel necesita `listen()` para enrutar; process.exit solo produce
 * INTERNAL_FUNCTION_INVOCATION_FAILED sin cuerpo útil.
 */
async function listenWithBootstrapError(err: unknown): Promise<void> {
  const payload = toBootstrapPayload(err);
  bootLog('error', 'bootstrap:failed', payload);

  const port = Number(process.env.PORT ?? 3000);
  const body = JSON.stringify(payload);
  const server = createServer((_req, res) => {
    res.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve());
  });

  bootLog('info', 'bootstrap:diagnostic_listening', {
    port,
    hint: 'GET any path returns bootstrap_failed JSON',
  });
}

async function bootstrap() {
  bootLog('info', 'bootstrap:start', describeStartupEnv());

  // Import dinámico: si AppModule/deps fallan, aún podemos servir el 503 diagnóstico.
  bootLog('info', 'bootstrap:importing_app_module');
  const { AppModule } = await import('./app.module.js');

  bootLog('info', 'bootstrap:creating_app');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  const logger = app.get(AppLogger);
  app.useLogger(logger);
  bootLog('info', 'bootstrap:app_created');

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:4200';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  bootLog('info', 'bootstrap:listening', { port });
  await app.listen(port);
  bootLog('info', 'bootstrap:ready', { url: `http://localhost:${port}/api/v1` });
  logger.log(`KONTI API en http://localhost:${port}/api/v1`, BOOTSTRAP);
}

let diagnosticStarted = false;

async function failBootstrap(err: unknown): Promise<void> {
  if (diagnosticStarted) {
    return;
  }
  diagnosticStarted = true;
  try {
    await listenWithBootstrapError(err);
  } catch (listenErr) {
    bootLog('error', 'bootstrap:diagnostic_listen_failed', {
      ...toBootstrapPayload(err),
      listenError: listenErr instanceof Error ? listenErr.message : String(listenErr),
    });
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  void failBootstrap(err);
});

process.on('unhandledRejection', (reason) => {
  void failBootstrap(reason);
});

try {
  await bootstrap();
} catch (err) {
  await failBootstrap(err);
}
