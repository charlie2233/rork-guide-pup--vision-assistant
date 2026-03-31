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

export async function enforceRateLimit(deviceId: string, env: Env) {
  if (!env.RATE_LIMITER) {
    return {
      allowed: true,
      limit: getRateLimitPerMinute(env),
      remaining: getRateLimitPerMinute(env),
      resetAt: new Date(Date.now() + getWindowDurationMs()).toISOString(),
    };
  }

  try {
    const stub = env.RATE_LIMITER.getByName(deviceId);
    const response = await stub.fetch("https://rate-limit.internal/check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        limit: getRateLimitPerMinute(env),
      }),
    });

    return (await response.json()) as RateLimitDecision;
  } catch (error) {
    logWarn("rate_limit.unavailable", {
      deviceId,
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      allowed: true,
      limit: getRateLimitPerMinute(env),
      remaining: getRateLimitPerMinute(env),
      resetAt: new Date(Date.now() + getWindowDurationMs()).toISOString(),
    };
  }
}
