/**
 * Entrypoint HTTP de la API KONTI (Vercel + local).
 *
 * En Vercel Fluid/NestJS la invocación espera el top-level await. Si ese await
 * incluye NestFactory.create/app.init, un hang o crash de init deja la request
 * sin respuesta → INTERNAL_FUNCTION_INVOCATION_FAILED y logs Hobby vacíos.
 *
 * Orden:
 * 1) listen() Express inmediato
 * 2) resolver el top-level await (la función ya puede responder)
 * 3) montar Nest en background; si falla, /health sirve bootstrap_failed JSON
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppLogger } from './shared/logging/app-logger.js';

const BOOTSTRAP = 'Bootstrap';
const CREATE_TIMEOUT_MS = 25_000;

type BootstrapPayload = {
  status: 'bootstrap_failed' | 'starting';
  errorName?: string;
  errorMessage?: string;
  errorStack?: string[];
  env: Record<string, unknown>;
};

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

function toFailedPayload(err: unknown): BootstrapPayload {
  const error = err instanceof Error ? err : new Error(String(err));
  return {
    status: 'bootstrap_failed',
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack?.split('\n').slice(0, 15) ?? [],
    env: describeStartupEnv(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3000);
  const expressApp = express();

  let nestReady = false;
  let bootError: BootstrapPayload | null = null;

  // Middleware diagnóstico: responde antes de Nest si aún no está listo / falló.
  expressApp.use((req, res, next) => {
    if (bootError) {
      res.status(503).type('json').send(JSON.stringify(bootError));
      return;
    }
    if (!nestReady) {
      const starting: BootstrapPayload = {
        status: 'starting',
        env: describeStartupEnv(),
      };
      // Solo /health (y raíz) muestran "starting"; el resto espera a Nest.
      if (req.path === '/' || req.path.endsWith('/health')) {
        res.status(503).type('json').send(JSON.stringify(starting));
        return;
      }
    }
    next();
  });

  bootLog('info', 'bootstrap:start', describeStartupEnv());

  await new Promise<void>((resolve, reject) => {
    const server = expressApp.listen(port, () => resolve());
    server.once('error', reject);
  });
  bootLog('info', 'bootstrap:early_listen', {
    port,
    hint: 'HTTP live; Nest mounts in background so Vercel can route requests',
  });

  // No await: en Vercel el top-level await debe terminar tras listen.
  // Si awaitamos Nest aquí, un hang de init → INTERNAL_FUNCTION_INVOCATION_FAILED.
  void (async () => {
    try {
      bootLog('info', 'bootstrap:importing_app_module');
      const { AppModule } = await import('./app.module.js');

      bootLog('info', 'bootstrap:creating_app');
      const app = await withTimeout(
        NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
          bufferLogs: true,
          abortOnError: false,
        }),
        CREATE_TIMEOUT_MS,
        'NestFactory.create',
      );

      const logger = app.get(AppLogger);
      app.useLogger(logger);
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

      bootLog('info', 'bootstrap:init');
      await withTimeout(app.init(), CREATE_TIMEOUT_MS, 'app.init');
      nestReady = true;
      bootLog('info', 'bootstrap:ready', { url: `http://localhost:${port}/api/v1` });
      logger.log(`KONTI API en http://localhost:${port}/api/v1`, BOOTSTRAP);
    } catch (err) {
      bootError = toFailedPayload(err);
      bootLog('error', 'bootstrap:failed', bootError as unknown as Record<string, unknown>);
    }
  })();
}

process.on('uncaughtException', (err) => {
  bootLog('error', 'bootstrap:uncaughtException', toFailedPayload(err) as unknown as Record<string, unknown>);
});

process.on('unhandledRejection', (reason) => {
  bootLog(
    'error',
    'bootstrap:unhandledRejection',
    toFailedPayload(reason) as unknown as Record<string, unknown>,
  );
});

await bootstrap();
