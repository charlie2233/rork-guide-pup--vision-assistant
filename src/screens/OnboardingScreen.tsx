import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@/src/navigation/types";

const headline = "Guide Pup" as const;
const subtext = "Your AI-powered accessibility co-pilot" as const;

export default function OnboardingScreen() {
  console.log("[OnboardingScreen] render");
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Onboarding">>();

  const handleContinue = useCallback(() => {
    console.log("[OnboardingScreen] Continue pressed");
    navigation.navigate("Main");
  }, [navigation]);

  return (
    <View style={styles.container} testID="onboarding-screen">
      <View style={styles.heroBadge} testID="onboarding-hero-badge">
        <Text style={styles.heroBadgeText}>Beta</Text>
      </View>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.subtitle}>{subtext}</Text>
      <View style={styles.card} testID="onboarding-highlights-card">
        <Text style={styles.cardTitle}>Instant Assistance</Text>
        <Text style={styles.cardBody}>Use camera, audio, and haptic cues to interpret the world in real time.</Text>
      </View>
      <Pressable
        onPress={handleContinue}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        testID="onboarding-continue-button"
      >
        <Text style={styles.primaryButtonText}>Enter Guide Pup</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020204",
    paddingHorizontal: 28,
    justifyContent: "center",
    gap: 24,
  },
  heroBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "rgba(125,252,192,0.12)",
  },
  heroBadgeText: {
    color: "#7DFCC0",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  headline: {
    color: "#F5F5F7",
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 48,
  },
  subtitle: {
    color: "#C9CBD3",
    fontSize: 18,
    lineHeight: 26,
  },
  card: {
    backgroundColor: "#0B0C12",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: {
    color: "#F5F5F7",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardBody: {
    color: "#C9CBD3",
    fontSize: 16,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: "#7DFCC0",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: "#051814",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
