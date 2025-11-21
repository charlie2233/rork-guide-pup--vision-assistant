import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

const statusSamples = [
  "Ready.",
  "Last: I saw a chair and an open doorway ahead.",
  "Lighting is low. Move closer to your subject.",
] as const;

type ScanMode = "object" | "text";

export default function MainScreen() {
  console.log("[MainScreen] render");
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<ScanMode>("object");
  const [statusIndex, setStatusIndex] = useState<number>(0);
  const isObjectMode = scanMode === "object";
  const statusText = useMemo(() => statusSamples[statusIndex], [statusIndex]);

  const handleDescribePress = useCallback(() => {
    console.log("[MainScreen] Describe scene pressed", { continuousMode, scanMode });
    setStatusIndex((prev) => (prev + 1) % statusSamples.length);
  }, [continuousMode, scanMode]);

  const handleContinuousToggle = useCallback((value: boolean) => {
    console.log("[MainScreen] Continuous mode toggled", { value });
    setContinuousMode(value);
  }, []);

  const handleModeChange = useCallback((mode: ScanMode) => {
    console.log("[MainScreen] Scan mode changed", { mode });
    setScanMode(mode);
  }, []);

  const handleSettingsPress = useCallback(() => {
    console.log("[MainScreen] Settings pressed");
  }, []);

  return (
    <View style={styles.container} testID="main-screen">
      <View style={styles.headerRow}>
        <Text style={styles.appTitle}>Guide Pup</Text>
        <Pressable
          onPress={handleSettingsPress}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          accessibilityHint="Double tap to adjust Guide Pup preferences"
          style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
          testID="main-settings-button"
        >
          <Text style={styles.settingsButtonText}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.statusBadge} testID="main-status" accessible accessibilityLabel={`Status: ${statusText}`}>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      <View style={styles.cameraShell} testID="main-camera-preview">
        <Text style={styles.cameraCaption}>Camera preview</Text>
        <Text style={styles.cameraHelper}>Visible for helpers. Voice feedback stays primary.</Text>
      </View>

      <View style={styles.togglesCard} testID="main-toggle-card">
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelGroup}>
            <Text style={styles.toggleTitle}>Continuous mode</Text>
            <Text style={styles.toggleDescription}>Keep hearing updates hands-free.</Text>
          </View>
          <Switch
            value={continuousMode}
            onValueChange={handleContinuousToggle}
            thumbColor="#05060B"
            trackColor={{ false: "#343843", true: "#F5C63C" }}
            testID="main-continuous-switch"
          />
        </View>
        <View style={styles.modeSegment} testID="main-mode-segment">
          <Pressable
            onPress={() => handleModeChange("object")}
            style={[styles.segmentButton, isObjectMode && styles.segmentButtonActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: isObjectMode }}
            accessibilityLabel="Object mode"
            accessibilityHint="Describe people and objects"
            testID="segment-object-mode"
          >
            <Text style={[styles.segmentText, isObjectMode && styles.segmentTextActive]}>Object mode</Text>
          </Pressable>
          <Pressable
            onPress={() => handleModeChange("text")}
            style={[styles.segmentButton, !isObjectMode && styles.segmentButtonActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: !isObjectMode }}
            accessibilityLabel="Text mode"
            accessibilityHint="Read signs and documents"
            testID="segment-text-mode"
          >
            <Text style={[styles.segmentText, !isObjectMode && styles.segmentTextActive]}>Text mode</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={handleDescribePress}
        accessibilityRole="button"
        accessibilityLabel="Describe scene"
        accessibilityHint="Double tap to hear what is in front of you"
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        testID="main-describe-button"
      >
        <Text style={styles.primaryButtonText}>{continuousMode ? "Describing..." : "Describe scene"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05060B",
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 36,
    gap: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  appTitle: {
    color: "#FDFDFD",
    fontSize: 26,
    fontWeight: "800",
  },
  settingsButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  settingsButtonPressed: {
    opacity: 0.8,
  },
  settingsButtonText: {
    color: "#FDFDFD",
    fontSize: 16,
    fontWeight: "600",
  },
  statusBadge: {
    backgroundColor: "#0E1019",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statusText: {
    color: "#F5F7FF",
    fontSize: 18,
    lineHeight: 24,
  },
  cameraShell: {
    flex: 1,
    backgroundColor: "#090B14",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    padding: 24,
    justifyContent: "space-between",
  },
  cameraCaption: {
    color: "#FDFDFD",
    fontSize: 20,
    fontWeight: "700",
  },
  cameraHelper: {
    color: "#C2C6D4",
    fontSize: 16,
    lineHeight: 22,
  },
  togglesCard: {
    backgroundColor: "#090B14",
    borderRadius: 28,
    padding: 22,
    gap: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  toggleLabelGroup: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: "#FDFDFD",
    fontSize: 18,
    fontWeight: "700",
  },
  toggleDescription: {
    color: "#B4B9C9",
    fontSize: 16,
    lineHeight: 22,
  },
  modeSegment: {
    flexDirection: "row",
    backgroundColor: "#05060B",
    borderRadius: 22,
    padding: 6,
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#F5C63C",
  },
  segmentText: {
    color: "#AEB4C5",
    fontSize: 16,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#1A1302",
  },
  primaryButton: {
    backgroundColor: "#F5C63C",
    borderRadius: 36,
    paddingVertical: 22,
    alignItems: "center",
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: "#1A1302",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
