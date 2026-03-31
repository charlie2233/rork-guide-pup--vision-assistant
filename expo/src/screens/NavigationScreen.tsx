import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Animated, TouchableOpacity, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter, useNavigation } from 'expo-router';
import { useVoice } from '@/src/components/VoiceAnnouncer';
import { GuideAI, GuideAIDirection } from '@/src/logic/GuideAI';
import { captureAppError } from '@/src/lib/sentry';
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
        quality: 0.4,
        skipProcessing: true,
      });

      if (!photo?.uri && !photo?.base64) {
        console.log('[NavigationScreen] No usable image payload, skipping');
        return;
      }

      console.log('[NavigationScreen] Frame captured, sending to Vision AI...');
      const result = await GuideAI.analyzeWithVision({
        base64: photo.base64,
        height: photo.height,
        uri: photo.uri,
        width: photo.width,
      });

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
      void captureAppError(error, {
        screen: 'NavigationScreen',
        stage: 'analyzeCurrentFrame',
      });
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

  return (
    <View style={styles.container}>
      {permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={styles.hiddenCamera}
          facing="back"
          enableTorch={false}
        />
      )}
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
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.innerCircle} />
            </Animated.View>

            <Text style={styles.statusText}>
              {isGuiding ? 'Guiding...' : 'Stopped'}
            </Text>

            {direction && (
              <Text style={styles.directionText}>
                {direction.direction.replace('-', ' ').toUpperCase()}
              </Text>
            )}

            {direction?.message && (
              <Text style={styles.messageText}>{direction.message}</Text>
            )}

            {direction?.sceneDescription && (
              <Text style={styles.sceneText}>{direction.sceneDescription}</Text>
            )}

            <Text style={styles.safetyNote}>
              Guide Pup provides assistive guidance and can stop with STOP when the scene is unclear.
            </Text>
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
    backgroundColor: '#FFFFFF',
  },
  hiddenCamera: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
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
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  innerCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#111111',
  },
  statusText: {
    color: '#111111',
    fontSize: 48,
    fontWeight: 'bold' as const,
    marginBottom: 20,
  },
  directionText: {
    color: '#222222',
    fontSize: 32,
    fontWeight: 'bold' as const,
    letterSpacing: 2,
    marginBottom: 12,
  },
  messageText: {
    color: '#333333',
    fontSize: 20,
    textAlign: 'center' as const,
    lineHeight: 28,
  },
  sceneText: {
    color: '#888888',
    fontSize: 15,
    textAlign: 'center' as const,
    marginTop: 16,
    fontStyle: 'italic' as const,
  },
  safetyNote: {
    color: '#555555',
    fontSize: 15,
    textAlign: 'center' as const,
    marginTop: 18,
    lineHeight: 22,
  },
  bottomHint: {
    paddingBottom: 24,
    alignItems: 'center' as const,
  },
  hintText: {
    color: '#AAAAAA',
    fontSize: 14,
  },
});
