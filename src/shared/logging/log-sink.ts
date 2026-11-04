/**
 * Puerto de salida de logs. Cada proveedor implementa este contrato.
 * La aplicación solo habla con AppLogger; el sink se elige por configuración.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  attrs?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

export interface LogSink {
  readonly name: string;
  write(record: LogRecord): Promise<void> | void;
}
