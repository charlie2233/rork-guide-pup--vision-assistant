import Constants from "expo-constants";
import { useNavigation } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import React, { useCallback, useEffect, useRef } from "react";
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
import { InfoLinkButton } from "@/src/components/InfoLinkButton";
import { useGuidePupRouter } from "@/src/lib/router";
import { DescriptionMode, SpeechRate, useSettings } from "@/src/providers/SettingsProvider";

export default function SettingsScreen() {
  const router = useGuidePupRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {
    settings,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
    toggleBoundingBoxes,
  } = useSettings();
  const diagnosticsTapCountRef = useRef(0);
  const diagnosticsTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appVersion = Constants.expoConfig?.version || "Not found in repo";
  const buildVersion =
    Constants.expoConfig?.ios?.buildNumber ||
    String(Constants.expoConfig?.android?.versionCode || "Not found in repo");
  const versionLabel = `${appVersion} (${buildVersion})`;

  useEffect(() => {
    return () => {
      if (diagnosticsTapTimerRef.current) {
        clearTimeout(diagnosticsTapTimerRef.current);
      }
    };
  }, []);

  const handleBack = useCallback(() => {
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
      updateDescriptionMode(mode);
      const modeLabel = mode === "short" ? "Short" : "Detailed";
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(`Descriptions changed to ${modeLabel}`);
      }
    },
    [updateDescriptionMode],
  );

  const handleBoundingBoxesToggle = useCallback(() => {
    const newValue = !settings.showBoundingBoxes;
    toggleBoundingBoxes();
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        newValue ? "Bounding boxes turned on" : "Bounding boxes turned off",
      );
    }
  }, [settings.showBoundingBoxes, toggleBoundingBoxes]);

  const handleHapticsToggle = useCallback(() => {
    const nextValue = !settings.hapticsEnabled;
    updateHapticsEnabled(nextValue);
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(
        nextValue ? "Haptics turned on" : "Haptics turned off",
      );
    }
  }, [settings.hapticsEnabled, updateHapticsEnabled]);

  const openDiagnostics = useCallback(() => {
    router.push("/diagnostics" as never);
  }, [router]);

  const handleVersionPress = useCallback(() => {
    diagnosticsTapCountRef.current += 1;

    if (!diagnosticsTapTimerRef.current) {
      diagnosticsTapTimerRef.current = setTimeout(() => {
        diagnosticsTapCountRef.current = 0;
        diagnosticsTapTimerRef.current = null;
      }, 1200);
    }

    if (diagnosticsTapCountRef.current >= 5) {
      diagnosticsTapCountRef.current = 0;
      if (diagnosticsTapTimerRef.current) {
        clearTimeout(diagnosticsTapTimerRef.current);
        diagnosticsTapTimerRef.current = null;
      }

      openDiagnostics();
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility("Diagnostics opened");
      }
    }
  }, [openDiagnostics]);

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
          <Text style={styles.sectionTitle}>Guidance feedback</Text>
          <Text style={styles.sectionDescription}>Touch fallback controls for haptics and tester-only overlays.</Text>
          <View style={styles.toggleCard}>
            <View style={styles.toggleContent}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleLabel}>Haptics</Text>
                <Text style={styles.toggleHint}>
                  Vibrations that confirm spoken guidance and voice-command changes.
                </Text>
              </View>
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={handleHapticsToggle}
                thumbColor={Colors.palette.textPrimary}
                trackColor={{ false: "#343843", true: Colors.palette.accent }}
                accessibilityRole="switch"
                accessibilityLabel="Haptics"
                accessibilityHint="Double tap to turn haptic guidance on or off"
                accessibilityState={{ checked: settings.hapticsEnabled }}
                testID="settings-haptics-switch"
              />
            </View>
          </View>

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & safety</Text>
          <Text style={styles.sectionDescription}>
            Review how Guide Pup handles camera frames, support requests, and emergency fallback.
          </Text>
          <View style={styles.linkGroup}>
            <InfoLinkButton
              accessibilityHint="Double tap to open the privacy policy page"
              accessibilityLabel="Privacy Policy"
              description="Read how camera frames and anonymous device data are handled."
              onPress={() => router.push("/privacy" as never)}
              testID="settings-privacy-link"
              title="Privacy Policy"
            />
            <InfoLinkButton
              accessibilityHint="Double tap to open the support page"
              accessibilityLabel="Support"
              description="Get help with setup, audio, or unexpected behavior."
              onPress={() => router.push("/support" as never)}
              testID="settings-support-link"
              title="Support"
            />
            <InfoLinkButton
              accessibilityHint="Double tap to open the safety disclaimer page"
              accessibilityLabel="Safety / emergency"
              description="Read the assistive guidance and emergency disclaimer."
              onPress={() => router.push("/safety" as never)}
              testID="settings-safety-link"
              title="Safety / emergency"
            />
          </View>
        </View>

        <Pressable
          onPress={handleVersionPress}
          accessibilityRole="button"
          accessibilityLabel="App version"
          accessibilityHint="Double tap to view app version information"
          style={({ pressed }) => [styles.versionCard, pressed && styles.versionCardPressed]}
          testID="settings-version-row"
        >
          <View style={styles.versionTextGroup}>
            <Text style={styles.versionLabel}>Version</Text>
            <Text style={styles.versionValue}>{versionLabel}</Text>
          </View>
          <Text style={styles.versionBadge}>App info</Text>
        </Pressable>
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
  linkGroup: {
    gap: 12,
  },
  versionCard: {
    alignItems: "center",
    backgroundColor: Colors.palette.surface,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    padding: 20,
  },
  versionCardPressed: {
    opacity: 0.85,
  },
  versionTextGroup: {
    gap: 6,
  },
  versionLabel: {
    color: Colors.palette.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  versionValue: {
    color: Colors.palette.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  versionBadge: {
    color: Colors.palette.accent,
    fontSize: 14,
    fontWeight: "700",
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
