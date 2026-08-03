import { DurableObject } from "cloudflare:workers";
import { logWarn } from "./logging";
import { getBootstrapSigningSecret } from "./session";

const STORAGE_KEY = "rate-limit-state";

type RateLimitState = {
  count: number;
  windowStartMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  reason: "allowed" | "limit-exceeded" | "infrastructure-unavailable";
  remaining: number;
  resetAt: string;
};

const RATE_LIMIT_BOUNDS = {
  analyzeDevice: { fallback: 20, max: 60, min: 1 },
  analyzeIp: { fallback: 60, max: 300, min: 10 },
  bootstrap: { fallback: 10, max: 60, min: 1 },
  providerGlobal: { fallback: 120, max: 600, min: 20 },
} as const;

function parseBoundedLimit(
  value: string | undefined,
  bounds: { fallback: number; max: number; min: number },
) {
  const parsed = Number.parseInt(value || "", 10);
  const candidate = Number.isFinite(parsed) ? parsed : bounds.fallback;
  return Math.min(Math.max(candidate, bounds.min), bounds.max);
}

function getWindowDurationMs() {
  return 60_000;
}

export function getRateLimitPerMinute(env: Env) {
  return parseBoundedLimit(env.RATE_LIMIT_PER_MINUTE, RATE_LIMIT_BOUNDS.analyzeDevice);
}

export function getAnalyzeIpRateLimitPerMinute(env: Env) {
  return parseBoundedLimit(env.ANALYZE_IP_RATE_LIMIT_PER_MINUTE, RATE_LIMIT_BOUNDS.analyzeIp);
}

export function getBootstrapRateLimitPerMinute(env: Env) {
  return parseBoundedLimit(env.BOOTSTRAP_RATE_LIMIT_PER_MINUTE, RATE_LIMIT_BOUNDS.bootstrap);
}

export function getProviderGlobalCallLimitPerMinute(env: Env) {
  return parseBoundedLimit(env.PROVIDER_GLOBAL_CALL_LIMIT_PER_MINUTE, RATE_LIMIT_BOUNDS.providerGlobal);
}

export function getRateLimitCaps(env: Env) {
  return {
    analyzeDevicePerMinute: getRateLimitPerMinute(env),
    analyzeIpPerMinute: getAnalyzeIpRateLimitPerMinute(env),
    bootstrapIpPerMinute: getBootstrapRateLimitPerMinute(env),
    providerCallsGlobalPerMinute: getProviderGlobalCallLimitPerMinute(env),
  };
}

function unavailableDecision(limit: number): RateLimitDecision {
  return {
    allowed: false,
    limit,
    reason: "infrastructure-unavailable",
    remaining: 0,
    resetAt: new Date(Date.now() + getWindowDurationMs()).toISOString(),
  };
}

function parseRateLimitDecision(value: unknown): RateLimitDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rate limiter returned an invalid decision.");
  }

  const candidate = value as Partial<RateLimitDecision>;
  const { allowed, limit, remaining, resetAt } = candidate;
  if (
    typeof allowed !== "boolean" ||
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit <= 0 ||
    typeof remaining !== "number" ||
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    typeof resetAt !== "string" ||
    Number.isNaN(Date.parse(resetAt))
  ) {
    throw new Error("Rate limiter returned an invalid decision.");
  }

  return {
    allowed,
    limit,
    reason: allowed ? "allowed" : "limit-exceeded",
    remaining,
    resetAt,
  };
}

export class DeviceRateLimiter extends DurableObject<Env> {
  async fetch(request: Request) {
    const payload = (await request.json()) as { limit: number };
    const now = Date.now();
    const windowStartMs = Math.floor(now / getWindowDurationMs()) * getWindowDurationMs();
    const state = await this.ctx.storage.get<RateLimitState>(STORAGE_KEY);
    const nextState =
      state && state.windowStartMs === windowStartMs
        ? { ...state, count: state.count + 1 }
        : { count: 1, windowStartMs };

    await this.ctx.storage.put(STORAGE_KEY, nextState);
    await this.ctx.storage.setAlarm(windowStartMs + getWindowDurationMs());

    const decision: RateLimitDecision = {
      allowed: nextState.count <= payload.limit,
      limit: payload.limit,
      reason: nextState.count <= payload.limit ? "allowed" : "limit-exceeded",
      remaining: Math.max(payload.limit - nextState.count, 0),
      resetAt: new Date(windowStartMs + getWindowDurationMs()).toISOString(),
    };

    return new Response(JSON.stringify(decision), {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

async function enforceRateLimitForSubject(subject: string, env: Env, limit: number) {
  if (!env.RATE_LIMITER) {
    logWarn("rate_limit.unavailable", {
      deviceId: subject,
      message: "Rate limiter binding is unavailable.",
    });
    return unavailableDecision(limit);
  }

  try {
    const stub = env.RATE_LIMITER.getByName(subject);
    const response = await stub.fetch("https://rate-limit.internal/check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        limit,
      }),
    });

    if (!response.ok) {
      throw new Error(`Rate limiter failed (${response.status}).`);
    }

    return parseRateLimitDecision(await response.json());
  } catch (error) {
    logWarn("rate_limit.unavailable", {
      deviceId: subject,
      message: error instanceof Error ? error.message : String(error),
    });

    return unavailableDecision(limit);
  }
}

export async function enforceRateLimit(deviceId: string, env: Env) {
  return enforceRateLimitForSubject(deviceId, env, getRateLimitPerMinute(env));
}

async function hashBootstrapSubject(value: string, env: Env) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getBootstrapSigningSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function enforceBootstrapRateLimit(request: Request, env: Env) {
  const limit = getBootstrapRateLimitPerMinute(env);
  try {
    const clientAddress = request.headers.get("cf-connecting-ip")?.trim() || "unavailable";
    const subjectHash = await hashBootstrapSubject(`guidepup-bootstrap:${clientAddress}`, env);
    return enforceRateLimitForSubject(`bootstrap:${subjectHash}`, env, limit);
  } catch (error) {
    logWarn("rate_limit.subject_hash_unavailable", {
      message: error instanceof Error ? error.message : String(error),
      scope: "bootstrap",
    });
    return unavailableDecision(limit);
  }
}

export async function enforceAnalyzeIpRateLimit(request: Request, env: Env) {
  const limit = getAnalyzeIpRateLimitPerMinute(env);
  try {
    const clientAddress = request.headers.get("cf-connecting-ip")?.trim() || "unavailable";
    const subjectHash = await hashBootstrapSubject(`guidepup-analyze:${clientAddress}`, env);
    return enforceRateLimitForSubject(`analyze-ip:${subjectHash}`, env, limit);
  } catch (error) {
    logWarn("rate_limit.subject_hash_unavailable", {
      message: error instanceof Error ? error.message : String(error),
      scope: "analyze-ip",
    });
    return unavailableDecision(limit);
  }
}

export async function enforceProviderCallLimit(env: Env) {
  return enforceRateLimitForSubject(
    "provider-calls:global:v1",
    env,
    getProviderGlobalCallLimitPerMinute(env),
  );
}
