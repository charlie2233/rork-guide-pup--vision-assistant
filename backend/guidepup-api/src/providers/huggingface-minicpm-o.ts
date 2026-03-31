import type { ProviderInput, ProviderResult, VisionProvider } from "./types";

export class HuggingFaceMiniCPMOProvider implements VisionProvider {
  readonly name = "huggingface-minicpm-o";
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async analyze(_input: ProviderInput, _env: Env): Promise<ProviderResult> {
    throw new Error(
      "The HuggingFace MiniCPM-o adapter is scaffolded but not wired to a production inference endpoint yet.",
    );
  }
}

export function createHuggingFaceMiniCPMOProvider(env: Env) {
  return new HuggingFaceMiniCPMOProvider(env.HUGGINGFACE_MINICPM_O_MODEL || "openbmb/MiniCPM-o-2_6");
}
