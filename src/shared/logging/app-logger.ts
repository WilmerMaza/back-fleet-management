import { Injectable, LoggerService } from '@nestjs/common';
import { createLogSinks } from './create-log-sinks.js';
import type { LogLevel, LogRecord, LogSink } from './log-sink.js';

@Injectable()
export class AppLogger implements LoggerService {
  private readonly sinks: LogSink[];

  constructor() {
    this.sinks = createLogSinks(process.env);
  }

  log(message: string, ...optional: unknown[]): void {
    this.emit('info', message, optional);
  }

  info(message: string, attrs?: Record<string, unknown>, context?: string): void {
    this.write('info', message, context, attrs);
  }

  warn(message: string, ...optional: unknown[]): void {
    this.emit('warn', message, optional);
  }

  error(message: string, ...optional: unknown[]): void {
    const err = optional.find((item) => item instanceof Error) as Error | undefined;
    this.write('error', message, findContext(optional), undefined, err);
  }

  debug(message: string, ...optional: unknown[]): void {
    this.emit('debug', message, optional);
  }

  verbose(message: string, ...optional: unknown[]): void {
    this.emit('debug', message, optional);
  }

  private emit(level: LogLevel, message: string, optional: unknown[]): void {
    const attrs = optional.find(
      (item) => item && typeof item === 'object' && !(item instanceof Error) && !Array.isArray(item),
    ) as Record<string, unknown> | undefined;
    this.write(level, message, findContext(optional), attrs);
  }

  private write(
    level: LogLevel,
    message: string,
    context?: string,
    attrs?: Record<string, unknown>,
    error?: Error,
  ): void {
    const record: LogRecord = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      attrs,
      error: error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined,
    };
    for (const sink of this.sinks) {
      void sink.write(record);
    }
  }
}

function findContext(optional: unknown[]): string | undefined {
  const text = optional.find((item) => typeof item === 'string');
  return typeof text === 'string' ? text : undefined;
}
