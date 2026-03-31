import { isNonProduction, parseBoolean } from "../lib/config";

export type ProviderAttempt = {
  apiKey: string;
  authHeader: string;
  authPrefix: string;
  baseUrl: string;
  name: string;
  path: string;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function normalizePath(value: string | undefined, fallback: string) {
  const path = (value || fallback).trim();
  if (!path) {
    return fallback;
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeAuthPrefix(value: string | undefined) {
  if (value == null) {
    return "Bearer ";
  }

  if (!value) {
    return "";
  }

  return /\s$/.test(value) ? value : `${value} `;
}

function buildAttempt(input: {
    apiKey?: string;
    authHeader?: string;
    authPrefix?: string;
    baseUrl?: string;
    name: string;
    path?: string;
  },
) {
  const baseUrl = input.baseUrl?.trim();
  const apiKey = input.apiKey?.trim();
  if (!baseUrl || !apiKey) {
    return undefined;
  }

  return {
    apiKey,
    authHeader: (input.authHeader || "authorization").trim() || "authorization",
    authPrefix: normalizeAuthPrefix(input.authPrefix),
    baseUrl: trimTrailingSlash(baseUrl),
    name: input.name,
    path: normalizePath(input.path, "/chat/completions"),
  } satisfies ProviderAttempt;
}

export function getOpenAIProviderAttempts(env: Env) {
  const attempts: ProviderAttempt[] = [];

  const gatewayAttempt = buildAttempt({
    apiKey: env.AI_GATEWAY_API_KEY || env.OPENAI_API_KEY,
    authHeader: env.AI_GATEWAY_AUTH_HEADER,
    authPrefix: env.AI_GATEWAY_AUTH_PREFIX,
    baseUrl: env.AI_GATEWAY_BASE_URL,
    name: "ai-gateway",
    path: env.AI_GATEWAY_PATH,
  });
  if (gatewayAttempt) {
    attempts.push(gatewayAttempt);
  }

  const fallbackAttempt = buildAttempt({
    apiKey: env.AI_GATEWAY_FALLBACK_API_KEY || env.OPENAI_API_KEY,
    authHeader: env.AI_GATEWAY_FALLBACK_AUTH_HEADER,
    authPrefix: env.AI_GATEWAY_FALLBACK_AUTH_PREFIX,
    baseUrl: env.AI_GATEWAY_FALLBACK_BASE_URL || env.OPENAI_BASE_URL,
    name: gatewayAttempt ? "openai-fallback" : "openai-direct",
    path: env.AI_GATEWAY_FALLBACK_PATH || "/chat/completions",
  });
  if (fallbackAttempt && (!gatewayAttempt || fallbackAttempt.baseUrl !== gatewayAttempt.baseUrl)) {
    attempts.push(fallbackAttempt);
  }

  if (attempts.length > 0) {
    return attempts;
  }

  return [
    {
      apiKey: env.OPENAI_API_KEY,
      authHeader: "authorization",
      authPrefix: "Bearer ",
      baseUrl: trimTrailingSlash(env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
      name: "openai-direct",
      path: "/chat/completions",
    },
  ].filter((attempt) => attempt.apiKey) as ProviderAttempt[];
}

export function getBenchmarkProviderNames(env: Env) {
  const providers = ["openai-compatible"];
  if (isNonProduction(env) && parseBoolean(env.EXPERIMENTAL_MINICPM_O_BENCHMARK)) {
    providers.push("huggingface-minicpm-o");
  }

  return providers;
}
