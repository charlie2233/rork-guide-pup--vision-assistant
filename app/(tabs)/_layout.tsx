import { Tabs } from "expo-router";
import { Camera, Sparkles } from "lucide-react-native";
import React from "react";
import { StyleSheet } from "react-native";

import Colors from "@/constants/colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.palette.accent,
        tabBarInactiveTintColor: Colors.palette.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="capture"
        options={{
          title: "Capture",
          tabBarIcon: ({ color }) => <Camera color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="inspiration"
        options={{
          title: "Inspire",
          tabBarIcon: ({ color }) => <Sparkles color={color} size={20} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.palette.surface,
    borderTopColor: "rgba(255,255,255,0.1)",
    height: 70,
    paddingBottom: 12,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});
