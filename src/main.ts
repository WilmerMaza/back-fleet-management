/**
 * Entrypoint HTTP de la API KONTI.
 *
 * El bootstrap escribe hitos y errores a stderr de forma síncrona (JSON)
 * para que plataformas serverless (p. ej. Vercel) muestren la causa real
 * aunque Nest falle antes de `listen()` o con `bufferLogs`.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
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

async function bootstrap() {
  bootLog('info', 'bootstrap:start', describeStartupEnv());

  bootLog('info', 'bootstrap:creating_app');
  // abortOnError:false → el error llega a nuestro catch (JSON claro) en vez de
  // process.exit silencioso de Nest ExceptionHandler, que en Vercel solo deja 500.
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

function failBootstrap(err: unknown): never {
  const error = err instanceof Error ? err : new Error(String(err));
  bootLog('error', 'bootstrap:failed', {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    env: describeStartupEnv(),
  });
  // En serverless, salir evita el timeout ~60s esperando listen().
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  failBootstrap(err);
});

process.on('unhandledRejection', (reason) => {
  failBootstrap(reason);
});

try {
  await bootstrap();
} catch (err) {
  failBootstrap(err);
}
