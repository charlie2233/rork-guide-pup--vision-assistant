import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@/src/navigation/types";

const onboardingSteps = [
  {
    title: "Welcome to Guide Pup",
    description: "I use your camera and voice to guide you through any space.",
    buttonLabel: "Continue",
  },
  {
    title: "Permissions",
    description: "Guide Pup needs camera and microphone access to describe scenes aloud.",
    buttonLabel: "Allow camera and microphone",
  },
  {
    title: "How to use",
    description: "Tap the big button for a scene description. Turn on continuous mode for regular updates.",
    buttonLabel: "Start using Guide Pup",
  },
] as const;

const howToBullets = [
  "Tap the large button at the bottom to hear what is ahead.",
  "Toggle continuous mode if you want steady updates.",
  "Switch between object and text modes for different tasks.",
] as const;

export default function OnboardingScreen() {
  console.log("[OnboardingScreen] render");
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Onboarding">>();
  const [stepIndex, setStepIndex] = useState<number>(0);

  const currentStep = useMemo(() => onboardingSteps[stepIndex], [stepIndex]);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  const handleContinue = useCallback(() => {
    console.log("[OnboardingScreen] Continue pressed", { stepIndex });
    if (isLastStep) {
      navigation.navigate("Main");
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, onboardingSteps.length - 1));
  }, [isLastStep, navigation, stepIndex]);

  return (
    <View style={styles.container} testID="onboarding-screen">
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
    paddingBottom: 48,
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
