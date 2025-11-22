import type { DescriptionMode } from "@/src/providers/SettingsProvider";
import axios from "axios";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";

export type VisionMode = "object" | "text";

type DescribeImageSource = {
  uri: string;
  base64?: string | null;
};

type DescribeImageOptions = {
  descriptionMode?: DescriptionMode;
  lastSummary?: string;
  isContinuous?: boolean;
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
const DEFAULT_DESCRIPTION_MODE: DescriptionMode = "short";

const OBJECT_RESPONSE_FORMAT =
  "Respond like a live video narrator: start with 'Objects:' and list the most important things with LEFT/CENTER/RIGHT tags and distance (near/mid/far). " +
  "Follow with 'Action:' describing any motion, hazards, or next steps in under 15 words.";

const MODE_PROMPTS: Record<VisionMode, string> = {
  object:
    "Treat this frame as part of a live video feed for a blind user. " +
    "Detect the most salient people, obstacles, doorways, vehicles, pets, and moving objects. " +
    "Include direction (left/center/right) and proximity (near/mid/far). " +
    `${OBJECT_RESPONSE_FORMAT}`,
  text:
    "Read any visible text in this image. Preserve line order when possible, note casing that conveys emphasis, and mention context such as whether it is a sign, label, or document.",
};

const SYSTEM_PROMPT =
  "You are Guide Pup, an assistant delivering calm but energetic real-time guidance. " +
  "Focus on salient objects, hazards, and legible text. Keep answers under 60 words.";

const DESCRIPTION_MODE_PROMPTS: Record<DescriptionMode, string> = {
  short:
    "Keep the narration to one or two crisp sentences. Lead with hazards or people, then mention key landmarks.",
  detailed:
    "Offer up to four vivid sentences that paint the layout, lighting, and helpful landmarks while still highlighting hazards first.",
};

const CONTINUOUS_FEED_PROMPT =
  "Assume this frame is part of a continuous feed. Mention what changed before reaffirming anything that stayed the same.";

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

const sanitizeSummaryHint = (summary?: string): string | undefined => {
  if (!summary) {
    return undefined;
  }

  const normalized = summary.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, 280);
};

const buildInstructionPrompt = (mode: VisionMode, options: DescribeImageOptions = {}): string => {
  const detailMode: DescriptionMode = options.descriptionMode ?? DEFAULT_DESCRIPTION_MODE;
  const sections = [
    MODE_PROMPTS[mode] ?? MODE_PROMPTS.object,
    DESCRIPTION_MODE_PROMPTS[detailMode],
  ];

  if (options.isContinuous) {
    const summaryHint = sanitizeSummaryHint(options.lastSummary);
    sections.push(
      summaryHint
        ? `${CONTINUOUS_FEED_PROMPT} Your prior spoken summary was: "${summaryHint}". Highlight only meaningful differences or motion before reaffirming key context. If nothing changed, say "No change" before continuing.`
        : `${CONTINUOUS_FEED_PROMPT} If nothing important changes between frames, explicitly say "No change" before continuing.`,
    );
  }

  return sections.join(" ");
};

const completionConfigFor = (mode: VisionMode, descriptionMode?: DescriptionMode) => {
  const detailed = descriptionMode === "detailed";
  const baseTokens = mode === "text" ? 540 : 320;
  const detailMultiplier = detailed ? 1.25 : 1;

  return {
    temperature: detailed ? 0.28 : 0.18,
    maxTokens: Math.round(baseTokens * detailMultiplier),
  };
};

export async function describeImage(
  source: DescribeImageSource,
  mode: VisionMode,
  options: DescribeImageOptions = {},
): Promise<string> {
  console.log("[describeImage] describing image", {
    uri: source.uri,
    mode,
    descriptionMode: options.descriptionMode,
    continuous: options.isContinuous,
  });

  if (!source?.uri) {
    throw new Error("Missing image reference for description.");
  }

  const apiKey = resolveApiKey();
  const model = resolveModel();
  const prompt = buildInstructionPrompt(mode, options);
  const { temperature, maxTokens } = completionConfigFor(mode, options.descriptionMode);
  const base64 = await toBase64(source);

  try {
    const { data } = await openAIClient.post<ChatCompletionResponse>(
      CHAT_COMPLETIONS_PATH,
      {
        model,
        temperature,
        max_tokens: maxTokens,
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
