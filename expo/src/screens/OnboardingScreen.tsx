import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ONBOARDING_STEPS_NOTE } from "@/src/lib/onboarding";
import { useSettings } from "@/src/providers/SettingsProvider";

const onboardingSteps = [
  {
    title: "Welcome to Guide Pup",
    description: "I use your camera and voice to guide you through any space.",
    buttonLabel: "Continue",
  },
  {
    title: "Permissions",
    description: "Guide Pup needs camera access to analyze what is ahead and speak guidance aloud.",
    buttonLabel: "Continue",
  },
  {
    title: "How to use",
    description: "Start guidance from the home screen, keep the phone pointed ahead, and use Settings to tune the voice.",
    buttonLabel: "Start using Guide Pup",
  },
] as const;

const howToBullets = [
  "Tap Start Guidance to hear spoken movement cues.",
  "Hold the phone forward and steady for a clear camera frame.",
  "Open Settings anytime to adjust speech rate and description detail.",
] as const;

export default function OnboardingScreen() {
  console.log("[OnboardingScreen] render");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState<number>(0);
  const { markOnboardingComplete } = useSettings();

  const currentStep = useMemo(() => onboardingSteps[stepIndex], [stepIndex]);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  const handleContinue = useCallback(() => {
    console.log("[OnboardingScreen] Continue pressed", { stepIndex });
    if (isLastStep) {
      markOnboardingComplete();
      router.replace("/");
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, onboardingSteps.length - 1));
  }, [isLastStep, markOnboardingComplete, router, stepIndex]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 48) }]} testID="onboarding-screen">
      <Text style={styles.kicker}>Guide Pup</Text>
      <Text style={styles.headline}>{currentStep.title}</Text>
      <Text style={styles.subtitle}>{currentStep.description}</Text>
      {isLastStep ? (
        <View style={styles.howToCard} testID="onboarding-how-to-card">
          {howToBullets.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
          <Text style={styles.backendNote}>{ONBOARDING_STEPS_NOTE}</Text>
        </View>
      ) : (
        <View style={styles.permissionCard} testID="onboarding-info-card">
          <Text style={styles.permissionCardText}>
            Everything is designed for voice-first navigation with large, forgiving controls.
          </Text>
        </View>
      )}
      <Pressable
        onPress={handleContinue}
        accessibilityLabel={currentStep.buttonLabel}
        accessibilityHint={isLastStep ? "Double tap to open the main screen" : "Double tap to advance"}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        testID="onboarding-primary-action"
      >
        <Text style={styles.primaryButtonText}>{currentStep.buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05060B",
    paddingHorizontal: 28,
    justifyContent: "center",
    gap: 24,
  },
  kicker: {
    color: "#F7F8FB",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  headline: {
    color: "#FDFDFD",
    fontSize: 40,
    fontWeight: "800",
    lineHeight: 46,
  },
  subtitle: {
    color: "#CDD0DC",
    fontSize: 20,
    lineHeight: 30,
  },
  permissionCard: {
    backgroundColor: "#0B0D16",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 24,
  },
  permissionCardText: {
    color: "#E5E7EE",
    fontSize: 18,
    lineHeight: 26,
  },
  howToCard: {
    backgroundColor: "#0B0D16",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 26,
    gap: 18,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bulletDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F5C63C",
  },
  bulletText: {
    color: "#FDFDFD",
    fontSize: 18,
    lineHeight: 26,
    flex: 1,
  },
  backendNote: {
    color: "#CDD0DC",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: "#F5C63C",
    borderRadius: 32,
    paddingVertical: 20,
    alignItems: "center",
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: "#1A1302",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
