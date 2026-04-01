function isSensitiveKey(key: string) {
  return /authorization|base64|password|secret|token|image|api[_-]?key|device[_-]?id/i.test(key);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return "[redacted]";
    }

    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value !== "object" || depth >= 2) {
    return "[redacted]";
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : sanitizeValue(nestedValue, depth + 1),
    ]),
  );
}

function writeLog(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    data: sanitizeValue(data),
    event,
    level,
    timestamp: new Date().toISOString(),
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
}

export function logInfo(event: string, data: Record<string, unknown> = {}) {
  writeLog("info", event, data);
}

export function logWarn(event: string, data: Record<string, unknown> = {}) {
  writeLog("warn", event, data);
}

export function logError(event: string, data: Record<string, unknown> = {}) {
  writeLog("error", event, data);
}
