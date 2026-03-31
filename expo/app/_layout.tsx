import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import Colors from "@/constants/colors";
import { SettingsProvider } from "@/src/providers/SettingsProvider";
import { VoiceProvider } from "@/src/components/VoiceAnnouncer";
import { appConfig } from "@/src/lib/config";
import { initializeSentry } from "@/src/lib/sentry";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.palette.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {appConfig.enableExperimentalTabs ? (
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      ) : null}
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="navigation" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initializeSentry();
    setTimeout(() => {
      SplashScreen.hideAsync();
    }, 100);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <VoiceProvider>
          <GestureHandlerRootView style={styles.root}>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </VoiceProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.palette.background,
  },
});
