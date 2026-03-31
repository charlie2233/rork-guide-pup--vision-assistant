import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useVoice } from '@/src/components/VoiceAnnouncer';
import { useSettings } from '@/src/providers/SettingsProvider';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const { speak } = useVoice();
  const { isReady, settings } = useSettings();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!settings.hasCompletedOnboarding) {
      router.replace('/onboarding' as never);
      return;
    }

    speak("Welcome. Tap the screen to start guidance.");
  }, [isReady, router, settings.hasCompletedOnboarding, speak]);

  const handlePress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speak("Guidance started.");
    router.push('/navigation' as never);
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    speak("SOS mode activated. Connecting to emergency services.");
    // Placeholder for SOS logic
  };

  const handleOpenSettings = () => {
    router.push('/settings' as never);
  };

  if (!isReady || !settings.hasCompletedOnboarding) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.button}
          onPress={handlePress}
          onLongPress={handleLongPress}
          activeOpacity={0.8}
          accessibilityLabel="Start Guidance"
          accessibilityRole="button"
          accessibilityHint="Double tap to start guidance. Long press for SOS."
        >
          <Text style={styles.text}>Start Guidance</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleOpenSettings}
          activeOpacity={0.8}
          accessibilityLabel="Open Settings"
          accessibilityRole="button"
          accessibilityHint="Double tap to adjust speech and guidance settings."
        >
          <Text style={styles.secondaryText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  button: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secondaryButton: {
    borderColor: '#333333',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 24,
    paddingVertical: 18,
  },
  secondaryText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
});
