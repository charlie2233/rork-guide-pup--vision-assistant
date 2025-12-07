import { useRouter, useNavigation } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { DescriptionMode, SpeechRate, useSettings } from "@/src/providers/SettingsProvider";

export default function SettingsScreen() {
  console.log("[SettingsScreen] render");

  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { settings, updateSpeechRate, updateDescriptionMode, toggleBoundingBoxes } = useSettings();

  const handleBack = useCallback(() => {
    console.log("[SettingsScreen] navigating back");
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility("Navigating back");
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace("/");
    }
  }, [router, navigation]);

  const handleSpeechRateChange = useCallback(
    (rate: SpeechRate) => {
      console.log("[SettingsScreen] speech rate changed", { rate });
      updateSpeechRate(rate);
      const rateLabel = rate === "slow" ? "Slow" : rate === "fast" ? "Fast" : "Normal";
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(`Speech rate changed to ${rateLabel}`);
      }
    },
    [updateSpeechRate],
  );

  const handleDescriptionModeChange = useCallback(
    (mode: DescriptionMode) => {
      console.log("[SettingsScreen] description mode changed", { mode });
      updateDescriptionMode(mode);
      const modeLabel = mode === "short" ? "Short" : "Detailed";
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(`Descriptions changed to ${modeLabel}`);
      }
    },
    [updateDescriptionMode],
  );

  const handleBoundingBoxesToggle = useCallback(() => {
    console.log("[SettingsScreen] bounding boxes toggled");
    const newValue = !settings.showBoundingBoxes;
    toggleBoundingBoxes();
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        newValue ? "Bounding boxes turned on" : "Bounding boxes turned off",
      );
    }
  }, [settings.showBoundingBoxes, toggleBoundingBoxes]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]} testID="settings-screen">
      <View style={styles.headerRow}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Double tap to return to main screen"
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          testID="settings-back-button"
        >
          <ChevronLeft color="#FDFDFD" size={24} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Speech</Text>
          <Text style={styles.sectionDescription}>Control how fast Guide Pup speaks.</Text>
          <View style={styles.optionsGroup}>
            <OptionButton
              label="Slow"
              selected={settings.speechRate === "slow"}
              onPress={() => handleSpeechRateChange("slow")}
              testID="settings-speech-slow"
            />
            <OptionButton
              label="Normal"
              selected={settings.speechRate === "normal"}
              onPress={() => handleSpeechRateChange("normal")}
              testID="settings-speech-normal"
            />
            <OptionButton
              label="Fast"
              selected={settings.speechRate === "fast"}
              onPress={() => handleSpeechRateChange("fast")}
              testID="settings-speech-fast"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descriptions</Text>
          <Text style={styles.sectionDescription}>Choose how much detail you want to hear.</Text>
          <View style={styles.optionsGroup}>
            <OptionButton
              label="Short"
              selected={settings.descriptionMode === "short"}
              onPress={() => handleDescriptionModeChange("short")}
              testID="settings-description-short"
            />
            <OptionButton
              label="Detailed"
              selected={settings.descriptionMode === "detailed"}
              onPress={() => handleDescriptionModeChange("detailed")}
              testID="settings-description-detailed"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug / Visual</Text>
          <Text style={styles.sectionDescription}>Advanced options for testing and troubleshooting.</Text>
          <View style={styles.toggleCard}>
            <View style={styles.toggleContent}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleLabel}>Bounding boxes</Text>
                <Text style={styles.toggleHint}>
                  Show boxes around detected objects on the camera view.
                </Text>
              </View>
              <Switch
                value={settings.showBoundingBoxes}
                onValueChange={handleBoundingBoxesToggle}
                thumbColor={Colors.palette.textPrimary}
                trackColor={{ false: "#343843", true: Colors.palette.accent }}
                accessibilityRole="switch"
                accessibilityLabel="Show bounding boxes"
                accessibilityHint="Double tap to toggle bounding boxes around detected objects"
                accessibilityState={{ checked: settings.showBoundingBoxes }}
                testID="settings-bounding-boxes-switch"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

interface OptionButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}

function OptionButton({ label, selected, onPress, testID }: OptionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionButton,
        selected && styles.optionButtonSelected,
        pressed && styles.optionButtonPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={`Double tap to select ${label}`}
      testID={testID}
    >
      <Text style={[styles.optionButtonText, selected && styles.optionButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.palette.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingRight: 8,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backButtonText: {
    color: Colors.palette.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  headerTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 26,
    fontWeight: "800",
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 36,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  sectionDescription: {
    color: Colors.palette.textMuted,
    fontSize: 17,
    lineHeight: 24,
  },
  optionsGroup: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  optionButton: {
    flex: 1,
    backgroundColor: Colors.palette.surface,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
    minHeight: 64,
  },
  optionButtonSelected: {
    backgroundColor: Colors.palette.accent,
    borderColor: Colors.palette.accent,
  },
  optionButtonPressed: {
    opacity: 0.8,
  },
  optionButtonText: {
    color: Colors.palette.textMuted,
    fontSize: 18,
    fontWeight: "700",
  },
  optionButtonTextSelected: {
    color: Colors.palette.background,
  },
  toggleCard: {
    backgroundColor: Colors.palette.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginTop: 8,
  },
  toggleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  toggleTextGroup: {
    flex: 1,
    gap: 6,
  },
  toggleLabel: {
    color: Colors.palette.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  toggleHint: {
    color: Colors.palette.textMuted,
    fontSize: 16,
    lineHeight: 22,
  },
});
