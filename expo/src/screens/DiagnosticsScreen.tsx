import { useNavigation } from "expo-router";
import { ChevronLeft, FileText, RefreshCw, Share2 } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { fetchHealthCheck } from "@/src/lib/api";
import {
  buildDiagnosticsReport,
  formatDiagnosticsEventSummary,
  getAnalyzeExecutionPath,
  useDiagnostics,
} from "@/src/lib/diagnostics";
import { useGuidePupRouter } from "@/src/lib/router";

type StateTone = "neutral" | "warning" | "critical";

function toneColor(tone: StateTone) {
  switch (tone) {
    case "warning":
      return "#FFB44C";
    case "critical":
      return "#FF6B6B";
    default:
      return Colors.palette.accent;
  }
}

function formatMs(value?: number) {
  if (typeof value !== "number") {
    return "Not found in repo";
  }

  return `${Math.round(value)}ms`;
}

function formatTimestamp(value?: number) {
  if (typeof value !== "number") {
    return "Not found in repo";
  }

  return new Date(value).toLocaleString();
}

export default function DiagnosticsScreen() {
  const router = useGuidePupRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const diagnostics = useDiagnostics();
  const [isRunningHealthCheck, setIsRunningHealthCheck] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [healthMessage, setHealthMessage] = useState<string>("No health check has run yet.");

  const report = useMemo(() => buildDiagnosticsReport(diagnostics), [diagnostics]);
  const voiceInvariantPass =
    diagnostics.voice.unexpectedSpeechListeningOverlapCount === 0
    && (!diagnostics.voice.speechListeningOverlapActive
      || diagnostics.voice.lastSpeechListeningOverlapReason === "stop-barge-in");

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace("/settings" as never);
  }, [navigation, router]);

  const handleHealthCheck = useCallback(async () => {
    setIsRunningHealthCheck(true);
    setHealthMessage("Checking backend health...");
    setShareError(null);

    try {
      const result = await fetchHealthCheck();
      setHealthMessage(`Backend healthy. ${result.defaultProvider} responded in ${Math.round(result.latencyMs)}ms.`);
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility("Backend health check completed.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Health check failed.";
      setHealthMessage(message);
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility("Backend health check failed.");
      }
    } finally {
      setIsRunningHealthCheck(false);
    }
  }, []);

  const handleShare = useCallback(async () => {
    try {
      setShareError(null);
      if (Platform.OS === "web" && globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(report);
        setHealthMessage("Diagnostics report copied to clipboard.");
        return;
      }

      await Share.share({
        message: report,
        title: "Guide Pup Diagnostics",
      });
      setHealthMessage("Diagnostics report opened in the share sheet.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to share diagnostics.";
      setShareError(message);
      Alert.alert("Share failed", message);
    }
  }, [report]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]} testID="diagnostics-screen">
      <View style={styles.headerRow}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Double tap to return to Settings"
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          testID="diagnostics-back-button"
        >
          <ChevronLeft color="#FDFDFD" size={24} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Diagnostics</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <InfoCard tone="neutral" title="Runtime">
          <KeyValue label="App" value={diagnostics.runtime.appName} />
          <KeyValue label="Version" value={diagnostics.runtime.appVersion || "Not found in repo"} />
          <KeyValue label="Build" value={diagnostics.runtime.buildVersion || "Not found in repo"} />
          <KeyValue label="Environment" value={diagnostics.runtime.appEnv} />
          <KeyValue label="Release track" value={diagnostics.runtime.releaseTrack} />
          <KeyValue label="API base URL" value={diagnostics.runtime.apiBaseUrl || "Not configured"} />
          <KeyValue label="Sentry" value={diagnostics.runtime.sentryEnabled ? "enabled" : "disabled"} />
          <KeyValue
            label="Experimental tabs"
            value={diagnostics.runtime.experimentalTabsEnabled ? "enabled" : "disabled"}
          />
          <KeyValue
            label="Privacy URL"
            value={diagnostics.runtime.privacyPolicyUrl || "Not found in repo"}
          />
          <KeyValue label="Website" value={diagnostics.runtime.websiteUrl || "Not found in repo"} />
          <KeyValue label="Support email" value={diagnostics.runtime.supportEmail || "Not found in repo"} />
          <KeyValue label="Support URL" value={diagnostics.runtime.supportUrl || "Not found in repo"} />
        </InfoCard>

        <InfoCard
          tone={diagnostics.cameraPermission?.granted ? "neutral" : "warning"}
          title="Camera"
        >
          <KeyValue
            label="Permission"
            value={
              diagnostics.cameraPermission
                ? `${diagnostics.cameraPermission.status} (${diagnostics.cameraPermission.granted ? "granted" : "not granted"})`
                : "Not checked yet"
            }
          />
          <KeyValue
            label="Can ask again"
            value={diagnostics.cameraPermission ? String(diagnostics.cameraPermission.canAskAgain) : "Not found in repo"}
          />
        </InfoCard>

        <InfoCard
          tone={diagnostics.session.status === "failed" ? "critical" : diagnostics.session.status === "bootstrapping" ? "warning" : "neutral"}
          title="Session bootstrap"
        >
          <KeyValue label="Status" value={diagnostics.session.status} />
          <KeyValue label="Device suffix" value={diagnostics.session.deviceIdSuffix || "Not found in repo"} />
          <KeyValue label="Expires at" value={diagnostics.session.expiresAt || "Not found in repo"} />
          <KeyValue label="Error" value={diagnostics.session.error || "None"} />
        </InfoCard>

        <InfoCard
          tone={diagnostics.voice.lastError || !voiceInvariantPass ? "warning" : "neutral"}
          title="Voice control"
        >
          <KeyValue
            label="Native voice module available"
            value={diagnostics.voice.available ? "yes" : "no"}
          />
          <KeyValue
            label="Execution path"
            value={diagnostics.voice.executionPath}
          />
          <KeyValue
            label="Microphone permission"
            value={diagnostics.voice.microphonePermission || "Not found in repo"}
          />
          <KeyValue
            label="Speech recognition permission"
            value={diagnostics.voice.speechPermission || "Not found in repo"}
          />
          <KeyValue
            label="Listening active"
            value={diagnostics.voice.listening ? "yes" : "no"}
          />
          <KeyValue
            label="Speaking active"
            value={diagnostics.voice.speaking ? "yes" : "no"}
          />
          <KeyValue
            label="Speech/listening invariant"
            value={voiceInvariantPass ? "PASS" : "FAIL"}
          />
          <KeyValue
            label="Overlap active"
            value={diagnostics.voice.speechListeningOverlapActive ? "yes" : "no"}
          />
          <KeyValue
            label="Overlap count"
            value={`${diagnostics.voice.speechListeningOverlapCount}`}
          />
          <KeyValue
            label="Unexpected overlap count"
            value={`${diagnostics.voice.unexpectedSpeechListeningOverlapCount}`}
          />
          <KeyValue
            label="Last overlap reason"
            value={diagnostics.voice.lastSpeechListeningOverlapReason || "None"}
          />
          <KeyValue
            label="Last overlap time"
            value={formatTimestamp(diagnostics.voice.lastSpeechListeningOverlapAt)}
          />
          <KeyValue
            label="Last recognized command"
            value={diagnostics.voice.lastRecognizedCommand || "None"}
          />
          <KeyValue
            label="Last recognition phase"
            value={diagnostics.voice.lastRecognizedCommandPhase || "None"}
          />
          <KeyValue
            label="Last recognition time"
            value={formatTimestamp(diagnostics.voice.lastRecognizedAt)}
          />
          <KeyValue
            label="Last voice state time"
            value={formatTimestamp(diagnostics.voice.lastVoiceStateChangedAt)}
          />
          <KeyValue
            label="Last voice-module error"
            value={diagnostics.voice.lastError || "None"}
          />
        </InfoCard>

        <InfoCard
          tone={diagnostics.navigationLoop.lastError ? "warning" : "neutral"}
          title="Guidance loop"
        >
          <KeyValue
            label="Native module available"
            value={diagnostics.navigationLoop.available ? "yes" : "no"}
          />
          <KeyValue
            label="Execution path"
            value={diagnostics.navigationLoop.executionPath}
          />
          <KeyValue
            label="Native session active"
            value={diagnostics.navigationLoop.sessionActive ? "yes" : "no"}
          />
          <KeyValue
            label="VoiceOver running"
            value={diagnostics.navigationLoop.voiceOverRunning ? "yes" : "no"}
          />
          <KeyValue
            label="Last capture latency"
            value={formatMs(diagnostics.navigationLoop.lastCaptureLatencyMs)}
          />
          <KeyValue
            label="Last analyze latency"
            value={formatMs(diagnostics.lastAnalyze?.latencyMs)}
          />
          <KeyValue
            label="Last total guidance loop latency"
            value={formatMs(diagnostics.navigationLoop.lastTotalGuidanceLoopLatencyMs)}
          />
          <KeyValue
            label="Last native/core error"
            value={diagnostics.navigationLoop.lastError || "None"}
          />
        </InfoCard>

        <InfoCard
          tone={diagnostics.audioCue.lastOutcome === "failure" ? "warning" : "neutral"}
          title="Audio cues"
        >
          <KeyValue label="Last type" value={diagnostics.audioCue.lastType || "None"} />
          <KeyValue label="Last outcome" value={diagnostics.audioCue.lastOutcome} />
          <KeyValue label="Last execution path" value={diagnostics.audioCue.lastExecutionPath || "Not found in repo"} />
          <KeyValue label="Last attempted" value={formatTimestamp(diagnostics.audioCue.lastAttemptedAt)} />
          <KeyValue label="Last completed" value={formatTimestamp(diagnostics.audioCue.lastCompletedAt)} />
          <KeyValue label="Success count" value={`${diagnostics.audioCue.successCount}`} />
          <KeyValue label="Failure count" value={`${diagnostics.audioCue.failureCount}`} />
          <KeyValue label="Last error" value={diagnostics.audioCue.lastError || "None"} />
        </InfoCard>

        <InfoCard
          tone={diagnostics.haptics.lastOutcome === "failure" ? "warning" : "neutral"}
          title="Haptics"
        >
          <KeyValue label="Last type" value={diagnostics.haptics.lastType || "None"} />
          <KeyValue label="Last outcome" value={diagnostics.haptics.lastOutcome} />
          <KeyValue label="Last execution path" value={diagnostics.haptics.lastExecutionPath || "Not found in repo"} />
          <KeyValue label="Last attempted" value={formatTimestamp(diagnostics.haptics.lastAttemptedAt)} />
          <KeyValue label="Last completed" value={formatTimestamp(diagnostics.haptics.lastCompletedAt)} />
          <KeyValue label="Success count" value={`${diagnostics.haptics.successCount}`} />
          <KeyValue label="Failure count" value={`${diagnostics.haptics.failureCount}`} />
          <KeyValue label="Last error" value={diagnostics.haptics.lastError || "None"} />
        </InfoCard>

        <InfoCard
          tone={diagnostics.lastHealthCheck?.ok ? "neutral" : "warning"}
          title="Backend health"
          action={
            <Pressable
              onPress={handleHealthCheck}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Health check"
              accessibilityHint="Double tap to call the backend health endpoint"
              testID="diagnostics-health-check"
            >
              <RefreshCw color={Colors.palette.background} size={16} />
              <Text style={styles.actionButtonText}>
                {isRunningHealthCheck ? "Checking..." : "Health check"}
              </Text>
            </Pressable>
          }
        >
          <Text style={styles.cardBody}>{healthMessage}</Text>
          <KeyValue
            label="Last request ID"
            value={diagnostics.lastHealthCheck?.requestId || "Not found in repo"}
          />
          <KeyValue
            label="Last prompt version"
            value={diagnostics.lastHealthCheck?.promptVersion || "Not found in repo"}
          />
          <KeyValue
            label="Last provider"
            value={diagnostics.lastHealthCheck?.defaultProvider || "Not found in repo"}
          />
          <KeyValue
            label="Last model"
            value={diagnostics.lastHealthCheck?.defaultModel || "Not found in repo"}
          />
          <KeyValue
            label="Latency"
            value={formatMs(diagnostics.lastHealthCheck?.latencyMs)}
          />
          <KeyValue
            label="Benchmark providers"
            value={diagnostics.lastHealthCheck?.benchmarkProviders?.join(", ") || "Not found in repo"}
          />
          <KeyValue label="Error" value={diagnostics.lastHealthCheck?.error || "None"} />
        </InfoCard>

        <InfoCard
          tone={
            diagnostics.lastAnalyze?.outcome === "failure" ||
            diagnostics.lastAnalyze?.outcome === "invalid-response" ||
            diagnostics.lastAnalyze?.outcome === "timeout"
              ? "critical"
              : diagnostics.lastAnalyze?.outcome === "safe-response"
                ? "warning"
                : "neutral"
          }
          title="Last analyze"
          action={
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Share diagnostics"
              accessibilityHint="Double tap to export a sanitized diagnostics report"
              testID="diagnostics-share"
            >
              <Share2 color={Colors.palette.background} size={16} />
              <Text style={styles.actionButtonText}>Share</Text>
            </Pressable>
          }
        >
          <KeyValue
            label="Outcome"
            value={diagnostics.lastAnalyze?.outcome || "Not found in repo"}
          />
          <KeyValue
            label="Execution path"
            value={getAnalyzeExecutionPath(diagnostics.lastAnalyze)}
          />
          <KeyValue
            label="Latency"
            value={formatMs(diagnostics.lastAnalyze?.latencyMs)}
          />
          <KeyValue label="Direction" value={diagnostics.lastAnalyze?.direction || "Not found in repo"} />
          <KeyValue
            label="Hazard"
            value={diagnostics.lastAnalyze?.hazardLevel || "Not found in repo"}
          />
          <KeyValue
            label="Confidence"
            value={
              typeof diagnostics.lastAnalyze?.confidence === "number"
                ? `${Math.round(diagnostics.lastAnalyze.confidence * 100)}%`
                : "Not found in repo"
            }
          />
          <KeyValue label="Provider" value={diagnostics.lastAnalyze?.provider || "Not found in repo"} />
          <KeyValue label="Model" value={diagnostics.lastAnalyze?.model || "Not found in repo"} />
          <KeyValue label="Request ID" value={diagnostics.lastAnalyze?.requestId || "Not found in repo"} />
          <KeyValue
            label="Prompt version"
            value={diagnostics.lastAnalyze?.promptVersion || "Not found in repo"}
          />
          <KeyValue label="App version" value={diagnostics.lastAnalyze?.appVersion || "Not found in repo"} />
          <KeyValue label="Session ID" value={diagnostics.lastAnalyze?.sessionId || "Not found in repo"} />
          <KeyValue label="Frame ID" value={diagnostics.lastAnalyze?.frameId || "Not found in repo"} />
          <KeyValue label="Frame summary" value={diagnostics.lastAnalyze?.frameSummary || "Not found in repo"} />
          <KeyValue label="Frame time" value={formatTimestamp(diagnostics.lastAnalyze?.frameTimestampMs)} />
          <KeyValue
            label="Sampled frame"
            value={
              typeof diagnostics.lastAnalyze?.sampledFrame === "boolean"
                ? String(diagnostics.lastAnalyze.sampledFrame)
                : "Not found in repo"
            }
          />
          <KeyValue
            label="Has image"
            value={
              typeof diagnostics.lastAnalyze?.hasImage === "boolean"
                ? String(diagnostics.lastAnalyze.hasImage)
                : "Not found in repo"
            }
          />
          <KeyValue label="Native path" value={diagnostics.lastAnalyze?.nativePath || "Not found in repo"} />
          <KeyValue label="Platform" value={diagnostics.lastAnalyze?.platform || "Not found in repo"} />
          <KeyValue
            label="Capture latency"
            value={formatMs(diagnostics.lastAnalyze?.captureHeuristics?.captureLatencyMs)}
          />
          <KeyValue
            label="Frame age"
            value={formatMs(diagnostics.lastAnalyze?.captureHeuristics?.frameAgeMs)}
          />
          <KeyValue
            label="Image source"
            value={diagnostics.lastAnalyze?.captureHeuristics?.imageSource || "Not found in repo"}
          />
          <KeyValue
            label="Resized upload"
            value={
              typeof diagnostics.lastAnalyze?.captureHeuristics?.resizedForUpload === "boolean"
                ? String(diagnostics.lastAnalyze.captureHeuristics.resizedForUpload)
                : "Not found in repo"
            }
          />
          <KeyValue
            label="Uploaded size"
            value={
              typeof diagnostics.lastAnalyze?.captureHeuristics?.uploadedWidth === "number" &&
              typeof diagnostics.lastAnalyze?.captureHeuristics?.uploadedHeight === "number"
                ? `${diagnostics.lastAnalyze.captureHeuristics.uploadedWidth}x${diagnostics.lastAnalyze.captureHeuristics.uploadedHeight}`
                : "Not found in repo"
            }
          />
          <KeyValue
            label="Source size"
            value={
              typeof diagnostics.lastAnalyze?.sourceWidth === "number" &&
              typeof diagnostics.lastAnalyze?.sourceHeight === "number"
                ? `${diagnostics.lastAnalyze.sourceWidth}x${diagnostics.lastAnalyze.sourceHeight}`
                : "Not found in repo"
            }
          />
          <KeyValue label="Prior guidance" value={diagnostics.lastAnalyze?.priorGuidanceSummary || "None"} />
          <KeyValue label="Message" value={diagnostics.lastAnalyze?.message || "Not found in repo"} />
          <KeyValue
            label="Obstacle"
            value={
              typeof diagnostics.lastAnalyze?.obstacle === "boolean"
                ? String(diagnostics.lastAnalyze.obstacle)
                : "Not found in repo"
            }
          />
          <KeyValue label="Lighting" value={diagnostics.lastAnalyze?.lighting || "Not found in repo"} />
          <KeyValue label="Surface" value={diagnostics.lastAnalyze?.surfaceType || "Not found in repo"} />
          <KeyValue label="Scene" value={diagnostics.lastAnalyze?.sceneDescription || "Not found in repo"} />
          <KeyValue label="Fallback reason" value={diagnostics.lastAnalyze?.fallbackReason || "None"} />
          <KeyValue label="Error" value={diagnostics.lastAnalyze?.error || "None"} />
          <KeyValue label="Safe reason" value={diagnostics.lastAnalyze?.safeReason || "None"} />
          {shareError ? <Text style={styles.errorText}>{shareError}</Text> : null}
        </InfoCard>

        <InfoCard tone="neutral" title="Recent analyze events">
          {diagnostics.recentAnalyzeEvents.length === 0 ? (
            <Text style={styles.cardBody}>No analyze events yet.</Text>
          ) : (
            diagnostics.recentAnalyzeEvents.map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.eventHeaderRow}>
                  <Text style={styles.eventOutcome}>{event.outcome}</Text>
                  <Text style={styles.eventMeta}>
                    {new Date(event.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text style={styles.eventSummary}>{formatDiagnosticsEventSummary(event)}</Text>
              </View>
            ))
          )}
        </InfoCard>

        <InfoCard tone="neutral" title="Log export">
          <Text style={styles.cardBody}>
            Export only contains sanitized runtime state, session metadata, health checks, and analyze summaries.
          </Text>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Export diagnostics log"
            accessibilityHint="Double tap to share or copy a sanitized diagnostics report"
            testID="diagnostics-export"
          >
            <FileText color={Colors.palette.textPrimary} size={16} />
            <Text style={styles.secondaryButtonText}>Export sanitized log</Text>
          </Pressable>
        </InfoCard>
      </ScrollView>
    </View>
  );
}

