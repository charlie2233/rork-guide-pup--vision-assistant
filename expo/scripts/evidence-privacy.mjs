const DISALLOWED_KEYS = new Set([
  "apiKey",
  "authorization",
  "audioBase64",
  "credential",
  "credentials",
  "deviceId",
  "fullDeviceIdentifier",
  "base64",
  "imageBase64",
  "password",
  "providerKey",
  "rawAudio",
  "rawImage",
  "sessionToken",
  "signedUrl",
  "token",
  "udid",
  "uri",
]);

const SENSITIVE_PATTERNS = [
  /data:(?:image|audio)\/[a-z0-9.+-]+;base64,/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /OPENAI_API_KEY\s*[:=]\s*[^,"\s]+/i,
  /(?:X-Amz-Signature|X-Goog-Signature|Signature=|sig=)/i,
  /[A-Za-z0-9+/]{200,}={0,2}/,
];

export function findDisallowedKeys(value, prefix = "") {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDisallowedKeys(item, `${prefix}[${index}]`));
  }

  const matches = [];
  for (const [key, child] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (DISALLOWED_KEYS.has(key)) {
      matches.push(fieldPath);
    }
    matches.push(...findDisallowedKeys(child, fieldPath));
  }
  return matches;
}

export function findSensitivePatterns(value) {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    return [];
  }

  return SENSITIVE_PATTERNS
    .filter((pattern) => pattern.test(serialized))
    .map((pattern) => pattern.toString());
}

export function validateEvidencePrivacy(value) {
  return {
    disallowedKeys: findDisallowedKeys(value),
    sensitivePatterns: findSensitivePatterns(value),
  };
}
