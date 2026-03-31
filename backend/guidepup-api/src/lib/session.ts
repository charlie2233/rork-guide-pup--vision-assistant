const DEV_FALLBACK_SIGNING_SECRET = "guidepup-local-dev-secret-change-me";

type SessionPayload = {
  deviceId: string;
  exp: number;
  iat: number;
  v: 1;
};

function getSessionTtlSeconds(env: Env) {
  const parsed = Number.parseInt(env.SESSION_TTL_SECONDS || "86400", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 86400;
}

function getSigningSecret(env: Env) {
  if (env.BOOTSTRAP_SIGNING_SECRET) {
    return env.BOOTSTRAP_SIGNING_SECRET;
  }

  if ((env.ENVIRONMENT || "development") !== "production") {
    return DEV_FALLBACK_SIGNING_SECRET;
  }

  throw new Error("BOOTSTRAP_SIGNING_SECRET is required in production.");
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
    new TextEncoder().encode(getSigningSecret(env)),
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
  const [version, encodedPayload, encodedSignature] = token.split(".");
  if (version !== "v1" || !encodedPayload || !encodedSignature) {
    return false;
  }

  const key = await importSigningKey(env);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload)),
  );
  const actual = decodeBase64Url(encodedSignature);

  if (!timingSafeEqual(expected, actual)) {
    return false;
  }

  const payloadJson = new TextDecoder().decode(decodeBase64Url(encodedPayload));
  const payload = JSON.parse(payloadJson) as SessionPayload;

  if (payload.deviceId !== deviceId || payload.exp < Math.floor(Date.now() / 1000)) {
    return false;
  }

  return true;
}
