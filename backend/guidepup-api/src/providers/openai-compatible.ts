import { buildVisionSystemPrompt, buildVisionUserPrompt } from "../lib/prompts";
import { ProviderVisionSchema } from "../schemas/vision";
import type { ProviderInput, ProviderResult, VisionProvider } from "./types";

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
  model?: string;
};

function getBaseUrl(env: Env) {
  return (env.AI_GATEWAY_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/g, "");
}

function getApiKey(env: Env) {
  const apiKey = env.AI_GATEWAY_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return apiKey;
}

function getModel(env: Env) {
  return env.OPENAI_MODEL || "gpt-4.1-mini";
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

export class OpenAICompatibleProvider implements VisionProvider {
  readonly name = "openai-compatible";
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async analyze(input: ProviderInput, env: Env): Promise<ProviderResult> {
    const startedAt = Date.now();
    const response = await fetch(`${getBaseUrl(env)}/chat/completions`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${getApiKey(env)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        response_format: {
          type: "json_object",
        },
        temperature: 0.1,
        max_tokens: 500,
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
                text: buildVisionUserPrompt(),
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
      throw new Error(`OpenAI-compatible provider failed (${response.status}): ${body.slice(0, 240)}`);
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    const text = extractTextContent(payload.choices?.[0]?.message?.content);
    const parsed = ProviderVisionSchema.parse(JSON.parse(extractJsonObject(text)));

    return {
      latencyMs: Date.now() - startedAt,
      model: payload.model || this.model,
      parsed,
      provider: this.name,
      rawText: text,
    };
  }
}

export function createOpenAICompatibleProvider(env: Env) {
  return new OpenAICompatibleProvider(getModel(env));
}
