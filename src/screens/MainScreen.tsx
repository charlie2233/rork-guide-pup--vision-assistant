import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function MainScreen() {
  console.log("[MainScreen] render");

  return (
    <View style={styles.container} testID="main-screen">
      <View style={styles.tile} testID="main-quick-action">
        <Text style={styles.tileLabel}>Quick Action</Text>
        <Text style={styles.tileValue}>Tap to scan your surroundings</Text>
      </View>
      <View style={styles.tileRow}>
        <View style={styles.miniTile} testID="main-mini-card-camera">
          <Text style={styles.miniTileLabel}>Camera</Text>
          <Text style={styles.miniTileValue}>Ready</Text>
        </View>
        <View style={styles.miniTile} testID="main-mini-card-audio">
          <Text style={styles.miniTileLabel}>Audio</Text>
          <Text style={styles.miniTileValue}>Idle</Text>
        </View>
      </View>
      <Text style={styles.placeholder}>Guide Pup assistant view coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020204",
    paddingHorizontal: 24,
    paddingTop: 64,
    gap: 20,
  },
  tile: {
    backgroundColor: "#0B0C12",
    borderRadius: 26,
    padding: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tileLabel: {
    color: "#7DFCC0",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  tileValue: {
    color: "#F5F5F7",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
  },
  tileRow: {
    flexDirection: "row",
    gap: 16,
  },
  miniTile: {
    flex: 1,
    backgroundColor: "#0B0C12",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  miniTileLabel: {
    color: "#9FA3B2",
    fontSize: 14,
    fontWeight: "600",
  },
  miniTileValue: {
    color: "#F5F5F7",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 6,
  },
  placeholder: {
    color: "#6D7080",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
});
