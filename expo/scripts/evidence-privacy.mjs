const canonicalizeKey = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const DISALLOWED_KEYS = new Set(
  [
    "apiKey",
    "aiGatewayApiKey",
    "aiGatewayFallbackApiKey",
    "accessToken",
    "authorization",
    "audioBase64",
    "clientSecret",
    "cloudflareApiToken",
    "credential",
    "credentials",
    "bootstrapToken",
    "bootstrapSigningSecret",
    "buildToken",
    "debugBenchmarkToken",
    "deviceId",
    "deviceIdentifier",
    "expoToken",
    "fullDeviceIdentifier",
    "base64",
    "contact",
    "imageBase64",
    "email",
    "fullName",
    "password",
    "appSpecificPassword",
    "appleIdPassword",
    "participantName",
    "phone",
    "phoneNumber",
    "privateKey",
    "providerKey",
    "rawAudio",
    "rawImage",
    "refreshToken",
    "secretAccessKey",
    "sessionToken",
    "signedUrl",
    "serviceAccountKey",
    "signingSecret",
    "token",
    "udid",
    "uri",
    "openaiApiKey",
    "huggingfaceMinicpmOApiKey",
  ].map(canonicalizeKey),
);

const DISALLOWED_KEY_SUFFIXES = [
  "apikey",
  "password",
  "secret",
  "signingsecret",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "bootstraptoken",
  "buildtoken",
];

const ALLOWED_PRIVACY_DECLARATION_KEYS = new Set([
  "containscredentials",
  "containssecrets",
]);

const MIN_BYTE_ARRAY_LENGTH = 32;
const MIN_BASE64_LENGTH = 200;

const SENSITIVE_STRING_CHECKS = [
  {
    label: "data media base64 payload",
    test: (value) => /data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,/i.test(value),
  },
  {
    label: "bearer token",
    test: (value) => /Bearer\s+[A-Za-z0-9._-]{20,}/.test(value),
  },
  {
    label: "provider API key",
    test: (value) =>
      /(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|hf_[A-Za-z0-9]{20,})/.test(value),
  },
  {
    label: "credential assignment",
    test: containsCredentialAssignment,
  },
  {
    label: "private key block",
    test: (value) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value),
  },
  {
    label: "unprefixed JSON Web Token",
    test: containsLikelyJwt,
  },
  {
    label: "signed URL signature",
    test: (value) =>
      /https?:\/\/[^\s<>"']*[?&](?:X-Amz-[^=&#\s]*|X-Goog-[^=&#\s]*|Signature|sig|token|access_token|key|api_key|expires)=[^&#\s<>"']{8,}/i.test(value),
  },
  {
    label: "URL query or fragment",
    test: (value) => /https?:\/\/[^\s<>"']*[?#][^\s<>"']*/i.test(value),
  },
  {
    label: "email address",
    test: (value) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value),
  },
  {
    label: "phone number",
    test: containsLikelyPhoneNumber,
  },
  {
    label: "Apple device identifier",
    test: (value) => /\b[0-9A-F]{8}-[0-9A-F]{16}\b/i.test(value),
  },
  {
    label: "legacy Apple device identifier",
    test: (value) =>
      /(?:\b(?:udid|device(?:[\s_-]*(?:id|identifier)))\b\s*[:=]?\s*)[0-9a-f]{40}\b/i.test(value),
  },
  {
    label: "encoded media payload",
    test: containsEncodedMediaMagic,
  },
  {
    label: "long base64 payload",
    test: isLikelyBase64String,
  },
];

