function corsHeaders(env: Env) {
  return {
    "access-control-allow-headers": "authorization, content-type, x-guidepup-device-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": env.CORS_ORIGIN || "*",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

export function handleOptions(request: Request, env: Env) {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  });
}

export function jsonResponse(
  env: Env,
  data: unknown,
  options: {
    headers?: Record<string, string>;
    status?: number;
  } = {},
) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(env),
    ...options.headers,
  });

  return new Response(JSON.stringify(data), {
    status: options.status ?? 200,
    headers,
  });
}
