const LOG_PREFIX = "[deals]";

type LogMeta = Record<string, unknown> | undefined;

export function logInfo(message: string, meta?: LogMeta) {
  if (meta) {
    console.log(LOG_PREFIX, message, meta);
  } else {
    console.log(LOG_PREFIX, message);
  }
}

export function logError(message: string, meta?: LogMeta) {
  if (meta) {
    console.error(LOG_PREFIX, message, meta);
  } else {
    console.error(LOG_PREFIX, message);
  }
}