function hasMediaMagicBytes(value) {
  if (!value || value.length < 3) {
    return false;
  }

  const startsWith = (...bytes) =>
    value.length >= bytes.length
    && bytes.every((byte, index) => value[index] === byte);
  return (
    startsWith(0xff, 0xd8, 0xff)
    || startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    || startsWith(0x47, 0x49, 0x46, 0x38, 0x37, 0x61)
    || startsWith(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
    || (
      startsWith(0x52, 0x49, 0x46, 0x46)
      && value.length >= 12
      && value[8] === 0x57
      && value[9] === 0x45
      && value[10] === 0x42
      && value[11] === 0x50
    )
    || startsWith(0x49, 0x44, 0x33)
  );
}

function containsEncodedMediaMagic(value) {
  const compact = value.replace(/\s/g, "");
  if (
    compact.length < 8
    || compact.length % 4 === 1
    || !isBase64Characters(compact)
  ) {
    return false;
  }

  try {
    return hasMediaMagicBytes(Buffer.from(compact, "base64"));
  } catch {
    return false;
  }
}

function isLikelyByteArray(value) {
  return (
    Array.isArray(value) &&
    (
      value.length >= MIN_BYTE_ARRAY_LENGTH
      || hasMediaMagicBytes(value)
    ) &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  );
}

function isBase64Characters(value) {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && !/=/.test(value.slice(0, -2));
}

function hasBase64CharacterVariety(value) {
  const characterClasses = [
    /[A-Z]/,
    /[a-z]/,
    /[0-9]/,
    /[+/]/,
  ].filter((pattern) => pattern.test(value)).length;
  return characterClasses >= 3 || /={1,2}$/.test(value);
}

function isLikelyBase64String(value) {
  const compact = value.replace(/\s/g, "");
  if (
    compact.length < MIN_BASE64_LENGTH ||
    compact.length % 4 !== 0 ||
    !isBase64Characters(compact) ||
    !hasBase64CharacterVariety(compact)
  ) {
    return false;
  }

  if (!/\s/.test(value)) {
    return true;
  }

  const chunks = value.trim().split(/\s+/);
  return chunks.length > 1 && chunks.every((chunk) => chunk.length >= 16 && isBase64Characters(chunk));
}

function isLikelyBase64ChunkArray(value) {
  if (value.length < 2 || !value.every((item) => typeof item === "string")) {
    return false;
  }

  const chunks = value.map((item) => item.trim());
  if (
    chunks.some(
      (chunk) =>
        chunk.length < 8 ||
        /\s/.test(chunk) ||
        !isBase64Characters(chunk),
    )
  ) {
    return false;
  }

  const compact = chunks.join("");
  return (
    compact.length >= MIN_BASE64_LENGTH
    && compact.length % 4 === 0
    && isBase64Characters(compact)
    && hasBase64CharacterVariety(compact)
  );
}

function containsLikelyPhoneNumber(value) {
  const compactNorthAmericanPhone =
    /(?:^|[^A-Za-z0-9])(?:1)?[2-9]\d{2}[2-9]\d{6}(?![A-Za-z0-9])/;
  if (compactNorthAmericanPhone.test(value)) {
    return true;
  }

  const domesticPhone =
    /(?:^|[^A-Za-z0-9])(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}(?![A-Za-z0-9])/;
  if (domesticPhone.test(value)) {
    return true;
  }

  const internationalCandidates = value.match(/\+[1-9][0-9(). -]{6,25}[0-9]/g) ?? [];
  return internationalCandidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  });
}

