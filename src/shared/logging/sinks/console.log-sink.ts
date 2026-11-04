import type { LogRecord, LogSink } from '../log-sink.js';

export class ConsoleLogSink implements LogSink {
  readonly name = 'console';

  write(record: LogRecord): void {
    const line = JSON.stringify(record);
    if (record.level === 'error') {
      console.error(line);
      return;
    }
    if (record.level === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}
