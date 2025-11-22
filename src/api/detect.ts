import axios from "axios";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";

export type VisionMode = "object" | "text";

type DescribeImageSource = {
  uri: string;
  base64?: string | null;
};

type AssistantContentBlock = {
  type?: string;
  text?: string;
};

type ChatCompletionChoice = {
  message?: {
    content?: string | AssistantContentBlock[];
  };
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
};

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const CHAT_COMPLETIONS_PATH = "/chat/completions";

const MODE_PROMPTS: Record<VisionMode, string> = {
  object:
    "Describe this scene for a blind user. Mention people, obstacles, and anything the user should be aware of. Keep it to two concise sentences.",
  text: "Read any visible text in this image. Preserve line order when possible and mention context like the type of sign.",
};

const SYSTEM_PROMPT =
  "You are Guide Pup, an assistant that provides calm, descriptive narration for blind users. " +
  "Focus on the most important objects, hazards, and text. Respond in under 60 words.";

const openAIClient = axios.create({
  baseURL: OPENAI_BASE_URL,
  timeout: 30000,
});

const env = (key: string): string | undefined => {
  const processEnv = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return processEnv?.[key];
};

const resolveApiKey = (): string => {
  const envKey =
    env("EXPO_PUBLIC_OPENAI_API_KEY") ??
    Constants.expoConfig?.extra?.openAiApiKey ??
    Constants.manifest2?.extra?.openAiApiKey;

  if (!envKey) {
    throw new Error(
      "OpenAI key not configured. Set EXPO_PUBLIC_OPENAI_API_KEY or add openAiApiKey to expo.extra.",
    );
  }

  return envKey;
};

const resolveModel = (): string => {
  return (
    env("EXPO_PUBLIC_OPENAI_MODEL") ??
    Constants.expoConfig?.extra?.openAiModel ??
    Constants.manifest2?.extra?.openAiModel ??
    DEFAULT_MODEL
  );
};

const toBase64 = async (source: DescribeImageSource): Promise<string> => {
  if (source.base64) {
    return source.base64;
  }

  return FileSystem.readAsStringAsync(source.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
};

const extractAssistantText = (payload: ChatCompletionResponse): string => {
  const message = payload.choices?.[0]?.message;
  if (!message || !message.content) {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  const firstTextBlock = message.content.find((block) => block.text?.trim());
  if (firstTextBlock?.text) {
    return firstTextBlock.text;
  }

  return message.content
    .map((block) => block.text ?? "")
    .join(" ")
    .trim();
};

export async function describeImage(
  source: DescribeImageSource,
  mode: VisionMode,
): Promise<string> {
  console.log("[describeImage] describing image", { uri: source.uri, mode });

  if (!source?.uri) {
    throw new Error("Missing image reference for description.");
  }

  const apiKey = resolveApiKey();
  const model = resolveModel();
  const prompt = MODE_PROMPTS[mode] ?? MODE_PROMPTS.object;
  const base64 = await toBase64(source);

  try {
    const { data } = await openAIClient.post<ChatCompletionResponse>(
      CHAT_COMPLETIONS_PATH,
      {
        model,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const summary = extractAssistantText(data).trim();
    console.log("[describeImage] success", { hasSummary: Boolean(summary) });
    return summary;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "[describeImage] OpenAI error",
        error.response?.status,
        error.response?.data,
      );
    } else {
      console.error("[describeImage] Unexpected error", error);
    }
    throw new Error("Vision service is unavailable right now.");
  }
}
