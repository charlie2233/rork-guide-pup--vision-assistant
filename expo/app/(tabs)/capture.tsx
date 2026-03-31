import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Droplet, Sparkles, SwitchCamera, Zap, Eye, AlertTriangle, ArrowLeft, ArrowRight, ArrowUp, Square } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { GuideAI, GuideAIDirection } from "@/src/logic/GuideAI";
import { useVoice } from "@/src/components/VoiceAnnouncer";
import { captureAppError } from "@/src/lib/sentry";

const filterOptions = ["Solstice", "Neon Drift", "Midnight Bloom"] as const;
const captureModes = ["Photo", "Video", "Story"] as const;
type CaptureMode = (typeof captureModes)[number];

const sliderRange = { min: 3200, max: 8200 } as const;
const sliderHeight = 140;

const DirectionIcon = ({ direction }: { direction: GuideAIDirection["direction"] }) => {
  const iconProps = { color: Colors.palette.textPrimary, size: 24 };
  switch (direction) {
    case "turn-left":
      return <ArrowLeft {...iconProps} />;
    case "turn-right":
      return <ArrowRight {...iconProps} />;
    case "forward":
      return <ArrowUp {...iconProps} />;
    case "stop":
      return <Square {...iconProps} />;
    default:
      return null;
  }
};

