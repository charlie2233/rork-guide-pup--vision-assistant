import { handleOptions, jsonResponse } from "./lib/http";
import { logError } from "./lib/logging";
import { reportBackendError } from "./lib/sentry";
import { handleBootstrap } from "./routes/bootstrap";
import { handleBenchmark } from "./routes/benchmark";
import { handleHealth } from "./routes/health";
import { handleAnalyze } from "./routes/analyze";
import { DeviceRateLimiter } from "./lib/rate-limit";

function notFound(request: Request, env: Env) {
  return jsonResponse(request, env, {
    error: {
      code: "not_found",
      message: "Route not found.",
    },
  }, { status: 404 });
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const optionsResponse = handleOptions(request, env);
    if (optionsResponse) {
      return optionsResponse;
    }

    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return handleHealth(request, env, requestId);
      }

      if (request.method === "POST" && url.pathname === "/v1/device/bootstrap") {
        return await handleBootstrap(request, env, requestId);
      }

      if (request.method === "POST" && url.pathname === "/v1/vision/analyze") {
        return await handleAnalyze(request, env, ctx, requestId);
      }

      if (request.method === "POST" && url.pathname === "/__debug/provider-benchmark") {
        return await handleBenchmark(request, env, requestId);
      }

      return notFound(request, env);
    } catch (error) {
      logError("request.unhandled_error", {
        message: error instanceof Error ? error.message : String(error),
        requestId,
        route: url.pathname,
      });
      reportBackendError(error, {
        requestId,
        route: url.pathname,
      }, env, ctx);

      return jsonResponse(request, env, {
        error: {
          code: "internal_error",
          message: "Internal server error.",
        },
      }, { status: 500 });
    }
  },
};

export { DeviceRateLimiter };
export default worker;
