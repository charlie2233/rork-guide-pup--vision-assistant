import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { CameraView as Camera, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { describeImage, VisionMode } from "@/src/api/detect";

export default function MainScreen() {
  console.log("[MainScreen] render");

  const insets = useSafeAreaInsets();
  const cameraRef = useRef<React.ComponentRef<typeof Camera> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSummaryRef = useRef<string>("Ready.");

  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [isDescribing, setIsDescribing] = useState<boolean>(false);
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  const [scanMode, setScanMode] = useState<VisionMode>("object");
  const [statusMessage, setStatusMessage] = useState<string>("Ready.");

  const [permission, requestPermission] = useCameraPermissions();
  const permissionGranted = useMemo(() => Boolean(permission?.granted), [permission?.granted]);

  useEffect(() => {
    if (!permission) {
      requestPermission().catch((error) => {
        console.log("[MainScreen] Permission request failed", error);
      });
    }
  }, [permission, requestPermission]);

  const updateStatus = useCallback(
    (message: string, options?: { speak?: boolean }) => {
      console.log("[MainScreen] status update", { message });
      setStatusMessage(message);
      const shouldSpeak = options?.speak ?? true;

      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(message);
      }

      if (shouldSpeak) {
        Speech.stop();
        Speech.speak(message, {
          language: "en-US",
          pitch: 1,
          rate: 0.9,
        });
      }
    },
    [],
  );

  const describeScene = useCallback(async () => {
    if (isDescribing) {
      console.log("[MainScreen] Already describing, skipping tap");
      return;
    }

    if (!permissionGranted) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      updateStatus("Camera permission needed. Please enable it in Settings.");
      return;
    }

    if (!cameraRef.current || !cameraReady) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      updateStatus("Camera not ready yet. Hold steady.");
      return;
    }

    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setIsDescribing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, skipProcessing: true });

      if (!photo?.uri) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        updateStatus("I couldn't capture the scene. Please try again.");
        return;
      }

      const summary = await describeImage(photo.uri, scanMode);

      if (summary && summary !== lastSummaryRef.current) {
        lastSummaryRef.current = summary;
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        updateStatus(summary);
      } else if (!summary) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        updateStatus("I couldn't see clearly. Try again.");
      }
    } catch (error) {
      console.error("[MainScreen] describeScene error", error);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      updateStatus("I couldn't see clearly. Please try again.");
    } finally {
      setIsDescribing(false);
    }
  }, [cameraReady, isDescribing, permissionGranted, scanMode, updateStatus]);

  useEffect(() => {
    if (!continuousMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      describeScene();
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [continuousMode, describeScene]);

  const handleContinuousToggle = useCallback(
    (value: boolean) => {
      console.log("[MainScreen] Continuous mode toggled", { value });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setContinuousMode(value);
      const message = value ? "Continuous mode on." : "Continuous mode off.";
      Speech.speak(message, {
        language: "en-US",
        pitch: 1,
        rate: 0.9,
      });
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(message);
      }
    },
    [],
  );

  const handleModeChange = useCallback(
    (mode: VisionMode) => {
      console.log("[MainScreen] Scan mode changed", { mode });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setScanMode(mode);
      const message = mode === "object" ? "Object mode selected." : "Text mode selected.";
      Speech.speak(message, {
        language: "en-US",
        pitch: 1,
        rate: 0.9,
      });
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(message);
      }
    },
    [],
  );

  const handleSettingsPress = useCallback(() => {
    console.log("[MainScreen] Settings pressed");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const message = "Settings not available yet.";
    Speech.speak(message, {
      language: "en-US",
      pitch: 1,
      rate: 0.9,
    });
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, []);

  const handlePermissionPrompt = useCallback(() => {
    console.log("[MainScreen] prompting for permission again");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    updateStatus("Camera permission needed. Please open device settings.");
    requestPermission().catch((error) => {
      console.log("[MainScreen] Permission prompt error", error);
    });
  }, [requestPermission, updateStatus]);

  const describeButtonLabel = isDescribing ? "Describing…" : "Describe scene";
  const isObjectMode = scanMode === "object";

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="main-screen">
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

      <View
        style={styles.statusBadge}
        testID="main-status"
        accessible
        accessibilityLabel={`Status: ${statusMessage}`}
      >
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>

      <View style={styles.cameraShell}>
        {permissionGranted ? (
          <Camera
            ref={(node: React.ComponentRef<typeof Camera> | null) => {
              cameraRef.current = node;
            }}
            facing="back"
            style={styles.camera}
            onCameraReady={() => {
              console.log("[MainScreen] Camera ready");
              setCameraReady(true);
            }}
            testID="main-camera-preview"
          />
        ) : (
          <View style={styles.permissionPrompt} testID="main-permission-prompt">
            <Text style={styles.permissionTitle}>Camera permission not granted</Text>
            <Text style={styles.permissionDescription}>Enable access so Guide Pup can describe your surroundings.</Text>
            <Pressable
              onPress={handlePermissionPrompt}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              accessibilityHint="Double tap to grant camera permission"
              style={({ pressed }) => [styles.permissionButton, pressed && styles.permissionButtonPressed]}
              testID="main-permission-button"
            >
              <Text style={styles.permissionButtonText}>Open settings</Text>
            </Pressable>
          </View>
        )}
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
            accessibilityRole="switch"
            accessibilityLabel="Continuous mode"
            accessibilityHint="Double tap to turn continuous descriptions on or off"
            accessibilityState={{ checked: continuousMode }}
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
        onPress={describeScene}
        accessibilityRole="button"
        accessibilityLabel="Describe scene"
        accessibilityHint="Double tap to hear what is in front of you"
        accessibilityState={{ busy: isDescribing }}
        disabled={isDescribing}
        style={({ pressed }) => [
          styles.primaryButton,
          (pressed || isDescribing) && styles.primaryButtonPressed,
          !permissionGranted && styles.primaryButtonDisabled,
        ]}
        testID="main-describe-button"
      >
        <Text style={styles.primaryButtonText}>{describeButtonLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05060B",
    paddingHorizontal: 24,
    gap: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  appTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  settingsButton: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 60,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  settingsButtonPressed: {
    opacity: 0.8,
  },
  settingsButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  statusBadge: {
    backgroundColor: "#0E1019",
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderColor: "#F5C63C",
    minHeight: 80,
    justifyContent: "center",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "600",
  },
  cameraShell: {
    flex: 1,
    backgroundColor: "#090B14",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  permissionPrompt: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  permissionTitle: {
    color: "#FDFDFD",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  permissionDescription: {
    color: "#C2C6D4",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: "#F5C63C",
    borderRadius: 30,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  permissionButtonPressed: {
    opacity: 0.85,
  },
  permissionButtonText: {
    color: "#1A1302",
    fontSize: 18,
    fontWeight: "700",
  },
  togglesCard: {
    backgroundColor: "#090B14",
    borderRadius: 28,
    padding: 26,
    gap: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
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
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  toggleDescription: {
    color: "#D0D4E0",
    fontSize: 17,
    lineHeight: 24,
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
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#F5C63C",
  },
  segmentText: {
    color: "#AEB4C5",
    fontSize: 18,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#1A1302",
  },
  primaryButton: {
    backgroundColor: "#F5C63C",
    borderRadius: 40,
    paddingVertical: 28,
    alignItems: "center",
    minHeight: 80,
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#1A1302",
  },
  primaryButtonPressed: {
    opacity: 0.75,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#1A1302",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
