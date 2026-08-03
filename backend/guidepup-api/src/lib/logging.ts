function isSensitiveKey(key: string) {
  return /authorization|base64|password|secret|token|image|api[_-]?key|device[_-]?id|signed[_-]?url|file[_-]?path|local[_-]?path|uri/i.test(key);
}

function redactSignedUrls(value: string) {
  return value.replace(/\bhttps?:\/\/[^\s"',<>}]+/gi, (candidate) => {
    try {
      const url = new URL(candidate);
      const hasSensitiveQuery = [...url.searchParams.keys()].some((key) =>
        /^(?:x-amz-|x-goog-|sig(?:nature)?|signed|token|access[_-]?token|credential|policy|expires?|key-pair-id|api[_-]?key|secret)/i.test(key),
      );
      if (!hasSensitiveQuery && !url.username && !url.password) {
        return candidate;
      }

      const authority = url.username || url.password
        ? `${url.protocol}//[credentials-redacted]@${url.host}`
        : url.origin;
      return `${authority}${url.pathname}${hasSensitiveQuery ? "?[signed-query-redacted]" : ""}`;
    } catch {
      return candidate;
    }
  });
}

export function sanitizeLogMessage(value: string, maxLength = 240) {
  const redacted = redactSignedUrls(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(
      /\b(authorization|password|secret|session[_-]?token|api[_-]?key|openai[_-]?api[_-]?key)\b\s*[:=]\s*["']?[^"',\s}]{8,}/gi,
      "$1=[redacted]",
    )
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{32,}/gi, "data:image/[redacted];base64,[redacted]")
    .replace(/file:\/\/[^\s"',)\]}]+/gi, "file://[redacted]")
    .replace(
      /(^|[\s([=:])\/(?:Applications|etc|home|Library|media|mnt|opt|private|root|srv|System|tmp|Users|usr|var|Volumes|workspace)\/[^\s"',)\]}]+/g,
      "$1[local-path-redacted]",
    )
    .replace(/\b[A-Za-z]:\\[^\s"',)\]}]+/g, "[local-path-redacted]")
    .replace(/\b[A-Za-z0-9+/]{160,}={0,2}\b/g, "[redacted]");

  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1)}…` : redacted;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeLogMessage(value);
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

export function sanitizeLogData(data: Record<string, unknown> = {}) {
  return sanitizeValue(data) as Record<string, unknown>;
}

function writeLog(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    data: sanitizeLogData(data),
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
