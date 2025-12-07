import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Animated, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useVoice } from '@/src/components/VoiceAnnouncer';
import { GuideAI, GuideAIDirection } from '@/src/logic/GuideAI';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NavigationScreen() {
  const router = useRouter();
  const { speak } = useVoice();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [direction, setDirection] = useState<GuideAIDirection | null>(null);
  const [isGuiding, setIsGuiding] = useState(true);

  useEffect(() => {
    // Pulsing animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    let intervalId: any;

    const startGuidanceLoop = async () => {
      if (!isGuiding) return;

      const camera = GuideAI.startCameraStream();
      const gps = GuideAI.startGPSTracking();
      
      speak("Guiding active. Walk forward.");

      intervalId = setInterval(async () => {
        const nextDir = await GuideAI.getNextDirection(camera, gps);
        if (nextDir) {
          setDirection(nextDir);
          
          if (nextDir.message) {
            speak(nextDir.message);
          }

          if (nextDir.obstacle) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            // Repeated short pulses = stop / obstacle (Simulated by repeated calls if obstacle persists)
          } else {
            // Haptic pulses to indicate direction patterns
            if (nextDir.direction === 'turn-left') {
               Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } else if (nextDir.direction === 'turn-right') {
               Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            }
          }
        }
      }, 3000); // Check every 3 seconds to avoid spamming voice
    };

    startGuidanceLoop();

    return () => clearInterval(intervalId);
  }, [isGuiding, speak]);

  const handleStop = () => {
    setIsGuiding(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speak("Stopping guidance.");
    router.back();
  };

  const handleSOS = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    speak("Emergency SOS activated.");
    // SOS Logic
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity 
        style={styles.touchable} 
        onLongPress={handleSOS}
        onPress={handleStop} // Tap to stop/back for now, or maybe double tap
        activeOpacity={0.9}
        accessibilityLabel="Navigation Screen"
        accessibilityHint="Guidance in progress. Tap to stop. Long press for SOS."
      >
        <View style={styles.content}>
          <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.innerCircle} />
          </Animated.View>
          
          <Text style={styles.statusText}>Guiding...</Text>
          
          {direction && (
            <Text style={styles.directionText}>{direction.direction.toUpperCase()}</Text>
          )}
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#333333', // Dark gray
  },
  touchable: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // High contrast pulse
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  innerCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FFFFFF',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  directionText: {
    color: '#FFFF00', // Yellow for high contrast
    fontSize: 32,
    fontWeight: 'bold',
  },
});
