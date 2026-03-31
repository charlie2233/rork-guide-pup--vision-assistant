export function logInfo(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    data,
    event,
    level: "info",
    timestamp: new Date().toISOString(),
  }));
}

export function logWarn(event: string, data: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({
    data,
    event,
    level: "warn",
    timestamp: new Date().toISOString(),
  }));
}

export function logError(event: string, data: Record<string, unknown> = {}) {
  console.error(JSON.stringify({
    data,
    event,
    level: "error",
    timestamp: new Date().toISOString(),
  }));
}
