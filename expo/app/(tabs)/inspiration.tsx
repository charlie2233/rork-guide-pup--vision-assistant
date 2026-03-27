import { Audio } from "expo-av";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MapPin, Pause, Play, Music3 } from "lucide-react-native";

import Colors from "@/constants/colors";

const ambientTrack = "https://cdn.pixabay.com/download/audio/2024/01/18/audio_3cdc741e32.mp3?filename=gentle-melody-191285.mp3";

const inspirationSets = [
  {
    id: "1",
    title: "Refract window-glow",
    location: "Lower East Side, NYC",
    mood: "Chromatic",
    prompt: "Frame reflections layered with silhouettes to capture nightlife pulse.",
    image: "https://images.unsplash.com/photo-1501877008226-4fca48ee50c1?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "2",
    title: "Mist + neon",
    location: "Shibuya Crossing",
    mood: "Ethereal",
    prompt: "Shoot through fogged glass and let red lights bleed into teal shadows.",
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "3",
    title: "Quiet dunes",
    location: "Sossusvlei Desert",
    mood: "Minimal",
    prompt: "Track footsteps at blue hour with a single curved dune powering the frame.",
    image: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80",
  },
] as const;

type InspirationCard = (typeof inspirationSets)[number];

export default function InspirationScreen() {
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const ensureSoundInstance = useCallback(async () => {
    if (soundRef.current) {
      return soundRef.current;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: ambientTrack },
      { shouldPlay: false, volume: 0.6 }
    );
    soundRef.current = sound;
    return sound;
  }, []);

  const handleToggleAmbient = useCallback(async () => {
    if (Platform.OS === "web") {
      console.log("Ambient audio unavailable on web");
      setAudioError("Ambient audio plays only on device");
      return;
    }

    try {
      setIsLoading(true);
      const sound = await ensureSoundInstance();
      const status = await sound.getStatusAsync();

      if (status.isLoaded && status.isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        console.log("Ambient audio paused");
      } else {
        await sound.playAsync();
        setIsPlaying(true);
        console.log("Ambient audio playing");
      }
      setAudioError(null);
    } catch (error) {
      console.error("Ambient audio error", error);
      setAudioError("We couldn't start the soundscape. Try again.");
    } finally {
      setIsLoading(false);
    }
  }, [ensureSoundInstance]);

  const insights = useMemo(
    () => [
      { label: "Curated trails", value: "24" },
      { label: "Artist circles", value: "08" },
      { label: "Sync ideas", value: "5m" },
    ],
    []
  );

  const renderCard = useCallback(({ item }: { item: InspirationCard }) => {
    return (
      <ImageBackground
        source={{ uri: item.image }}
        style={styles.card}
        imageStyle={styles.cardImage}
      >
        <LinearGradient
          colors={["rgba(5,6,13,0.15)", "rgba(5,6,13,0.9)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardLabel}>{item.mood}</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
            </View>
            <View style={styles.locationRow}>
              <MapPin color={Colors.palette.accent} size={16} />
              <Text style={styles.locationText}>{item.location}</Text>
            </View>
          </View>
          <Text style={styles.cardPrompt}>{item.prompt}</Text>
        </View>
      </ImageBackground>
    );
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.backdrop} />
      <View style={[styles.safeLayer, { paddingTop: insets.top }]}>
        <Text style={styles.heading}>Inspiration vault</Text>
        <Text style={styles.subheading}>Micro-briefs to stretch your lens tonight</Text>
        <View style={styles.insightRow}>
          {insights.map((insight) => (
            <View key={insight.label} style={styles.insightPill} testID={`insight-${insight.label}`}>
              <Text style={styles.insightValue}>{insight.value}</Text>
              <Text style={styles.insightLabel}>{insight.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.ambientCard}>
          <View style={styles.ambientTextBlock}>
            <Text style={styles.ambientTitle}>Ambient drone</Text>
            <Text style={styles.ambientDescription}>
              Layer soft chords while you set your shot list.
            </Text>
          </View>
          <Pressable
            testID="ambient-toggle"
            style={[styles.ambientButton, isPlaying && styles.ambientButtonActive]}
            onPress={handleToggleAmbient}
            disabled={isLoading}
          >
            {isPlaying ? (
              <Pause color={Colors.palette.textPrimary} size={20} />
            ) : (
              <Play color={Colors.palette.textPrimary} size={20} />
            )}
          </Pressable>
        </View>
        {audioError ? <Text style={styles.errorText}>{audioError}</Text> : null}
        <FlatList
          testID="inspiration-list"
          data={inspirationSets}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
        <View style={styles.footerNote}>
          <Music3 color={Colors.palette.accentSecondary} size={18} />
          <Text style={styles.footerText}>Sync new briefs nightly at 21:00 local</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.palette.background,
  },
  backdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: Colors.palette.elevated,
    opacity: 0.35,
  },
  safeLayer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heading: {
    color: Colors.palette.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  subheading: {
    color: Colors.palette.textMuted,
    fontSize: 15,
    marginBottom: 18,
  },
  insightRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 22,
  },
  insightPill: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.palette.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  insightValue: {
    color: Colors.palette.accent,
    fontSize: 20,
    fontWeight: "700",
  },
  insightLabel: {
    color: Colors.palette.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  ambientCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 24,
    backgroundColor: Colors.palette.elevated,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },
  ambientTextBlock: {
    flex: 1,
    marginRight: 16,
  },
  ambientTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  ambientDescription: {
    color: Colors.palette.textMuted,
    fontSize: 14,
  },
  ambientButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.palette.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  ambientButtonActive: {
    backgroundColor: Colors.palette.accent,
  },
  errorText: {
    color: Colors.palette.danger,
    fontSize: 13,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 32,
    gap: 18,
  },
  card: {
    height: 220,
    borderRadius: 28,
    overflow: "hidden",
  },
  cardImage: {
    borderRadius: 28,
  },
  cardContent: {
    flex: 1,
    justifyContent: "space-between",
    padding: 20,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  cardLabel: {
    color: Colors.palette.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationText: {
    color: Colors.palette.textPrimary,
    fontSize: 13,
  },
  cardPrompt: {
    color: Colors.palette.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  footerText: {
    color: Colors.palette.textMuted,
    fontSize: 13,
  },
});
