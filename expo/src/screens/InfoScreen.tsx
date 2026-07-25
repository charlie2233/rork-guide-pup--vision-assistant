import React, { useCallback } from "react";
import { AccessibilityInfo, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { InfoLinkButton } from "@/src/components/InfoLinkButton";
import { appConfig, isConfiguredUrl } from "@/src/lib/config";
import { useGuidePupRouter } from "@/src/lib/router";
import { captureAppError } from "@/src/lib/sentry";

type InfoPageKey = "privacy" | "support" | "safety";

interface InfoPageSection {
  body: string;
  title: string;
}

interface RelatedRoute {
  description: string;
  href: `/${string}`;
  label: string;
}

interface InfoPage {
  actionHint?: string;
  actionLabel?: string;
  actionUrl?: string;
  actionUrlMissingMessage?: string;
  relatedRoutes?: RelatedRoute[];
  sections: InfoPageSection[];
  summary: string;
  title: string;
  testID: string;
}

const INFO_PAGES: Record<InfoPageKey, InfoPage> = {
  privacy: {
    title: "Privacy Summary",
    summary:
      "This short summary covers sampled camera frames, optional Apple speech recognition, an installation-scoped identifier, and bounded diagnostics.",
    sections: [
      {
        title: "Scene guidance",
        body: "Guide Pup sends sampled compressed camera frames, an installation-scoped bootstrap token, a session identifier, and bounded request metadata to its backend for scene analysis, authentication, safety controls, and rate limiting.",
      },
      {
        title: "Voice and Apple Speech",
        body: "Hands-free commands are optional. Guide Pup prefers on-device speech recognition when iOS supports it; otherwise Apple speech recognition may process voice audio. Guide Pup does not intentionally send raw voice audio to its vision providers.",
      },
      {
        title: "Diagnostics",
        body: "Guide Pup may retain bounded product-interaction, performance, provider, request, and sanitized error data. Derived guidance results such as confidence, direction, and hazard level support service-quality analytics, not tracking. Guide Pup does not intentionally log raw camera frames, raw voice audio, credentials, signed URLs, or installation identifiers.",
      },
      {
        title: "Temporary camera files",
        body: "The camera fallback removes temporary frame files after capture and retries bounded cleanup later if immediate deletion does not succeed. An operating-system cache file may remain until a retry or system cleanup.",
      },
    ],
    actionLabel: "Open full privacy policy",
    actionHint: "Double tap to open the full privacy policy in your browser.",
    actionUrl: appConfig.privacyPolicyUrl,
    actionUrlMissingMessage: "Privacy policy URL is not configured yet.",
    relatedRoutes: [
      {
        label: "Support",
        description: "Report issues or unexpected behavior.",
        href: "/support",
      },
      {
        label: "Safety / emergency",
        description: "Read the safe fallback and emergency disclaimer.",
        href: "/safety",
      },
    ],
    testID: "privacy-policy-screen",
  },
  support: {
    title: "Support",
    summary:
      "Use this page if Guide Pup is broken, silent, or behaving in a way that does not feel safe.",
    sections: [
      {
        title: "What to include",
        body: "Stop guidance first, then include the screen you were on, the device model, the app version, and whether the issue happened on iPhone or Android.",
      },
      {
        title: "What support is for",
        body: "Use support for setup problems, audio issues, backend failures, unexpected STOP states, and general app troubleshooting.",
      },
      {
        title: "What support is not for",
        body: "If you are in immediate danger, stop using the app and contact local emergency services or nearby people directly.",
      },
    ],
    actionLabel: "Open support",
    actionHint: "Double tap to open the configured support destination.",
    actionUrl: appConfig.supportUrl,
    actionUrlMissingMessage: "Support URL or support email is not configured yet.",
    relatedRoutes: [
      {
        label: "Privacy Policy",
        description: "See how frames and diagnostics are handled.",
        href: "/privacy",
      },
      {
        label: "Safety / emergency",
        description: "Review the assistive guidance disclaimer.",
        href: "/safety",
      },
    ],
    testID: "support-screen",
  },
  safety: {
    title: "Safety / Emergency",
    summary:
      "Guide Pup gives assistive guidance, but it is not guaranteed hazard detection and can stop with a safe fallback when the scene is unclear.",
    sections: [
      {
        title: "Assistive guidance only",
        body: "Guide Pup helps with orientation and spoken cues. It does not promise to detect every curb, drop-off, stair, obstacle, or surface hazard.",
      },
      {
        title: "When STOP appears",
        body: "STOP means pause, reorient the phone, and wait for clearer guidance before moving again.",
      },
      {
        title: "In an emergency",
        body: "If there is immediate danger, stop using the app and contact local emergency services or nearby people directly.",
      },
    ],
    actionHint: "Double tap to open the public safety page in your browser.",
    actionLabel: "Open safety page",
    actionUrl: appConfig.safetyUrl,
    actionUrlMissingMessage: "Public safety page URL is not configured yet.",
    relatedRoutes: [
      {
        label: "Support",
        description: "Report the behavior that led to STOP.",
        href: "/support",
      },
      {
        label: "Privacy Policy",
        description: "Review data handling and release disclosures.",
        href: "/privacy",
      },
    ],
    testID: "safety-screen",
  },
};

export default function InfoScreen({ pageKey }: { pageKey: InfoPageKey }) {
  const router = useGuidePupRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const page = INFO_PAGES[pageKey];
  const hasActionUrl = isConfiguredUrl(page.actionUrl);

  const handleBack = useCallback(() => {
    if (Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(`Leaving ${page.title}`);
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace("/");
  }, [navigation, page.title, router]);

  const handlePrimaryAction = useCallback(async () => {
    if (!hasActionUrl || !page.actionUrl) {
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility(page.actionUrlMissingMessage || "This link is not configured yet.");
      }
      return;
    }

    try {
      await Linking.openURL(page.actionUrl);
    } catch (error) {
      void captureAppError(error, {
        pageKey,
        route: page.actionUrl,
        screen: "InfoScreen",
      });
      if (Platform.OS === "ios") {
        AccessibilityInfo.announceForAccessibility("Could not open the requested page.");
      }
    }
  }, [hasActionUrl, page.actionUrl, page.actionUrlMissingMessage, pageKey]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]} testID={page.testID}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Double tap to return to the previous screen"
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          testID={`${pageKey}-back-button`}
        >
          <ChevronLeft color={Colors.palette.textPrimary} size={24} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{page.title}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 32) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{page.title}</Text>
          <Text style={styles.heroSummary}>{page.summary}</Text>
        </View>

        <View style={styles.section}>
          {page.sections.map((section) => (
            <View key={section.title} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>

        {page.actionLabel ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Open a document</Text>
            <InfoLinkButton
              accessibilityHint={page.actionHint || "Double tap to open the linked page"}
              accessibilityLabel={page.actionLabel}
              description={
                hasActionUrl
                  ? "Open the configured page in your browser."
                  : page.actionUrlMissingMessage || "This link will be available after release configuration."
              }
              disabled={!hasActionUrl}
              onPress={handlePrimaryAction}
              testID={`${pageKey}-primary-action`}
              title={page.actionLabel}
            />
          </View>
        ) : null}

        {page.relatedRoutes?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Related resources</Text>
            <View style={styles.linkGroup}>
              {page.relatedRoutes.map((route) => (
                <InfoLinkButton
                  key={route.href}
                  accessibilityHint={`Double tap to open ${route.label}`}
                  accessibilityLabel={route.label}
                  description={route.description}
                  onPress={() => router.push(route.href as never)}
                  testID={`${pageKey}-${route.href.replace("/", "")}-link`}
                  title={route.label}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footerCard}>
          <Text style={styles.footerText}>{appConfig.emergencyDisclaimer}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.palette.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 18,
    gap: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingRight: 8,
  },
  backButtonPressed: {
    opacity: 0.72,
  },
  backButtonText: {
    color: Colors.palette.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  headerTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 25,
    fontWeight: "800",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 18,
  },
  heroCard: {
    backgroundColor: Colors.palette.elevated,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    padding: 24,
  },
  heroTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40,
  },
  heroSummary: {
    color: Colors.palette.textMuted,
    fontSize: 18,
    lineHeight: 26,
  },
  section: {
    gap: 12,
  },
  sectionCard: {
    backgroundColor: Colors.palette.surface,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  sectionTitle: {
    color: Colors.palette.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionBody: {
    color: Colors.palette.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  linkGroup: {
    gap: 12,
  },
  footerCard: {
    backgroundColor: "rgba(255,179,71,0.12)",
    borderColor: "rgba(255,179,71,0.24)",
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  footerText: {
    color: Colors.palette.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
});
