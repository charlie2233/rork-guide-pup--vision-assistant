import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Settings;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
        });
      }
    } catch (error) {
      if (__DEV__) {
        console.error("[SettingsProvider] Failed to load settings", error);
      }
    } finally {
      setIsReady(true);
    }
  };

  const persistSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch (error) {
      if (__DEV__) {
        console.error("[SettingsProvider] Failed to save settings", error);
      }
    }
  };

  const updateSettings = useCallback((updater: (current: Settings) => Settings) => {
    setSettings((current) => {
      const next = updater(current);
      void persistSettings(next);
      return next;
    });
  }, []);

  const updateSpeechRate = useCallback((rate: SpeechRate) => {
    updateSettings((current) => ({ ...current, speechRate: rate }));
  }, [updateSettings]);

  const updateDescriptionMode = useCallback((mode: DescriptionMode) => {
    updateSettings((current) => ({ ...current, descriptionMode: mode }));
  }, [updateSettings]);

  const updateHapticsEnabled = useCallback((enabled: boolean) => {
    updateSettings((current) => ({ ...current, hapticsEnabled: enabled }));
  }, [updateSettings]);

  const toggleBoundingBoxes = useCallback(() => {
    updateSettings((current) => ({ ...current, showBoundingBoxes: !current.showBoundingBoxes }));
  }, [updateSettings]);

  const markOnboardingComplete = useCallback(() => {
    updateSettings((current) => ({ ...current, hasCompletedOnboarding: true }));
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
