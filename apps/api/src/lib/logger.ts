import type { DestinationStream, Logger, LoggerOptions } from 'pino';
import { pino } from 'pino';

export type { Logger };

const REDACTED = '[Redacted]';
const SENSITIVE_KEY = /token|secret|authorization|cookie|password/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object')
    return value;
  if (value instanceof Error)
    return value;
  if (Array.isArray(value))
    return value.map(item => scrub(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? REDACTED
        : scrub(item, depth + 1),
    ]),
  );
}

export interface CreateLoggerOptions {
  level: string;
  pretty?: boolean;
  destination?: DestinationStream;
}

export function createLogger({ level, pretty = false, destination }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: label => ({ level: label }),
      log: object => scrub(object) as Record<string, unknown>,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
      ],
      censor: REDACTED,
    },
  };

  if (pretty && !destination) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    });
  }

  return destination
    ? pino(options, destination)
    : pino(options);
}