function containsCredentialAssignment(value) {
  const assignment =
    /(?:^|[^A-Za-z0-9])["']?(?:authorization|password|passcode|credential|credentials|secret|token|OPENAI_API_KEY|CLOUDFLARE_API_TOKEN|EXPO_TOKEN|AI_GATEWAY(?:_FALLBACK)?_API_KEY|HUGGINGFACE_MINICPM_O_API_KEY|BOOTSTRAP_SIGNING_SECRET|DEBUG_BENCHMARK_TOKEN|refresh[_-]?token|bootstrap[_-]?token|build[_-]?token|session[_-]?token|client[_-]?secret|signing[_-]?secret|private[_-]?key|api[_-]?key|access[_-]?token|access[_-]?key|secret[_-]?access[_-]?key|service[_-]?account[_-]?key|app[_-]?specific[_-]?password)["']?\s*[:=]\s*["']?(?:bearer\s+)?([^"',;\s}{&]{8,})/i;
  const match = value.match(assignment);
  if (!match) {
    return false;
  }
  return !/^(?:redacted|not-set|missing|disabled|false)$/i.test(match[1]);
}

function isAllowedEvidenceFrameSummary(value) {
  if (
    value === "Sanitized native-core sampled frame summary."
    || value === "Sanitized js fallback sampled frame summary."
  ) {
    return true;
  }

  return /^Synthetic sampled (?:native-core|js-fallback) (?:guidance|scene-query) smoke frame, source [1-9]\d{0,4}x[1-9]\d{0,4}, upload [1-9]\d{0,4}x[1-9]\d{0,4}\.$/.test(
    value,
  );
}

function decodeBase64UrlJson(segment) {
  if (segment.length % 4 === 1) {
    return null;
  }

  const base64 = segment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=");

  try {
    const parsed = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function containsLikelyJwt(value) {
  const candidatePattern =
    /(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{4,})\.([A-Za-z0-9_-]{4,})\.([A-Za-z0-9_-]*)(?=$|[^A-Za-z0-9_-])/g;

  for (const candidate of value.matchAll(candidatePattern)) {
    const header = decodeBase64UrlJson(candidate[1]);
    const payload = decodeBase64UrlJson(candidate[2]);
    if (header && payload && typeof header.alg === "string") {
      return true;
    }
  }

  return false;
}

function finding(path, label) {
  return `${path || "$"}: ${label}`;
}

function isDisallowedKey(key) {
  const canonical = canonicalizeKey(key);
  if (ALLOWED_PRIVACY_DECLARATION_KEYS.has(canonical)) {
    return false;
  }
  return (
    DISALLOWED_KEYS.has(canonical)
    || DISALLOWED_KEY_SUFFIXES.some((suffix) => canonical.endsWith(suffix))
  );
}

function isFrameSummaryPath(path) {
  const finalSegment = path.split(".").at(-1)?.replace(/\[\d+\]$/g, "") || "";
  return canonicalizeKey(finalSegment) === "framesummary";
}

function isAllowedGitRevisionPath(path) {
  const finalSegment = path.split(".").at(-1)?.replace(/\[\d+\]$/g, "") || "";
  return canonicalizeKey(finalSegment) === "sourcerevision";
}

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
    if (isDisallowedKey(key)) {
      matches.push(fieldPath);
    }
    matches.push(...findDisallowedKeys(child, fieldPath));
  }
  return matches;
}

export function findUnexpectedFields(value, shape, prefix = "") {
  if (shape === true || value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    if (!Array.isArray(shape) || shape.length === 0) {
      return [];
    }
    return value.flatMap((item, index) =>
      findUnexpectedFields(item, shape[0], `${prefix || "$"}[${index}]`),
    );
  }

  if (typeof value !== "object" || !shape || typeof shape !== "object") {
    return [];
  }

  const matches = [];
  for (const [key, child] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (!Object.prototype.hasOwnProperty.call(shape, key)) {
      matches.push(fieldPath);
      continue;
    }
    matches.push(...findUnexpectedFields(child, shape[key], fieldPath));
  }
  return matches;
}

export function findSensitivePatterns(value) {
  const matches = [];

  function visit(child, path) {
    if (typeof child === "string") {
      if (child.trim() && isFrameSummaryPath(path) && !isAllowedEvidenceFrameSummary(child)) {
        matches.push(finding(path, "free-form frame summary"));
      }
      if (
        /^[0-9a-f]{40}$/i.test(child.trim())
        && !isAllowedGitRevisionPath(path)
      ) {
        matches.push(finding(path, "unlabeled legacy Apple device identifier"));
      }
      for (const check of SENSITIVE_STRING_CHECKS) {
        if (check.test(child)) {
          matches.push(finding(path, check.label));
        }
      }
      return;
    }

    if (!child || typeof child !== "object") {
      return;
    }

    if (Array.isArray(child)) {
      if (isLikelyByteArray(child)) {
        matches.push(finding(path, "likely raw byte array"));
        return;
      }
      if (isLikelyBase64ChunkArray(child)) {
        matches.push(finding(path, "base64 chunk array"));
        return;
      }
      child.forEach((item, index) => visit(item, `${path || "$"}[${index}]`));
      return;
    }

    for (const [key, nested] of Object.entries(child)) {
      visit(nested, path ? `${path}.${key}` : key);
    }
  }

  visit(value, "");
  return matches;
}

export function validateEvidencePrivacy(value) {
  return {
    disallowedKeys: findDisallowedKeys(value),
    sensitivePatterns: findSensitivePatterns(value),
  };
}
