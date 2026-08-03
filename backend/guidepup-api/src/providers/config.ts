import { isNonProduction, parseBoolean } from "../lib/config";

export type ProviderAttempt = {
  apiKey: string;
  authHeader: string;
  authPrefix: string;
  baseUrl: string;
  name: string;
  path: string;
};

const OPENAI_ORIGIN = "https://api.openai.com";
const OPENAI_BASE_URL = `${OPENAI_ORIGIN}/v1`;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function normalizePath(value: string | undefined, fallback: string) {
  const path = (value || fallback).trim();
  if (!path) {
    return fallback;
  }

  if (path.includes("?") || path.includes("#") || /[\r\n]/.test(path)) {
    throw new Error("Provider path must not contain query, fragment, or newline data.");
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

  if (/[\r\n]/.test(value)) {
    throw new Error("Provider authentication prefix is invalid.");
  }

  return /\s$/.test(value) ? value : `${value} `;
}

function normalizeAuthHeader(value: string | undefined) {
  const header = (value || "authorization").trim() || "authorization";
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header)) {
    throw new Error("Provider authentication header is invalid.");
  }
  return header;
}

function parseAllowedOrigins(value: string | undefined) {
  const origins = new Set([OPENAI_ORIGIN]);
  for (const candidate of (value || "").split(",").map((item) => item.trim()).filter(Boolean)) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error("Provider allowlist contains an invalid origin.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    ) {
      throw new Error("Provider allowlist entries must be credential-free HTTPS origins.");
    }
    origins.add(parsed.origin);
  }
  return origins;
}

function normalizeProviderBaseUrl(value: string, allowedOrigins: Set<string>) {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Provider base URL is invalid.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Provider base URL must use HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Provider base URL must not contain credentials, query data, or fragments.");
  }
  if (!allowedOrigins.has(parsed.origin)) {
    throw new Error("Provider base URL origin is not allowlisted.");
  }
  return trimTrailingSlash(parsed.toString());
}

function buildAttempt(input: {
    allowedOrigins: Set<string>;
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
    authHeader: normalizeAuthHeader(input.authHeader),
    authPrefix: normalizeAuthPrefix(input.authPrefix),
    baseUrl: normalizeProviderBaseUrl(baseUrl, input.allowedOrigins),
    name: input.name,
    path: normalizePath(input.path, "/chat/completions"),
  } satisfies ProviderAttempt;
}

export function getOpenAIProviderAttempts(env: Env) {
  const attempts: ProviderAttempt[] = [];
  const allowedOrigins = parseAllowedOrigins(env.PROVIDER_ALLOWED_ORIGINS);
  const gatewayBaseUrl = env.AI_GATEWAY_BASE_URL?.trim();
  const customFallbackBaseUrl = env.AI_GATEWAY_FALLBACK_BASE_URL?.trim();

  if (gatewayBaseUrl && !env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error("AI_GATEWAY_API_KEY is required when AI_GATEWAY_BASE_URL is configured.");
  }
  const gatewayAttempt = gatewayBaseUrl
    ? buildAttempt({
      allowedOrigins,
      apiKey: env.AI_GATEWAY_API_KEY,
      authHeader: env.AI_GATEWAY_AUTH_HEADER,
      authPrefix: env.AI_GATEWAY_AUTH_PREFIX,
      baseUrl: gatewayBaseUrl,
      name: "ai-gateway",
      path: env.AI_GATEWAY_PATH,
    })
    : undefined;
  if (gatewayAttempt) {
    attempts.push(gatewayAttempt);
  }

  if (customFallbackBaseUrl && !env.AI_GATEWAY_FALLBACK_API_KEY?.trim()) {
    throw new Error("AI_GATEWAY_FALLBACK_API_KEY is required when AI_GATEWAY_FALLBACK_BASE_URL is configured.");
  }
  if (customFallbackBaseUrl) {
    const customFallbackAttempt = buildAttempt({
      allowedOrigins,
      apiKey: env.AI_GATEWAY_FALLBACK_API_KEY,
      authHeader: env.AI_GATEWAY_FALLBACK_AUTH_HEADER,
      authPrefix: env.AI_GATEWAY_FALLBACK_AUTH_PREFIX,
      baseUrl: customFallbackBaseUrl,
      name: "configured-fallback",
      path: env.AI_GATEWAY_FALLBACK_PATH,
    });
    if (customFallbackAttempt) {
      attempts.push(customFallbackAttempt);
    }
  } else if (env.OPENAI_API_KEY?.trim()) {
    const configuredOpenAIBaseUrl = env.OPENAI_BASE_URL?.trim() || OPENAI_BASE_URL;
    const parsedOpenAIBaseUrl = normalizeProviderBaseUrl(configuredOpenAIBaseUrl, allowedOrigins);
    if (new URL(parsedOpenAIBaseUrl).origin !== OPENAI_ORIGIN) {
      throw new Error("OPENAI_API_KEY may only be sent to api.openai.com.");
    }
    const directAttempt = buildAttempt({
      allowedOrigins,
      apiKey: env.OPENAI_API_KEY,
      authHeader: "authorization",
      authPrefix: "Bearer ",
      baseUrl: parsedOpenAIBaseUrl,
      name: gatewayAttempt ? "openai-fallback" : "openai-direct",
      path: "/chat/completions",
    });
    if (directAttempt) {
      attempts.push(directAttempt);
    }
  }

  if (attempts.length > 0) {
    return attempts;
  }

  return [];
}

export function getBenchmarkProviderNames(env: Env) {
  const providers = ["openai-compatible"];
  if (isNonProduction(env) && parseBoolean(env.EXPERIMENTAL_MINICPM_O_BENCHMARK)) {
    providers.push("huggingface-minicpm-o");
  }

  return providers;
}
