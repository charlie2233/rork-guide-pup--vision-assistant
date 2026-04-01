import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InfoLinkButton } from "@/src/components/InfoLinkButton";
import { ONBOARDING_STEPS_NOTE } from "@/src/lib/onboarding";
import { useGuidePupRouter } from "@/src/lib/router";
import { useSettings } from "@/src/providers/SettingsProvider";

const onboardingSteps = [
  {
    title: "Welcome to Guide Pup",
    description: "I use your camera and voice to guide you through any space.",
    buttonLabel: "Continue",
  },
  {
    title: "Permissions",
    description:
      "Guide Pup needs camera access to analyze what is ahead. If the scene is unclear, it safely says STOP so you can pause and reorient.",
    buttonLabel: "Continue",
  },
  {
    title: "How to use",
    description:
      "Start guidance from the home screen, keep the phone pointed ahead, and use Settings to review privacy, support, and safety details.",
    buttonLabel: "Start using Guide Pup",
  },
] as const;

const howToBullets = [
  "Tap Start Guidance to hear spoken movement cues.",
  "Hold the phone forward and steady for a clear camera frame.",
  "If you hear STOP, pause and reorient before moving again.",
  "Open Settings anytime to adjust speech rate and description detail.",
] as const;

export default function OnboardingScreen() {
  const router = useGuidePupRouter();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState<number>(0);
  const { markOnboardingComplete } = useSettings();

  const currentStep = useMemo(() => onboardingSteps[stepIndex], [stepIndex]);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  const handleContinue = useCallback(() => {
    if (isLastStep) {
      markOnboardingComplete();
      router.replace("/");
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, onboardingSteps.length - 1));
  }, [isLastStep, markOnboardingComplete, router, stepIndex]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 48) },
      ]}
      showsVerticalScrollIndicator={false}
      testID="onboarding-screen"
    >
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

      <View style={styles.learnMoreSection}>
        <Text style={styles.learnMoreTitle}>Before you continue</Text>
        <Text style={styles.learnMoreText}>
          Review how Guide Pup handles camera frames, what STOP means, and where to get help.
        </Text>
        <View style={styles.learnMoreLinks}>
          <InfoLinkButton
            accessibilityHint="Double tap to open the privacy policy page"
            accessibilityLabel="Privacy Policy"
            description="Read how camera frames and anonymous data are handled."
            onPress={() => router.push("/privacy" as never)}
            testID="onboarding-privacy-link"
            title="Privacy Policy"
          />
          <InfoLinkButton
            accessibilityHint="Double tap to open the support page"
            accessibilityLabel="Support"
            description="Find help if guidance fails or the app behaves unexpectedly."
            onPress={() => router.push("/support" as never)}
            testID="onboarding-support-link"
            title="Support"
          />
          <InfoLinkButton
            accessibilityHint="Double tap to open the safety disclaimer page"
            accessibilityLabel="Safety / emergency"
            description="Read the assistive guidance and emergency disclaimer."
            onPress={() => router.push("/safety" as never)}
            testID="onboarding-safety-link"
            title="Safety / emergency"
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05060B",
  },
  content: {
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
  learnMoreSection: {
    gap: 12,
  },
  learnMoreTitle: {
    color: "#FDFDFD",
    fontSize: 22,
    fontWeight: "700",
  },
  learnMoreText: {
    color: "#CDD0DC",
    fontSize: 16,
    lineHeight: 24,
  },
  learnMoreLinks: {
    gap: 12,
  },
});
