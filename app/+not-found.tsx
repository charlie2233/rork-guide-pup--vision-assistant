import { Link, Stack } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Compass } from "lucide-react-native";

import Colors from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Off route" }} />
      <View style={styles.container}>
        <View style={styles.badge}>
          <Compass color={Colors.palette.accent} size={32} />
        </View>
        <Text style={styles.title}>We lost this path</Text>
        <Text style={styles.message}>
          The scene you were tracking drifted away. Jump back to the vault and keep exploring.
        </Text>
        <Link href="/capture" asChild>
          <Pressable style={styles.cta} testID="return-home">
            <Text style={styles.ctaText}>Return to capture</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 18,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.palette.elevated,
  },
  title: {
    color: Colors.palette.textPrimary,
    fontSize: 26,
    fontWeight: "700",
  },
  message: {
    color: Colors.palette.textMuted,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  cta: {
    backgroundColor: Colors.palette.accent,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  ctaText: {
    color: Colors.palette.background,
    fontSize: 15,
    fontWeight: "700",
  },
});
