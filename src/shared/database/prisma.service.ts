/**
 * Cliente Prisma del monolito.
 *
 * En Vercel, `$connect` sin timeout deja `app.init` colgado → 503 genérico.
 * Aquí forzamos `connect_timeout` / `connection_limit` en serverless y
 * acotamos `$connect` para fallar con mensaje claro en /health.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** db.prisma.io ya tarda ~7s en local; en Vercel cold start necesita más margen. */
const CONNECT_TIMEOUT_MS = 20_000;

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return undefined;
  }

  const extras: string[] = [];
  if (!/[?&]connect_timeout=/.test(raw)) {
    extras.push('connect_timeout=20');
  }
  if (process.env.VERCEL && !/[?&]connection_limit=/.test(raw)) {
    extras.push('connection_limit=1');
  }
  if (extras.length === 0) {
    return raw;
  }
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}${extras.join('&')}`;
}

function databaseHost(url: string | undefined): string {
  if (!url) {
    return '(none)';
  }
  try {
    return new URL(url.replace(/^postgres(ql)?:/i, 'http:')).host;
  } catch {
    return '(url-inválida)';
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: {
          url: resolveDatabaseUrl(),
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    const url = resolveDatabaseUrl();
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'prisma:connecting',
        timestamp: new Date().toISOString(),
        context: 'PrismaService',
        databaseHost: databaseHost(url),
        vercel: Boolean(process.env.VERCEL),
      }),
    );
    try {
      await Promise.race([
        this.$connect(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Prisma $connect timeout after ${CONNECT_TIMEOUT_MS}ms (host=${databaseHost(url)})`,
              ),
            );
          }, CONNECT_TIMEOUT_MS);
        }),
      ]);
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'prisma:connected',
          timestamp: new Date().toISOString(),
          context: 'PrismaService',
          databaseHost: databaseHost(url),
        }),
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'prisma:connect_failed',
          timestamp: new Date().toISOString(),
          context: 'PrismaService',
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
          databaseHost: databaseHost(url),
        }),
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
