import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

export type SpeechRate = "slow" | "normal" | "fast";
export type DescriptionMode = "short" | "detailed";

export interface Settings {
  hasCompletedOnboarding: boolean;
  speechRate: SpeechRate;
  descriptionMode: DescriptionMode;
  showBoundingBoxes: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  hasCompletedOnboarding: false,
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

  const saveSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      if (__DEV__) {
        console.error("[SettingsProvider] Failed to save settings", error);
      }
    }
  };

  const updateSpeechRate = useCallback((rate: SpeechRate) => {
    saveSettings({ ...settings, speechRate: rate });
  }, [settings]);

  const updateDescriptionMode = useCallback((mode: DescriptionMode) => {
    saveSettings({ ...settings, descriptionMode: mode });
  }, [settings]);

  const toggleBoundingBoxes = useCallback(() => {
    saveSettings({ ...settings, showBoundingBoxes: !settings.showBoundingBoxes });
  }, [settings]);

  const markOnboardingComplete = useCallback(() => {
    saveSettings({ ...settings, hasCompletedOnboarding: true });
  }, [settings]);

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
    updateSpeechRate,
    updateDescriptionMode,
    toggleBoundingBoxes,
    getSpeechRateValue,
  }), [getSpeechRateValue, isReady, markOnboardingComplete, settings, toggleBoundingBoxes, updateDescriptionMode, updateSpeechRate]);
});
