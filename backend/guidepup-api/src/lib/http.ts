import { getCorsConfiguration } from "./config";

function getAllowedOrigin(request: Request, env: Env) {
  const requestOrigin = request.headers.get("origin")?.trim();
  const { allowAll, allowedOrigins } = getCorsConfiguration(env);

  if (allowAll) {
    return requestOrigin || "*";
  }

  if (!requestOrigin) {
    return undefined;
  }

  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return undefined;
}

function corsHeaders(request: Request, env: Env) {
  const allowedOrigin = getAllowedOrigin(request, env);
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, content-type, x-guidepup-device-id, x-guidepup-debug-token",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": allowedOrigin || "",
    "access-control-expose-headers": "x-rate-limit-limit, x-rate-limit-remaining, x-rate-limit-reset-at",
    "access-control-max-age": "86400",
    "vary": "origin",
  };

  if (!allowedOrigin) {
    delete headers["access-control-allow-origin"];
  }

  return headers;
}

export function handleOptions(request: Request, env: Env) {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}

export function jsonResponse(
  request: Request | undefined,
  env: Env,
  data: unknown,
  options: {
    headers?: Record<string, string>;
    status?: number;
  } = {},
) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    ...(request ? corsHeaders(request, env) : {}),
    ...options.headers,
  });

  return new Response(JSON.stringify(data), {
    status: options.status ?? 200,
    headers,
  });
}
