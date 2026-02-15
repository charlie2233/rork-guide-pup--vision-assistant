import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Animated, TouchableOpacity, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter, useNavigation } from 'expo-router';
import { useVoice } from '@/src/components/VoiceAnnouncer';
import { GuideAI, GuideAIDirection } from '@/src/logic/GuideAI';
import { SafeAreaView } from 'react-native-safe-area-context';

const ANALYSIS_INTERVAL_MS = 4500;

export default function NavigationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { speak, isSpeaking } = useVoice();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [direction, setDirection] = useState<GuideAIDirection | null>(null);
  const [isGuiding, setIsGuiding] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const analyzingRef = useRef(false);
  const guidingRef = useRef(true);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    guidingRef.current = isGuiding;
  }, [isGuiding]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
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
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    speak("Guidance started. Analyzing your surroundings.");
    console.log('[NavigationScreen] Initial guidance speech fired');
  }, [speak]);

  const analyzeCurrentFrame = useCallback(async () => {
    if (analyzingRef.current || !guidingRef.current) return;
    if (!cameraRef.current) {
      console.log('[NavigationScreen] Camera ref not ready');
      return;
    }

    try {
      analyzingRef.current = true;
      console.log('[NavigationScreen] Capturing frame for analysis...');

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.4,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        console.log('[NavigationScreen] No base64 in photo, skipping');
        return;
      }

      console.log('[NavigationScreen] Frame captured, sending to Vision AI...');
      const result = await GuideAI.analyzeWithVision(photo.base64);

      if (!guidingRef.current) return;

      if (result) {
        setDirection(result);
        console.log('[NavigationScreen] Vision AI result:', result.direction, result.message);

        if (result.message && !isSpeakingRef.current) {
          speak(result.message);
        }

        if (result.obstacle) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (result.direction === 'turn-left') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (result.direction === 'turn-right') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    } catch (error) {
      console.error('[NavigationScreen] Analysis error:', error);
    } finally {
      analyzingRef.current = false;
    }
  }, [speak]);

  useEffect(() => {
    if (!isGuiding || !permission?.granted) return;

    const startDelay = setTimeout(() => {
      analyzeCurrentFrame();
    }, 2000);

    const intervalId = setInterval(() => {
      analyzeCurrentFrame();
    }, ANALYSIS_INTERVAL_MS);

    return () => {
      clearTimeout(startDelay);
      clearInterval(intervalId);
    };
  }, [isGuiding, permission?.granted, analyzeCurrentFrame]);

  const handleStop = useCallback(() => {
    setIsGuiding(false);
    guidingRef.current = false;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speak("Stopping guidance.");
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace('/');
    }
  }, [navigation, router, speak]);

  const handleSOS = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    speak("Emergency SOS activated.");
  }, [speak]);

  const directionColor = direction?.obstacle ? '#FF4444' : '#44FF44';

  return (
    <View style={styles.container}>
      {permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={false}
        />
      )}
      <View style={styles.cameraOverlay} />
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity
          style={styles.touchable}
          onLongPress={handleSOS}
          onPress={handleStop}
          activeOpacity={0.9}
          accessibilityLabel="Navigation Screen"
          accessibilityHint="Guidance in progress. Tap to stop. Long press for SOS."
        >
          <View style={styles.content}>
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }], borderColor: directionColor }]}>
              <View style={[styles.innerCircle, { backgroundColor: directionColor }]} />
            </Animated.View>

            <Text style={styles.statusText}>
              {isGuiding ? 'Guiding...' : 'Stopped'}
            </Text>

            {direction && (
              <Text style={[styles.directionText, { color: directionColor }]}>
                {direction.direction.replace('-', ' ').toUpperCase()}
              </Text>
            )}

            {direction?.message && (
              <Text style={styles.messageText}>{direction.message}</Text>
            )}

            {direction?.sceneDescription && (
              <Text style={styles.sceneText}>{direction.sceneDescription}</Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>Tap to stop {Platform.OS !== 'web' ? '| Long press for SOS' : ''}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  safeArea: {
    flex: 1,
  },
  touchable: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pulseCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  innerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: 'bold' as const,
    marginBottom: 12,
  },
  directionText: {
    fontSize: 30,
    fontWeight: 'bold' as const,
    letterSpacing: 2,
    marginBottom: 16,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 20,
    textAlign: 'center' as const,
    lineHeight: 28,
    opacity: 0.9,
  },
  sceneText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center' as const,
    marginTop: 16,
    fontStyle: 'italic' as const,
  },
  bottomHint: {
    paddingBottom: 24,
    alignItems: 'center' as const,
  },
  hintText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
});