export default function CaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const sliderStartRef = useRef<number>(sliderRange.min);
  const [facing, setFacing] = useState<CameraType>("back");
  const [mode, setMode] = useState<CaptureMode>("Photo");
  const [filter, setFilter] = useState<(typeof filterOptions)[number]>(filterOptions[0]);
  const [colorBalance, setColorBalance] = useState<number>(6200);
  const [exposure, setExposure] = useState<number>(0.0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visionResult, setVisionResult] = useState<GuideAIDirection | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const { speak } = useVoice();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulse]);

  const sliderResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          sliderStartRef.current = colorBalance;
        },
        onPanResponderMove: (_, gesture) => {
          const next = sliderStartRef.current - gesture.dy * 15;
          const clamped = Math.max(sliderRange.min, Math.min(sliderRange.max, Math.round(next)));
          setColorBalance(clamped);
          console.log("Color balance adjusted", clamped);
        },
      }),
    [colorBalance]
  );

  const handleToggleFacing = useCallback(() => {
    setFacing((current) => (current === "back" ? "front" : "back"));
    console.log("Camera facing toggled");
  }, []);

  const handleModeChange = useCallback((nextMode: CaptureMode) => {
    setMode(nextMode);
    console.log("Capture mode set", nextMode);
  }, []);

  const handleExposureChange = useCallback((delta: number) => {
    setExposure((current) => {
      const updated = Math.max(-2, Math.min(2, parseFloat((current + delta).toFixed(1))));
      console.log("Exposure updated", updated);
      return updated;
    });
  }, []);

  const handleVisionAnalysis = useCallback(async () => {
    if (!cameraRef.current || isAnalyzing) return;

    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      console.log("[CaptureScreen] Taking photo for Vision AI analysis...");

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        skipProcessing: true,
      });

      if (!photo?.uri && !photo?.base64) {
        throw new Error("Failed to capture image");
      }

      console.log("[CaptureScreen] Photo captured, analyzing with Vision AI...");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const result = await GuideAI.analyzeWithVision({
        base64: photo.base64,
        height: photo.height,
        uri: photo.uri,
        width: photo.width,
      });

      if (result) {
        setVisionResult(result);
        console.log("[CaptureScreen] Vision AI result:", result);

        if (result.message) {
          speak(result.message);
        }
        if (result.sceneDescription) {
          speak(result.sceneDescription);
        }

        if (result.obstacle) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Analysis failed";
      console.error("[CaptureScreen] Vision analysis error:", errorMessage);
      void captureAppError(error, {
        screen: "CaptureScreen",
        stage: "handleVisionAnalysis",
      });
      setAnalysisError(errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing]);

  const indicatorProgress = useMemo(() => {
    return (colorBalance - sliderRange.min) / (sliderRange.max - sliderRange.min);
  }, [colorBalance]);

  const statCards = useMemo(
    () => [
      { label: "Glow", value: `${colorBalance}K`, icon: Droplet },
      {
        label: "Exposure",
        value: `${exposure > 0 ? "+" : ""}${exposure.toFixed(1)} EV`,
        icon: Zap,
      },
      { label: "Filter", value: filter, icon: Sparkles },
    ],
    [colorBalance, exposure, filter]
  );

  const renderCamera = () => {
    if (!permission) {
      return <View style={styles.camera} />;
    }

    if (!permission.granted) {
      return (
        <View style={[styles.camera, styles.permissionContainer]}>
          <Text style={styles.permissionTitle}>Lens access needed</Text>
          <Text style={styles.permissionDescription}>
            Enable your camera to capture ambient stories.
          </Text>
          <Pressable
            testID="request-permission"
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Grant access</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <CameraView
        testID="capture-camera"
        ref={cameraRef}
        style={[styles.camera, { backgroundColor: "black" }]}
        facing={facing}
        enableTorch={false}
      />
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.backgroundGlow} />
      {renderCamera()}
      <View style={[styles.overlayTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View>
            <Text style={styles.sessionLabel}>Auric session</Text>
            <Text style={styles.sessionTitle}>Golden Hour Hunt</Text>
          </View>
          <Pressable testID="toggle-facing" style={styles.iconPill} onPress={handleToggleFacing}>
            <SwitchCamera color={Colors.palette.textPrimary} size={20} />
          </Pressable>
        </View>
      </View>
      <View style={[styles.overlayBottom, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
        <View style={styles.statRow}>
          {statCards.map(({ label, value, icon: Icon }) => (
            <View key={label} style={styles.statPill} testID={`stat-pill-${label}`}>
              <Icon color={Colors.palette.accent} size={16} />
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.filterRow}>
          {filterOptions.map((option) => (
            <Pressable
              key={option}
              testID={`filter-${option}`}
              style={[styles.filterChip, option === filter && styles.filterChipActive]}
              onPress={() => {
                setFilter(option);
                console.log("Filter set", option);
              }}
            >
              <Text style={[styles.filterText, option === filter && styles.filterTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.bottomBar}>
          <View style={styles.modeSwitcher} testID="mode-switcher">
            {captureModes.map((captureMode) => (
              <Pressable
                key={captureMode}
                style={[styles.modeButton, captureMode === mode && styles.modeButtonActive]}
                onPress={() => handleModeChange(captureMode)}
              >
                <Text style={[styles.modeText, captureMode === mode && styles.modeTextActive]}>
                  {captureMode}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.captureControls}>
            <View style={styles.sliderColumn} testID="white-balance-slider">
              <View style={styles.sliderTrack} {...sliderResponder.panHandlers}>
                <Animated.View
                  style={[
                    styles.sliderIndicator,
                    { top: (1 - indicatorProgress) * (sliderHeight - 28) },
                  ]}
                />
              </View>
              <Text style={styles.sliderLabel}>Tone</Text>
            </View>
            <Animated.View
              style={[styles.shutterButton, { transform: [{ scale: pulse }] }]}
              testID="capture-shutter-button"
            >
              <Pressable 
                style={styles.shutterInner} 
                android_ripple={{ color: "rgba(0,0,0,0.2)" }}
                onPress={handleVisionAnalysis}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <ActivityIndicator color={Colors.palette.accent} size="small" />
                ) : (
                  <Eye color={Colors.palette.accent} size={28} />
                )}
              </Pressable>
            </Animated.View>
            <View style={styles.exposureColumn}>
              <Pressable
                testID="exposure-down"
                style={styles.exposureButton}
                onPress={() => handleExposureChange(-0.1)}
              >
                <Text style={styles.exposureSymbol}>-</Text>
              </Pressable>
              <Text style={styles.exposureValue}>{`${exposure > 0 ? "+" : ""}${exposure.toFixed(1)} EV`}</Text>
              <Pressable
                testID="exposure-up"
                style={styles.exposureButton}
                onPress={() => handleExposureChange(0.1)}
              >
                <Text style={styles.exposureSymbol}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {visionResult && (
          <View style={styles.visionResultCard} testID="vision-result">
            <View style={styles.visionResultHeader}>
              <View style={[styles.directionBadge, visionResult.obstacle && styles.directionBadgeWarning]}>
                <DirectionIcon direction={visionResult.direction} />
              </View>
              <View style={styles.visionResultContent}>
                <Text style={styles.visionResultDirection}>
                  {visionResult.direction.replace("-", " ").toUpperCase()}
                </Text>
                <Text style={styles.visionResultMessage}>{visionResult.message}</Text>
              </View>
              {visionResult.obstacle && (
                <AlertTriangle color={Colors.palette.accent} size={20} />
              )}
            </View>
            {visionResult.sceneDescription && (
              <Text style={styles.sceneDescription}>{visionResult.sceneDescription}</Text>
            )}
            <View style={styles.visionMetaRow}>
              {visionResult.lighting && (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{visionResult.lighting}</Text>
                </View>
              )}
              {visionResult.surfaceType && (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{visionResult.surfaceType}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {analysisError && (
          <View style={styles.errorCard} testID="vision-error">
            <AlertTriangle color="#ff6b6b" size={18} />
            <Text style={styles.errorText}>{analysisError}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.palette.background,
  },
  backgroundGlow: {
    position: "absolute",
    width: Dimensions.get("window").width * 1.5,
    height: Dimensions.get("window").width * 1.2,
    backgroundColor: Colors.palette.elevated,
    borderRadius: Dimensions.get("window").width,
    top: -Dimensions.get("window").width * 0.4,
    alignSelf: "center",
    opacity: 0.3,
    zIndex: 0,
  },
  overlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    zIndex: 10,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionLabel: {
    color: Colors.palette.textMuted,
    fontSize: 13,
    letterSpacing: 1,
  },
  sessionTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 22,
    fontWeight: "600",
  },
  iconPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5,6,13,0.4)",
  },
  camera: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  overlayBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    justifyContent: "flex-end",
    zIndex: 10,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  statPill: {
    flex: 1,
    backgroundColor: "rgba(5,6,13,0.55)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statValue: {
    color: Colors.palette.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  statLabel: {
    color: Colors.palette.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  filterChip: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(5,6,13,0.35)",
  },
  filterChipActive: {
    backgroundColor: Colors.palette.elevated,
    borderColor: Colors.palette.accent,
  },
  filterText: {
    color: Colors.palette.textMuted,
    fontSize: 14,
  },
  filterTextActive: {
    color: Colors.palette.textPrimary,
    fontWeight: "600",
  },
  bottomBar: {
    backgroundColor: "rgba(5,6,13,0.65)",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modeSwitcher: {
    flexDirection: "row",
    backgroundColor: Colors.palette.surface,
    borderRadius: 20,
    padding: 4,
    marginBottom: 18,
  },
  modeButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 8,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: Colors.palette.elevated,
  },
  modeText: {
    color: Colors.palette.textMuted,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  modeTextActive: {
    color: Colors.palette.textPrimary,
    fontWeight: "600",
  },
  captureControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sliderColumn: {
    alignItems: "center",
    gap: 12,
  },
  sliderTrack: {
    width: 36,
    height: sliderHeight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: Colors.palette.surface,
    overflow: "hidden",
    justifyContent: "flex-start",
  },
  sliderIndicator: {
    position: "absolute",
    left: 6,
    right: 6,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.palette.accent,
  },
  sliderLabel: {
    color: Colors.palette.textMuted,
    fontSize: 12,
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.palette.surface,
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.palette.background,
    alignItems: "center",
    justifyContent: "center",
  },
  exposureColumn: {
    alignItems: "center",
    gap: 6,
  },
  exposureButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.palette.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  exposureSymbol: {
    color: Colors.palette.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  exposureValue: {
    color: Colors.palette.textPrimary,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  permissionContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: Colors.palette.surface,
  },
  permissionTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  permissionDescription: {
    color: Colors.palette.textMuted,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: Colors.palette.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 22,
  },
  permissionButtonText: {
    color: Colors.palette.background,
    fontSize: 15,
    fontWeight: "600" as const,
  },
  visionResultCard: {
    backgroundColor: "rgba(5,6,13,0.85)",
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  visionResultHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  directionBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(76, 175, 80, 0.3)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  directionBadgeWarning: {
    backgroundColor: "rgba(255, 152, 0, 0.3)",
  },
  visionResultContent: {
    flex: 1,
  },
  visionResultDirection: {
    color: Colors.palette.textPrimary,
    fontSize: 16,
    fontWeight: "700" as const,
    letterSpacing: 1,
  },
  visionResultMessage: {
    color: Colors.palette.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  sceneDescription: {
    color: Colors.palette.textMuted,
    fontSize: 13,
    marginTop: 12,
    fontStyle: "italic" as const,
  },
  visionMetaRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 12,
  },
  metaChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  metaChipText: {
    color: Colors.palette.textMuted,
    fontSize: 12,
    textTransform: "capitalize" as const,
  },
  errorCard: {
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 13,
    flex: 1,
  },
});
