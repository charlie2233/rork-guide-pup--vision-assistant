import { router, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sparkles, X } from "lucide-react-native";

import Colors from "@/constants/colors";

export default function MoodboardModal() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleClose = () => {
    console.log("Closing moodboard modal");
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace("/");
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
    >
      <Pressable style={styles.overlay} onPress={handleClose} testID="modal-overlay">
        <View style={[styles.panel, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
          testID="moodboard-panel"
        >
          <LinearGradient
            colors={[Colors.palette.surface, Colors.palette.elevated, "#090e1f"]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.panelLabel}>Night brief</Text>
              <Text style={styles.panelTitle}>Luminous crossover</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={handleClose} testID="modal-close">
              <X color={Colors.palette.textPrimary} size={18} />
            </Pressable>
          </View>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Sparkles color={Colors.palette.accent} size={16} />
              <Text style={styles.chipText}>Glass bloom</Text>
            </View>
            <View style={styles.chip}>
              <Sparkles color={Colors.palette.accentSecondary} size={16} />
              <Text style={styles.chipText}>Pulse 0.6s</Text>
            </View>
          </View>
          <Text style={styles.description}>
            Stack a prism in front of the lens and rotate slowly until sodium vapor lamps split into triads. Capture the frame between breaths.
          </Text>
          <Pressable style={styles.primaryButton} onPress={handleClose} testID="modal-accept">
            <Text style={styles.primaryText}>Load into capture HUD</Text>
          </Pressable>
        </View>
      </Pressable>
      <StatusBar style="light" />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,3,8,0.85)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  panel: {
    borderRadius: 32,
    paddingHorizontal: 24,
    gap: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  panelLabel: {
    color: Colors.palette.textMuted,
    letterSpacing: 1,
    fontSize: 12,
    textTransform: "uppercase",
  },
  panelTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 24,
    fontWeight: "700",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5,6,13,0.6)",
  },
  chipRow: {
    flexDirection: "row",
    gap: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.palette.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipText: {
    color: Colors.palette.textPrimary,
    fontSize: 13,
  },
  description: {
    color: Colors.palette.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: Colors.palette.accent,
    borderRadius: 26,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: {
    color: Colors.palette.background,
    fontSize: 15,
    fontWeight: "700",
  },
});
