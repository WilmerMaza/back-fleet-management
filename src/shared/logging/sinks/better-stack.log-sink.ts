/**
 * Sink Better Stack (Logtail HTTP).
 * Falla en silencio para no tumbar la petición si el proveedor no responde.
 */
import type { LogRecord, LogSink } from '../log-sink.js';

export class BetterStackLogSink implements LogSink {
  readonly name = 'better_stack';

  constructor(
    private readonly token: string,
    private readonly endpoint: string,
  ) {}

  async write(record: LogRecord): Promise<void> {
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'konti-api',
        },
        body: JSON.stringify({
          dt: record.timestamp,
          message: record.message,
          level: record.level,
          context: record.context,
          ...record.attrs,
          error: record.error,
        }),
      });
    } catch {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'No se pudo enviar el log a Better Stack',
          timestamp: new Date().toISOString(),
          context: 'BetterStackLogSink',
        }),
      );
    }
  }
}
