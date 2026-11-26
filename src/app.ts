/**
 * Entrypoint HTTP KONTI para Vercel (preset Express: `src/app.ts`) y local.
 *
 * Fluid Compute congela trabajo en background al terminar la request. Si Nest
 * monta con `void` y /health responde `starting` al instante, Prisma `$connect`
 * queda suspendido y acaba en timeout falso. Por eso cada request **await** el
 * mount: el isolate sigue vivo mientras arranca Nest + DB.
 */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { renderKontiApiHomePage } from './shared/http/konti-api-home.page.js';
import { AppLogger } from './shared/logging/app-logger.js';

const BOOTSTRAP = 'Bootstrap';
const CREATE_TIMEOUT_MS = 55_000;

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

  const pooledUrl = process.env.DATABASE_URL_POOLED?.trim() ?? '';
  let pooledHost: string | undefined;
  try {
    if (pooledUrl) {
      pooledHost = new URL(pooledUrl.replace(/^postgres(ql)?:/i, 'http:')).host;
    }
  } catch {
    pooledHost = '(url-inválida)';
  }

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
    databaseUrlPooledSet: pooledUrl.length > 0,
    databasePooledHost: pooledHost ?? '(none)',
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

const expressApp = express();
let nestReady = false;
let bootError: BootstrapPayload | null = null;
let mountPromise: Promise<void> | null = null;

// Parsers propios: Nest 12 + Express 5 rompe en `app.router` al registrar los suyos.
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

async function mountNest(): Promise<void> {
  bootLog('info', 'bootstrap:start', describeStartupEnv());
  try {
    bootLog('info', 'bootstrap:importing_app_module');
    const { AppModule } = await import('./app.module.js');

    bootLog('info', 'bootstrap:creating_app');
    const app = await withTimeout(
      NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
        bufferLogs: true,
        abortOnError: false,
        // Evita ExpressAdapter.registerParserMiddleware → app.router (roto en Express 5).
        bodyParser: false,
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
    bootLog('info', 'bootstrap:ready');
    logger.log('KONTI API lista (Express + Nest)', BOOTSTRAP);
  } catch (err) {
    bootError = toFailedPayload(err);
    bootLog('error', 'bootstrap:failed', bootError as unknown as Record<string, unknown>);
  }
}

function ensureNestMounted(): Promise<void> {
  if (!mountPromise) {
    mountPromise = mountNest();
  }
  return mountPromise;
}

function wantsHtmlHome(req: express.Request): boolean {
  if (req.method !== 'GET') {
    return false;
  }
  if (req.path !== '/' && req.path !== '') {
    return false;
  }
  const accept = req.headers.accept ?? '';
  // Probes / curl sin Accept HTML siguen pudiendo pedir JSON con ?format=json
  if (req.query.format === 'json') {
    return false;
  }
  return accept.includes('text/html') || accept === '' || accept.includes('*/*');
}

function sendApiHome(res: express.Response): void {
  const status = bootError ? 'error' : nestReady ? 'ok' : 'starting';
  const html = renderKontiApiHomePage({
    status,
    errorMessage: bootError?.errorMessage,
  });
  res.status(bootError ? 503 : 200).type('html').send(html);
}

expressApp.use((req, res, next) => {
  void (async () => {
    const home = wantsHtmlHome(req);

    if (!nestReady && !bootError) {
      bootLog('info', 'bootstrap:await_mount', { path: req.path });
      await ensureNestMounted();
    }

    if (home) {
      sendApiHome(res);
      return;
    }

    if (bootError) {
      res.status(503).type('json').send(JSON.stringify(bootError));
      return;
    }

    next();
  })().catch((err: unknown) => {
    bootError = toFailedPayload(err);
    if (wantsHtmlHome(req)) {
      sendApiHome(res);
      return;
    }
    res.status(503).type('json').send(JSON.stringify(bootError));
  });
});

process.on('uncaughtException', (err) => {
  bootError = toFailedPayload(err);
  bootLog('error', 'bootstrap:uncaughtException', bootError as unknown as Record<string, unknown>);
});

process.on('unhandledRejection', (reason) => {
  bootError = toFailedPayload(reason);
  bootLog('error', 'bootstrap:unhandledRejection', bootError as unknown as Record<string, unknown>);
});

// Local: listen + montar ya. En Vercel el mount ocurre en la 1ª request (Fluid-safe).
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3000);
  void ensureNestMounted();
  expressApp.listen(port, () => {
    bootLog('info', 'bootstrap:local_listen', { port });
  });
}

export default expressApp;
