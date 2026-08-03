import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

export type SpeechRate = "slow" | "normal" | "fast";
export type DescriptionMode = "short" | "detailed";

export interface Settings {
  hasCompletedOnboarding: boolean;
  hapticsEnabled: boolean;
  speechRate: SpeechRate;
  descriptionMode: DescriptionMode;
  showBoundingBoxes: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  hasCompletedOnboarding: false,
  hapticsEnabled: true,
  speechRate: "normal",
  descriptionMode: "short",
  showBoundingBoxes: false,
};

const SETTINGS_KEY = "@guidepup:settings";
const StoredSettingsSchema = z.object({
  descriptionMode: z.enum(["short", "detailed"]).optional(),
  hapticsEnabled: z.boolean().optional(),
  hasCompletedOnboarding: z.boolean().optional(),
  showBoundingBoxes: z.boolean().optional(),
  speechRate: z.enum(["slow", "normal", "fast"]).optional(),
}).strict();

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const loadOperation = persistenceQueueRef.current.then(loadSettings);
    persistenceQueueRef.current = loadOperation;
    void loadOperation;
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = StoredSettingsSchema.parse(JSON.parse(stored));
        const loadedSettings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
        settingsRef.current = loadedSettings;
        setSettings(loadedSettings);
      }
    } catch (error) {
      if (__DEV__) {
        console.error("[SettingsProvider] Failed to load settings", error);
      }
    } finally {
      setIsReady(true);
    }
  };

  const updateSettings = useCallback((updater: (current: Settings) => Settings): Promise<boolean> => {
    const operation = persistenceQueueRef.current.then(async () => {
      const next = updater(settingsRef.current);

      try {
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        settingsRef.current = next;
        setSettings(next);
        return true;
      } catch (error) {
        if (__DEV__) {
          console.error("[SettingsProvider] Failed to save settings", error);
        }
        return false;
      }
    });

    persistenceQueueRef.current = operation.then(() => undefined);
    return operation;
  }, []);

  const updateSpeechRate = useCallback((rate: SpeechRate) => {
    return updateSettings((current) => ({ ...current, speechRate: rate }));
  }, [updateSettings]);

  const updateDescriptionMode = useCallback((mode: DescriptionMode) => {
    return updateSettings((current) => ({ ...current, descriptionMode: mode }));
  }, [updateSettings]);

  const updateHapticsEnabled = useCallback((enabled: boolean) => {
    return updateSettings((current) => ({ ...current, hapticsEnabled: enabled }));
  }, [updateSettings]);

  const toggleBoundingBoxes = useCallback(() => {
    return updateSettings((current) => ({ ...current, showBoundingBoxes: !current.showBoundingBoxes }));
  }, [updateSettings]);

  const markOnboardingComplete = useCallback(() => {
    return updateSettings((current) => ({ ...current, hasCompletedOnboarding: true }));
  }, [updateSettings]);

  const getSpeechRateValue = useCallback((): number => {
    switch (settings.speechRate) {
      case "slow":
        return 0.7;
      case "fast":
        return 1.2;
      default:
        return 0.9;
    }
  }, [settings.speechRate]);

  return useMemo(() => ({
    isReady,
    markOnboardingComplete,
    settings,
    updateHapticsEnabled,
    updateSpeechRate,
    updateDescriptionMode,
    toggleBoundingBoxes,
    getSpeechRateValue,
  }), [
    getSpeechRateValue,
    isReady,
    markOnboardingComplete,
    settings,
    toggleBoundingBoxes,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
  ]);
});
