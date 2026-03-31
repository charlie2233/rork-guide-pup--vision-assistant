import { createHuggingFaceMiniCPMOProvider } from "./huggingface-minicpm-o";
import { createOpenAICompatibleProvider } from "./openai-compatible";

export function getVisionProvider(env: Env) {
  switch (String(env.VISION_PROVIDER)) {
    case "huggingface-minicpm-o":
      return createHuggingFaceMiniCPMOProvider(env);
    case "openai-compatible":
    default:
      return createOpenAICompatibleProvider(env);
  }
}

export function getProviderSummary(env: Env) {
  if (String(env.VISION_PROVIDER) === "huggingface-minicpm-o") {
    return {
      model: env.HUGGINGFACE_MINICPM_O_MODEL || "openbmb/MiniCPM-o-2_6",
      provider: "huggingface-minicpm-o",
    };
  }

  return {
    model: env.OPENAI_MODEL || "gpt-4.1-mini",
    provider: "openai-compatible",
  };
}
