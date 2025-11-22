import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

export type SpeechRate = "slow" | "normal" | "fast";
export type DescriptionMode = "short" | "detailed";

export interface Settings {
  speechRate: SpeechRate;
  descriptionMode: DescriptionMode;
  showBoundingBoxes: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  speechRate: "normal",
  descriptionMode: "short",
  showBoundingBoxes: false,
};

const SETTINGS_KEY = "@guidepup:settings";

export const [SettingsProvider, useSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Settings;
        setSettings(parsed);
      }
    } catch (error) {
      console.error("[SettingsProvider] Failed to load settings", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error("[SettingsProvider] Failed to save settings", error);
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
    settings,
    isLoading,
    updateSpeechRate,
    updateDescriptionMode,
    toggleBoundingBoxes,
    getSpeechRateValue,
  }), [settings, isLoading, updateSpeechRate, updateDescriptionMode, toggleBoundingBoxes, getSpeechRateValue]);
});
