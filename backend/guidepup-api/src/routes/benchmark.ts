import { getDebugBenchmarkToken, getRuntimeEnvironment } from "../lib/config";
import { jsonResponse } from "../lib/http";
import { normalizeProviderVision } from "../lib/normalize";
import { logInfo, logWarn } from "../lib/logging";
import { getPromptVersion } from "../lib/prompts";
import { getBenchmarkProviderNamesForEnv } from "../providers";
import { createHuggingFaceMiniCPMOProvider } from "../providers/huggingface-minicpm-o";
import { createOpenAICompatibleProvider } from "../providers/openai-compatible";
import {
  BenchmarkVisionRequestSchema,
  BenchmarkVisionResponseSchema,
  type BenchmarkVisionResult,
} from "../schemas/benchmark";

function getBenchmarkProvider(env: Env, providerName: "openai-compatible" | "huggingface-minicpm-o") {
  if (providerName === "huggingface-minicpm-o") {
    return createHuggingFaceMiniCPMOProvider(env);
  }

  return createOpenAICompatibleProvider(env);
}

export async function handleBenchmark(request: Request, env: Env, requestId: string) {
  const runtimeEnvironment = getRuntimeEnvironment(env);
  if (runtimeEnvironment === "production") {
    return jsonResponse(request, env, {
      error: {
        code: "not_found",
        message: "Route not found.",
      },
    }, { status: 404 });
  }

  const debugToken = getDebugBenchmarkToken(env);
  const providedToken = request.headers.get("x-guidepup-debug-token")?.trim();
  if (runtimeEnvironment === "staging" && !debugToken) {
    return jsonResponse(request, env, {
      error: {
        code: "benchmark_disabled",
        message: "Provider benchmark is disabled in this environment.",
      },
    }, { status: 403 });
  }

  if (debugToken && providedToken !== debugToken) {
    return jsonResponse(request, env, {
      error: {
        code: "unauthorized",
        message: "Missing or invalid benchmark debug token.",
      },
    }, { status: 401 });
  }

  const body = BenchmarkVisionRequestSchema.parse(await request.json());
  const promptVersion = getPromptVersion(env);
  const availableProviders = getBenchmarkProviderNamesForEnv(env);
  const requestedProviders = body.providers.filter((provider) => availableProviders.includes(provider));
  if (requestedProviders.length === 0) {
    return jsonResponse(request, env, {
      availableProviders,
      error: {
        code: "invalid_provider_request",
        message: "No requested benchmark providers are enabled for this environment.",
      },
    }, { status: 400 });
  }

  const results: BenchmarkVisionResult[] = [];
  for (const providerName of requestedProviders) {
    const provider = getBenchmarkProvider(env, providerName);
    let totalLatencyMs = 0;
    let successCount = 0;
    let latestResult: BenchmarkVisionResult | undefined;

    for (let sampleIndex = 0; sampleIndex < body.samples; sampleIndex += 1) {
      try {
        const providerResult = await provider.analyze({
          detail: body.detail,
          frameId: `benchmark-${sampleIndex + 1}`,
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
          promptVersion,
          sessionId: `benchmark-${requestId}`,
          sourceHeight: body.sourceHeight,
          sourceWidth: body.sourceWidth,
          timestampMs: Date.now(),
        }, env);

        const normalized = normalizeProviderVision(providerResult.parsed, {
          latencyMs: providerResult.latencyMs,
          model: providerResult.model,
          promptVersion,
          provider: providerResult.provider,
        });

        totalLatencyMs += providerResult.latencyMs;
        successCount += 1;
        latestResult = {
          averageLatencyMs: Math.round(totalLatencyMs / successCount),
          confidence: normalized.confidence,
          direction: normalized.direction,
          hazardLevel: normalized.hazardLevel,
          model: providerResult.model,
          provider: providerName,
          samples: body.samples,
          transport: providerResult.transport,
          valid: true,
        };
      } catch (error) {
        logWarn("vision.benchmark.provider_failed", {
          message: error instanceof Error ? error.message : String(error),
          provider: providerName,
          requestId,
          sampleIndex,
        });

        latestResult = {
          averageLatencyMs: successCount > 0 ? Math.round(totalLatencyMs / successCount) : 0,
          error: error instanceof Error ? error.message : String(error),
          provider: providerName,
          samples: body.samples,
          valid: false,
        };
      }
    }

    results.push(latestResult || {
      averageLatencyMs: 0,
      error: "Benchmark did not execute.",
      provider: providerName,
      samples: body.samples,
      valid: false,
    });
  }

  const response = BenchmarkVisionResponseSchema.parse({
    apiVersion: "v1",
    environment: runtimeEnvironment === "staging" ? "staging" : "development",
    promptVersion,
    requestedProviders,
    results,
  });

  logInfo("vision.benchmark", {
    promptVersion,
    requestId,
    requestedProviders,
    results,
  });

  return jsonResponse(request, env, response);
}
