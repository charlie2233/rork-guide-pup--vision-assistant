import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useVoice } from "@/src/components/VoiceAnnouncer";
import Colors from "@/constants/colors";
import { GuideAI, GuideAIDirection } from "@/src/logic/GuideAI";
import { captureAppError } from "@/src/lib/sentry";
import { useGuidePupRouter } from "@/src/lib/router";
import { classifyAnalyzeError, recordCameraPermissionSnapshot } from "@/src/lib/diagnostics";
import { GuidePupNavigationCore } from "@/src/native/GuidePupNavigationCore";

const ANALYSIS_INTERVAL_MS = 4500;

type StatusTone = "neutral" | "warning" | "critical";

interface StatusBanner {
  detail: string;
  tone: StatusTone;
  title: string;
}

const initialStatus: StatusBanner = {
  detail: "Waiting for camera access.",
  tone: "neutral",
  title: "Guidance ready",
};

function getStatusColors(tone: StatusTone) {
  switch (tone) {
    case "warning":
      return {
        accent: "#FFB44C",
        background: "rgba(255,180,76,0.16)",
      };
    case "critical":
      return {
        accent: "#FF6B6B",
        background: "rgba(255,107,107,0.14)",
      };
    default:
      return {
        accent: Colors.palette.accent,
        background: "rgba(255,255,255,0.06)",
      };
  }
}

