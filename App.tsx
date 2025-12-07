// Ensure every runtime (including tools that still look for App.tsx) loads the
// Expo Router entry. This avoids creating an extra NavigationContainer and
// keeps a single copy of React Navigation in use.
export { default } from "expo-router/entry";
