export const PRIVACY_REDACTED = "[redacted]";

const MAX_ARRAY_ITEMS = 20;
const MAX_DEPTH = 4;
const MAX_OBJECT_KEYS = 40;
const MAX_STRING_LENGTH = 500;

const SENSITIVE_KEY_PATTERN =
  /authorization|auth(?:entication)?|bearer|credential|cookie|password|passcode|secret|session|signature|signed|token|api[-_]?key|access[-_]?key|private[-_]?key|base64|image|audio|video|media|raw[-_]?data/i;
const DATA_MEDIA_PATTERN = /data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=_-]+/gi;
const LOCAL_URI_PATTERN = /(?:file|content):\/\/[^\s<>"']+/gi;
const LOCAL_PATH_PATTERN =
  /(?:^|[\s([{"'=])(?:\/(?:Users|private|var|tmp|Volumes|home|data|storage|sdcard)(?:\/[^\s<>"')\]}]+)+|[a-z]:\\(?:[^\s<>:"|?*]+\\)*[^\s<>:"|?*]*)/gi;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const BEARER_PATTERN = /\bbearer\s+[a-z0-9._~+/=-]{8,}/gi;
const JWT_PATTERN = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi;
const OPENAI_KEY_PATTERN = /\bsk-(?:proj-|svcacct-)?[a-z0-9_-]{16,}\b/gi;
const KEYED_SECRET_PATTERN =
  /\b(authorization|password|passcode|secret|token|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|signature)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;}&]+/gi;
const LONG_BASE64_PATTERN = /\b(?:[a-z0-9+/]{80,}={0,2}|[a-z0-9_-]{100,})\b/gi;

function boundString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}[truncated]`;
}

function sanitizeUrl(candidate: string) {
  const trailingPunctuation = candidate.match(/[),.;!?\]}]+$/)?.[0] ?? "";
  const rawUrl = trailingPunctuation ? candidate.slice(0, -trailingPunctuation.length) : candidate;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return `[redacted url]${trailingPunctuation}`;
    }

    return `${parsed.origin}${parsed.pathname}${trailingPunctuation}`;
  } catch {
    return PRIVACY_REDACTED;
  }
}

export function isSensitivePrivacyKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function sanitizePrivacyString(value: string) {
  const sanitized = value
    .replace(DATA_MEDIA_PATTERN, "[redacted media]")
    .replace(LOCAL_URI_PATTERN, "[redacted local uri]")
    .replace(URL_PATTERN, sanitizeUrl)
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(JWT_PATTERN, "[redacted jwt]")
    .replace(OPENAI_KEY_PATTERN, "[redacted api key]")
    .replace(KEYED_SECRET_PATTERN, (_match, key: string) => `${key}=${PRIVACY_REDACTED}`)
    .replace(LONG_BASE64_PATTERN, "[redacted base64]")
    .replace(LOCAL_PATH_PATTERN, (match) => {
      const prefix = match[0] && /[\s([{"'=]/.test(match[0]) ? match[0] : "";
      return `${prefix}[redacted local path]`;
    });

  return boundString(sanitized);
}

function sanitizeNestedValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizePrivacyString(value);
  }

  if (typeof value === "bigint") {
    return boundString(value.toString());
  }

  if (typeof value !== "object") {
    return "[unsupported]";
  }

  if (depth >= MAX_DEPTH) {
    return "[bounded]";
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  seen.add(value);

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "[invalid date]" : value.toISOString();
  }

  if (value instanceof Error) {
    return {
      message: sanitizePrivacyString(value.message),
      name: sanitizePrivacyString(value.name),
    };
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeNestedValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      sanitized.push(`[${value.length - MAX_ARRAY_ITEMS} items omitted]`);
    }
    return sanitized;
  }

  let entries: [string, unknown][];
  try {
    entries = Object.entries(value as Record<string, unknown>);
  } catch {
    return PRIVACY_REDACTED;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [rawKey, nestedValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
    const key = boundString(sanitizePrivacyString(rawKey));
    sanitized[key] = isSensitivePrivacyKey(rawKey)
      ? PRIVACY_REDACTED
      : sanitizeNestedValue(nestedValue, depth + 1, seen);
  }

  if (entries.length > MAX_OBJECT_KEYS) {
    sanitized["[omitted keys]"] = entries.length - MAX_OBJECT_KEYS;
  }

  return sanitized;
}

export function sanitizePrivacyValue(value: unknown) {
  return sanitizeNestedValue(value, 0, new WeakSet<object>());
}
