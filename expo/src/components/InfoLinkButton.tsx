import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/colors";

interface InfoLinkButtonProps {
  accessibilityHint: string;
  accessibilityLabel: string;
  description: string;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
  title: string;
}

export function InfoLinkButton({
  accessibilityHint,
  accessibilityLabel,
  description,
  disabled = false,
  onPress,
  testID,
  title,
}: InfoLinkButtonProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}
      testID={testID}
    >
      <View style={styles.textGroup}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Text style={styles.chevron}>{">"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.palette.surface,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.56,
  },
  textGroup: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.palette.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  description: {
    color: Colors.palette.textMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  chevron: {
    color: Colors.palette.textMuted,
    fontSize: 24,
    fontWeight: "700",
  },
});
