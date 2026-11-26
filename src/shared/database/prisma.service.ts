/**
 * Cliente Prisma del monolito.
 *
 * `$connect` en init: si falla, el mensaje va a stderr de inmediato para
 * diagnosticar arranques rotos en serverless (Vercel) sin depender del logger Nest.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'prisma:connecting',
        timestamp: new Date().toISOString(),
        context: 'PrismaService',
      }),
    );
    try {
      await this.$connect();
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'prisma:connected',
          timestamp: new Date().toISOString(),
          context: 'PrismaService',
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
        }),
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
