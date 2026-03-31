export type RuntimeEnvironment = "development" | "staging" | "production";

export function getRuntimeEnvironment(env: Env): RuntimeEnvironment {
  const value = String(env.ENVIRONMENT || "development");
  if (value === "production" || value === "staging") {
    return value;
  }

  return "development";
}

export function isProduction(env: Env) {
  return getRuntimeEnvironment(env) === "production";
}

export function isNonProduction(env: Env) {
  return !isProduction(env);
}

export function parseBoolean(value: string | undefined, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function splitCsv(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function trimToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getCorsConfiguration(env: Env) {
  const explicitOrigins = new Set(splitCsv(env.CORS_ALLOWED_ORIGINS));
  const singleOrigin = env.CORS_ORIGIN?.trim();

  if (singleOrigin && singleOrigin !== "*") {
    explicitOrigins.add(singleOrigin);
  }

  const allowAll = getRuntimeEnvironment(env) === "development"
    && (!singleOrigin || singleOrigin === "*")
    && explicitOrigins.size === 0;

  return {
    allowAll,
    allowedOrigins: [...explicitOrigins],
  };
}

export function getDebugBenchmarkToken(env: Env) {
  return trimToUndefined(env.DEBUG_BENCHMARK_TOKEN);
}