function InfoCard({
  action,
  children,
  title,
  tone,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
  tone: StateTone;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardTone, { backgroundColor: toneColor(tone) }]} />
        <Text style={styles.cardTitle}>{title}</Text>
        {action ? <View style={styles.cardAction}>{action}</View> : null}
      </View>
      <View style={styles.cardBodyGroup}>{children}</View>
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.keyValueRow}>
      <Text style={styles.keyValueLabel}>{label}</Text>
      <Text style={styles.keyValueValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.palette.background,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingRight: 8,
    paddingVertical: 8,
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
    flex: 1,
    fontSize: 26,
    fontWeight: "800",
  },
  scrollContent: {
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  card: {
    backgroundColor: Colors.palette.surface,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  cardTone: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  cardTitle: {
    color: Colors.palette.textPrimary,
    flex: 1,
    fontSize: 19,
    fontWeight: "700",
  },
  cardAction: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardBodyGroup: {
    gap: 10,
  },
  cardBody: {
    color: Colors.palette.textMuted,
    fontSize: 16,
    lineHeight: 22,
  },
  keyValueRow: {
    gap: 4,
  },
  keyValueLabel: {
    color: Colors.palette.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  keyValueValue: {
    color: Colors.palette.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: Colors.palette.accent,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonText: {
    color: Colors.palette.background,
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: Colors.palette.textPrimary,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryButtonText: {
    color: Colors.palette.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#FFB4B4",
    fontSize: 14,
    lineHeight: 20,
  },
  eventRow: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    gap: 8,
    padding: 14,
  },
  eventHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  eventOutcome: {
    color: Colors.palette.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  eventMeta: {
    color: Colors.palette.textMuted,
    fontSize: 13,
  },
  eventSummary: {
    color: Colors.palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
