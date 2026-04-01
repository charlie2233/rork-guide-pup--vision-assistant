import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";

export function useGuidePupRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  Sentry.wrapExpoRouter(router as unknown as Parameters<typeof Sentry.wrapExpoRouter>[0]);
  return router;
}
