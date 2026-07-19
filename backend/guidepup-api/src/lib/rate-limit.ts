import { DurableObject } from "cloudflare:workers";
import { logWarn } from "./logging";

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

function getWindowDurationMs() {
  return 60_000;
}

export function getRateLimitPerMinute(env: Env) {
  const parsed = Number.parseInt(env.RATE_LIMIT_PER_MINUTE || "20", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

export function getBootstrapRateLimitPerMinute() {
  return 10;
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
    new TextEncoder().encode(env.BOOTSTRAP_SIGNING_SECRET || "guidepup-bootstrap-rate-limit-v1"),
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
  const clientAddress = request.headers.get("cf-connecting-ip")?.trim() || "unavailable";
  const subjectHash = await hashBootstrapSubject(`guidepup-bootstrap:${clientAddress}`, env);
  return enforceRateLimitForSubject(
    `bootstrap:${subjectHash}`,
    env,
    getBootstrapRateLimitPerMinute(),
  );
}
