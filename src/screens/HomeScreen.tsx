import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useVoice } from '@/src/components/VoiceAnnouncer';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const { speak } = useVoice();

  useEffect(() => {
    speak("Welcome. Tap the screen to start guidance.");
  }, [speak]);

  const handlePress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speak("Guidance started.");
    router.push('/navigation');
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    speak("SOS mode activated. Connecting to emergency services.");
    // Placeholder for SOS logic
  };

  return (
    <SafeAreaView style={styles.container}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  button: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
