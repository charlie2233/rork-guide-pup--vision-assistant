import { buildVisionSystemPrompt, buildVisionUserPrompt, ProviderVisionJsonSchema } from "../lib/prompts";
import { logWarn } from "../lib/logging";
import { ProviderVisionSchema } from "../schemas/vision";
import { getOpenAIProviderAttempts } from "./config";
import type { ProviderInput, ProviderResult, VisionProvider } from "./types";

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
      refusal?: string;
    };
  }>;
  model?: string;
};

function getModel(env: Env) {
  return env.OPENAI_MODEL || "gpt-5.5";
}

function getReasoningEffort(env: Env, model: string) {
  if (!model.startsWith("gpt-5")) {
    return undefined;
  }

  return env.OPENAI_REASONING_EFFORT || "low";
}

function extractTextContent(content: string | Array<{ text?: string; type?: string }> | undefined) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => item.text || "").join("\n");
  }

  return "";
}

function extractJsonObject(text: string) {
  const stripped = text.replace(/```json|```/gi, "").trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Provider did not return a JSON object.");
  }

  return stripped.slice(firstBrace, lastBrace + 1);
}

async function analyzeWithAttempt(
  input: ProviderInput,
  attempt: ReturnType<typeof getOpenAIProviderAttempts>[number],
  model: string,
  env: Env,
) {
  const startedAt = Date.now();
  const reasoningEffort = getReasoningEffort(env, model);
  const response = await fetch(`${attempt.baseUrl}${attempt.path}`, {
    method: "POST",
    headers: {
      [attempt.authHeader]: `${attempt.authPrefix}${attempt.apiKey}`.trim(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "guidepup_navigation_vision",
          strict: true,
          schema: ProviderVisionJsonSchema,
        },
      },
      max_completion_tokens: 700,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      messages: [
        {
          role: "system",
          content: buildVisionSystemPrompt(input.promptVersion),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildVisionUserPrompt(input),
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.imageBase64}`,
                detail: input.detail,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${attempt.name} failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  const message = payload.choices?.[0]?.message;
  if (message?.refusal) {
    throw new Error(`Provider refused vision analysis: ${message.refusal.slice(0, 160)}`);
  }
  const text = extractTextContent(message?.content);
  const parsed = ProviderVisionSchema.parse(JSON.parse(extractJsonObject(text)));

  return {
    latencyMs: Date.now() - startedAt,
    model: payload.model || model,
    parsed,
    rawText: text,
    transport: attempt.name,
  } satisfies Omit<ProviderResult, "provider">;
}

export class OpenAICompatibleProvider implements VisionProvider {
  readonly name = "openai-compatible";
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async analyze(input: ProviderInput, env: Env): Promise<ProviderResult> {
    const attempts = getOpenAIProviderAttempts(env);
    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        const result = await analyzeWithAttempt(input, attempt, this.model, env);
        return {
          ...result,
          provider: this.name,
        };
      } catch (error) {
        logWarn("vision.provider_attempt_failed", {
          attempt: attempt.name,
          message: error instanceof Error ? error.message : String(error),
          provider: this.name,
        });
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("OpenAI-compatible provider failed without a typed error.");
  }
}

export function createOpenAICompatibleProvider(env: Env) {
  return new OpenAICompatibleProvider(getModel(env));
}
