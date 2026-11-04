import { ConsoleLogSink } from './sinks/console.log-sink.js';
import { BetterStackLogSink } from './sinks/better-stack.log-sink.js';
import type { LogSink } from './log-sink.js';

/**
 * Fábrica: cambiar LOG_PROVIDER no exige tocar casos de uso.
 * console = stdout JSON
 * better_stack = Better Stack (requiere token)
 * both = stdout + Better Stack (recomendado en QA)
 */
export function createLogSinks(env: NodeJS.ProcessEnv): LogSink[] {
  const provider = (env.LOG_PROVIDER ?? 'console').toLowerCase();
  const sinks: LogSink[] = [];

  if (provider === 'console' || provider === 'both' || provider === '') {
    sinks.push(new ConsoleLogSink());
  }

  if (provider === 'better_stack' || provider === 'both') {
    const token = env.BETTER_STACK_SOURCE_TOKEN;
    const endpoint = env.BETTER_STACK_ENDPOINT ?? 'https://in.logs.betterstack.com';
    if (!token) {
      sinks.push(new ConsoleLogSink());
      return unique(sinks);
    }
    sinks.push(new BetterStackLogSink(token, endpoint));
  }

  return sinks.length ? unique(sinks) : [new ConsoleLogSink()];
}

function unique(sinks: LogSink[]): LogSink[] {
  const seen = new Set<string>();
  return sinks.filter((sink) => {
    if (seen.has(sink.name)) {
      return false;
    }
    seen.add(sink.name);
    return true;
  });
}