export default function NavigationScreen() {
  const router = useGuidePupRouter();
  const navigation = useNavigation();
  const { speak, isSpeaking } = useVoice();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [direction, setDirection] = useState<GuideAIDirection | null>(null);
  const [guidanceStatus, setGuidanceStatus] = useState<StatusBanner>(initialStatus);
  const [isGuiding, setIsGuiding] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const analyzingRef = useRef(false);
  const guidingRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const hasAnnouncedStartRef = useRef(false);

  useEffect(() => {
    guidingRef.current = isGuiding;
    void GuidePupNavigationCore.setCameraSessionState(isGuiding ? "running" : "paused");
  }, [isGuiding]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (!permission) {
      return;
    }

    recordCameraPermissionSnapshot({
      canAskAgain: permission.canAskAgain,
      expires: permission.expires,
      granted: permission.granted,
      status: permission.status,
    });

    if (!permission.granted) {
      setDirection(null);
      setGuidanceStatus({
        detail:
          "Guide Pup needs camera access to analyze the scene. The shipping path does not request microphone access.",
        tone: "critical",
        title: "Camera access needed",
      });
      return;
    }

    if (isGuiding) {
      setGuidanceStatus({
        detail: "Analyzing your surroundings.",
        tone: "neutral",
        title: "Guidance active",
      });

      if (!hasAnnouncedStartRef.current) {
        hasAnnouncedStartRef.current = true;
        speak("Guidance started. Analyzing your surroundings.");
      }
    }
  }, [isGuiding, permission, speak]);

  useEffect(() => {
    if (permission?.status === "undetermined") {
      void requestPermission();
    }
  }, [permission?.status, requestPermission]);

  const analyzeCurrentFrame = useCallback(async () => {
    if (analyzingRef.current || !guidingRef.current) {
      return;
    }

    if (!cameraRef.current) {
      return;
    }

    try {
      analyzingRef.current = true;

      const frame = await GuidePupNavigationCore.captureFrame(cameraRef.current);
      const result = await GuideAI.analyzeWithVision(frame);

      if (!guidingRef.current || !result) {
        return;
      }

      setDirection(result);

      if (result.direction === "stop" || result.obstacle) {
        setGuidanceStatus({
          detail: result.message || "Guide Pup stopped guidance until the path is clear.",
          tone: "warning",
          title: "Safe STOP active",
        });
      } else {
        setGuidanceStatus({
          detail: result.message || "Analyzing surroundings.",
          tone: "neutral",
          title: "Guidance active",
        });
      }

      if (result.message && !isSpeakingRef.current) {
        speak(result.message);
      }

      void GuidePupNavigationCore.emitGuidanceCue({
        direction: result.direction,
        obstacle: result.obstacle,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const failureClass = classifyAnalyzeError(errorMessage);
      const fallbackMessage =
        failureClass === "timeout"
          ? "Guide Pup timed out and switched to a safe stop. Hold still and retry in a moment."
          : failureClass === "unauthorized"
            ? "Guide Pup refreshed your session and switched to a safe stop."
            : failureClass === "invalid-response"
              ? "Guide Pup received an invalid result and switched to a safe stop."
              : "Guide Pup lost the backend connection and switched to a safe stop.";

      setGuidanceStatus({
        detail: fallbackMessage,
        tone: "critical",
        title:
          failureClass === "timeout"
            ? "Backend timeout"
            : failureClass === "unauthorized"
              ? "Session expired"
              : failureClass === "invalid-response"
                ? "Invalid backend response"
              : "Backend unavailable",
      });
      setDirection(null);
      if (!isSpeakingRef.current) {
        speak(fallbackMessage);
      }

      void captureAppError(error, {
        screen: "NavigationScreen",
        stage: "analyzeCurrentFrame",
      });
    } finally {
      analyzingRef.current = false;
    }
  }, [speak]);

  useEffect(() => {
    if (!isGuiding || !permission?.granted) {
      return;
    }

    const startDelay = setTimeout(() => {
      void analyzeCurrentFrame();
    }, 2000);

    const intervalId = setInterval(() => {
      void analyzeCurrentFrame();
    }, ANALYSIS_INTERVAL_MS);

    return () => {
      clearTimeout(startDelay);
      clearInterval(intervalId);
    };
  }, [analyzeCurrentFrame, isGuiding, permission?.granted]);

  const handleStop = useCallback(() => {
    setIsGuiding(false);
    guidingRef.current = false;
    setDirection(null);
    setGuidanceStatus({
      detail: "Guide Pup is paused. Return when you are ready to continue.",
      tone: "neutral",
      title: "Guidance stopped",
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speak("Stopping guidance.");

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace("/");
    }
  }, [navigation, router, speak]);

  const handleSOS = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    speak("Emergency SOS activated.");
  }, [speak]);

  const canOpenCameraSettings = typeof Linking.openSettings === "function" && Platform.OS !== "web";

  const openCameraSettings = useCallback(() => {
    if (typeof Linking.openSettings === "function") {
      void Linking.openSettings();
    }
  }, []);

  return (
    <View style={styles.container}>
      {permission?.granted ? (
        <CameraView
          ref={cameraRef}
          style={styles.hiddenCamera}
          facing="back"
          enableTorch={false}
        />
      ) : null}

      <SafeAreaView style={styles.safeArea}>
        {permission?.granted ? (
          <Pressable
            onLongPress={handleSOS}
            onPress={handleStop}
            style={styles.touchable}
            accessibilityLabel="Navigation screen"
            accessibilityHint="Tap to stop guidance. Long press for SOS."
          >
            <View style={styles.content}>
              <StatusBannerView banner={guidanceStatus} />

              <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.innerCircle} />
              </Animated.View>

              <Text style={styles.statusText}>{isGuiding ? "Guiding..." : "Stopped"}</Text>

              {direction ? (
                <Text style={styles.directionText}>
                  {direction.direction.replace("-", " ").toUpperCase()}
                </Text>
              ) : null}

              {direction?.message ? <Text style={styles.messageText}>{direction.message}</Text> : null}

              {direction?.sceneDescription ? (
                <Text style={styles.sceneText}>{direction.sceneDescription}</Text>
              ) : null}

              <Text style={styles.safetyNote}>
                Guide Pup provides assistive guidance and can stop with STOP when the scene is unclear.
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.permissionState}>
            <StatusBannerView banner={guidanceStatus} />

            <View style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>Camera access is required</Text>
              <Text style={styles.permissionBody}>
                Guide Pup sends compressed camera frames to the backend for navigation analysis. The
                shipping path does not request microphone access.
              </Text>

              <View style={styles.permissionActions}>
                <Pressable
                  onPress={handleStop}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Return to home"
                  accessibilityHint="Double tap to stop guidance and return to the home screen"
                  testID="navigation-return-home"
                >
                  <Text style={styles.secondaryButtonText}>Return</Text>
                </Pressable>

                <Pressable
                  onPress={() => void requestPermission()}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Request camera access"
                  accessibilityHint="Double tap to ask for camera permission again"
                  testID="navigation-request-camera"
                >
                  <Text style={styles.primaryButtonText}>Request access</Text>
                </Pressable>

                {canOpenCameraSettings ? (
                  <Pressable
                    onPress={openCameraSettings}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Open camera settings"
                    accessibilityHint="Double tap to open the app settings page"
                    testID="navigation-open-settings"
                  >
                    <Text style={styles.secondaryButtonText}>Open Settings</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Text style={styles.safetyNote}>
              Guide Pup stops safely when the scene is unclear or the backend is unavailable.
            </Text>
          </View>
        )}

        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>
            {permission?.granted
              ? `Tap to stop${Platform.OS !== "web" ? " | Long press for SOS" : ""}`
              : "Grant camera access to start guidance"}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function StatusBannerView({ banner }: { banner: StatusBanner }) {
  const colors = getStatusColors(banner.tone);

  return (
    <View style={[styles.statusBanner, { backgroundColor: colors.background, borderColor: colors.accent }]}>
      <Text style={[styles.statusBannerTitle, { color: colors.accent }]}>{banner.title}</Text>
      <Text style={styles.statusBannerDetail}>{banner.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  hiddenCamera: {
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
  },
  safeArea: {
    flex: 1,
  },
  touchable: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  permissionState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  statusBanner: {
    alignSelf: "stretch",
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  statusBannerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusBannerDetail: {
    color: "#222222",
    fontSize: 15,
    lineHeight: 21,
  },
  pulseCircle: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    borderRadius: 100,
    height: 200,
    justifyContent: "center",
    marginBottom: 28,
    width: 200,
  },
  innerCircle: {
    backgroundColor: "#111111",
    borderRadius: 75,
    height: 150,
    width: 150,
  },
  statusText: {
    color: "#111111",
    fontSize: 48,
    fontWeight: "700",
    marginBottom: 8,
  },
  directionText: {
    color: "#222222",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 12,
  },
  messageText: {
    color: "#333333",
    fontSize: 20,
    lineHeight: 28,
    textAlign: "center",
  },
  sceneText: {
    color: "#888888",
    fontSize: 15,
    fontStyle: "italic",
    marginTop: 16,
    textAlign: "center",
  },
  safetyNote: {
    color: "#555555",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 18,
    textAlign: "center",
  },
  permissionCard: {
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    padding: 24,
  },
  permissionTitle: {
    color: "#111111",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  permissionBody: {
    color: "#333333",
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
  },
  permissionActions: {
    gap: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#F1F1F1",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#111111",
    fontSize: 17,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  bottomHint: {
    alignItems: "center",
    paddingBottom: 24,
  },
  hintText: {
    color: "#AAAAAA",
    fontSize: 14,
  },
});
