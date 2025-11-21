import React, { useMemo } from "react";
import { DefaultTheme, NavigationContainer, Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MainScreen from "@/src/screens/MainScreen";
import OnboardingScreen from "@/src/screens/OnboardingScreen";
import { RootStackParamList } from "@/src/navigation/types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  console.log("[App] Rendering Guide Pup navigator");

  const guidePupTheme = useMemo<Theme>(
    () => ({
      ...DefaultTheme,
      dark: true,
      colors: {
        ...DefaultTheme.colors,
        primary: "#7DFCC0",
        background: "#020204",
        card: "#05060A",
        text: "#F5F5F7",
        border: "rgba(255,255,255,0.12)",
        notification: "#FFB347",
      },
    }),
    [],
  );

  return (
    <GestureHandlerRootView style={styles.root} testID="guide-pup-root">
      <SafeAreaProvider>
        <NavigationContainer theme={guidePupTheme}>
          <StatusBar style="light" />
          <Stack.Navigator
            initialRouteName="Onboarding"
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              contentStyle: { backgroundColor: "#020204" },
            }}
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Main" component={MainScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020204",
  },
});
