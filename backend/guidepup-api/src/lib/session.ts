const DEV_FALLBACK_SIGNING_SECRET = "guidepup-local-dev-secret-change-me";
const BETA_SESSION_TTL_SECONDS = 60 * 60;
const MIN_BETA_SESSION_TTL_SECONDS = 15 * 60;
const MAX_BETA_SESSION_TTL_SECONDS = 4 * 60 * 60;
const MAX_DEVELOPMENT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_SESSION_TOKEN_CHARACTERS = 2048;
const MAX_SESSION_PAYLOAD_CHARACTERS = 1024;
const MAX_SESSION_SIGNATURE_CHARACTERS = 128;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type SessionPayload = {
  deviceId: string;
  exp: number;
  iat: number;
  v: 1;
};

export function getSessionTtlSeconds(env: Env) {
  const environment = env.ENVIRONMENT || "development";
  const isBetaEnvironment = environment === "staging" || environment === "production";
  const fallback = isBetaEnvironment ? BETA_SESSION_TTL_SECONDS : 24 * 60 * 60;
  const maximum = isBetaEnvironment ? MAX_BETA_SESSION_TTL_SECONDS : MAX_DEVELOPMENT_SESSION_TTL_SECONDS;
  const minimum = isBetaEnvironment ? MIN_BETA_SESSION_TTL_SECONDS : 5 * 60;
  const parsed = Number.parseInt(env.SESSION_TTL_SECONDS || "", 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(value, minimum), maximum);
}

export function getBootstrapSigningSecret(env: Env) {
  const configured = env.BOOTSTRAP_SIGNING_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if ((env.ENVIRONMENT || "development") === "development") {
    return DEV_FALLBACK_SIGNING_SECRET;
  }

  throw new Error("BOOTSTRAP_SIGNING_SECRET is required outside development.");
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function importSigningKey(env: Env) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getBootstrapSigningSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a[index] ^ b[index];
  }

  return result === 0;
}

export async function issueSessionToken(deviceId: string, env: Env) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = getSessionTtlSeconds(env);
  const payload: SessionPayload = {
    deviceId,
    exp: nowSeconds + ttlSeconds,
    iat: nowSeconds,
    v: 1,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadEncoded = encodeBase64Url(new TextEncoder().encode(payloadJson));
  const key = await importSigningKey(env);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadEncoded));
  const token = `v1.${payloadEncoded}.${encodeBase64Url(new Uint8Array(signature))}`;

  return {
    expiresAt: new Date((payload.exp) * 1000).toISOString(),
    issuedAt: new Date((payload.iat) * 1000).toISOString(),
    sessionToken: token,
  };
}

export async function verifySessionToken(token: string, deviceId: string, env: Env) {
  if (
    typeof token !== "string"
    || token.length === 0
    || token.length > MAX_SESSION_TOKEN_CHARACTERS
  ) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [version, encodedPayload, encodedSignature] = parts;
  if (
    version !== "v1"
    || !encodedPayload
    || encodedPayload.length > MAX_SESSION_PAYLOAD_CHARACTERS
    || !BASE64_URL_PATTERN.test(encodedPayload)
    || !encodedSignature
    || encodedSignature.length > MAX_SESSION_SIGNATURE_CHARACTERS
    || !BASE64_URL_PATTERN.test(encodedSignature)
  ) {
    return false;
  }

  let actual: Uint8Array;
  try {
    actual = decodeBase64Url(encodedSignature);
  } catch {
    return false;
  }

  const key = await importSigningKey(env);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload)),
  );

  if (!timingSafeEqual(expected, actual)) {
    return false;
  }

  let payload: SessionPayload;
  try {
    const payloadJson = new TextDecoder().decode(decodeBase64Url(encodedPayload));
    payload = JSON.parse(payloadJson) as SessionPayload;
  } catch {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !payload
    || typeof payload !== "object"
    || payload.v !== 1
    || payload.deviceId !== deviceId
    || !Number.isInteger(payload.iat)
    || !Number.isInteger(payload.exp)
    || payload.iat > nowSeconds + 5 * 60
    || payload.exp <= nowSeconds
    || payload.exp <= payload.iat
  ) {
    return false;
  }

  return true;
}
