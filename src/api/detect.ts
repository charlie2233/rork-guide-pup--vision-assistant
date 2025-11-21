import { Platform } from "react-native";

export type VisionMode = "object" | "text";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function describeImage(uri: string, mode: VisionMode): Promise<string> {
  console.log("[describeImage] starting description", { uri, mode });
  await delay(1200);
  const summary =
    mode === "object"
      ? "I see a person seated next to a table with a cup."
      : "I can read bold text on a sign just ahead.";
  console.log("[describeImage] completed", { summary, platform: Platform.OS });
  return summary;
}
