import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("voice command ownership follows the focused route", () => {
  const home = read("../src/screens/HomeScreen.tsx");
  const navigation = read("../src/screens/NavigationScreen.tsx");

  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{/);
  assert.match(home, /isFocusedRef\.current = false;[\s\S]*stopOwnedVoiceSession\(\{/);
  assert.match(home, /if \(!isFocusedRef\.current\) \{\s*return;/);

  assert.match(navigation, /useFocusEffect\(useCallback\(\(\) => \{/);
  assert.match(navigation, /isScreenFocusedRef\.current = false;[\s\S]*stopOwnedVoiceSession\(\{/);
  assert.match(navigation, /if \(!isScreenFocusedRef\.current\) \{\s*return;/);
});

test("STOP remains armed throughout spoken guidance", () => {
  const voiceCommands = read("../src/lib/voiceCommands.ts");
  const conversationLane = read("../src/lib/conversationLane.ts");
  const nativeVoice = read("../modules/guidepup-voice-control/ios/GuidePupVoiceControlController.swift");

  assert.doesNotMatch(voiceCommands, /TTS_STOP_SELF_TRIGGER_MATCHER/);
  assert.match(voiceCommands, /return Boolean\(normalizeVoiceTranscript\(spokenText\)\);/);
  assert.match(conversationLane, /speech\s*&& isGuiding\s*&& canKeepListeningForStopBargeInDuringSpeech/);
  assert.match(nativeVoice, /mode: \.voiceChat/);
  assert.match(nativeVoice, /setVoiceProcessingEnabled\(true\)/);
});

test("voice command startup and cleanup are scoped to an owner token", () => {
  const nativeVoice = read("../modules/guidepup-voice-control/ios/GuidePupVoiceControlController.swift");
  const wrapper = read("../src/native/GuidePupVoiceControl.ts");
  const helper = read("../src/lib/ownedVoiceSession.ts");
  const home = read("../src/screens/HomeScreen.tsx");
  const navigation = read("../src/screens/NavigationScreen.tsx");

  assert.match(nativeVoice, /commandSessionOwnerToken = ownerToken/);
  assert.match(nativeVoice, /if let ownerToken, self\.commandSessionOwnerToken != ownerToken/);
  assert.match(wrapper, /createGuidePupVoiceSessionOwnerToken/);
  assert.match(wrapper, /stopCommandSession\(options\?\.ownerToken \?\? null\)/);
  assert.match(helper, /catch \(error\)[\s\S]*if \(!input\.isCurrent\(\)\)[\s\S]*input\.stop\(input\.ownerToken\)/);
  assert.match(home, /startOwnedVoiceSession\(\{/);
  assert.match(home, /stopOwnedVoiceSession\(\{/);
  assert.match(navigation, /startOwnedVoiceSession\(\{/);
  assert.match(navigation, /stopOwnedVoiceSession\(\{/);
  assert.match(
    navigation,
    /const stopRuntimeAndObserve = useCallback\(async \(\) => \{[\s\S]*?invalidateOwnedVoiceSessionAttempts\(voiceSessionAttemptGenerationRef\);[\s\S]*?voiceSessionOwnerTokenRef\.current = null;[\s\S]*?GuidePupVoiceControl\.stopCommandSession\(\)/,
    "Deterministic STOP must invalidate pending starts before clearing ownership and globally stopping.",
  );
  assert.match(navigation, /stopCommandSession\(\{ ownerToken: ownedToken \}\)/);
  assert.match(navigation, /subscribeToStableVoiceRoute\(\{/);
  assert.match(
    navigation,
    /const unsubscribe = subscribeToStableVoiceRoute\(\{[\s\S]*return \(\) => \{\s*unsubscribe\(\);[\s\S]*\}, \[\]\)\);/,
  );
  const stableSubscriptionEffect = navigation.match(
    /useFocusEffect\(useCallback\(\(\) => \{\s*const unsubscribe = subscribeToStableVoiceRoute\(\{[\s\S]*?\}, \[\]\)\);/,
  )?.[0] ?? "";
  assert.doesNotMatch(stableSubscriptionEffect, /startCommandSession|stopCommandSession|stopOwnedVoiceSession/);
  assert.doesNotMatch(
    navigation,
    /\}, \[isSpeaking,[^\]]*\]\);/,
    "Speech-state rerenders must not recreate command response callbacks.",
  );
  assert.match(
    navigation,
    /if \(stopOperationInFlightRef\.current && intent !== "stop-guidance"\) \{\s*return;/,
    "Queued non-STOP intents must remain inert while STOP observation is active.",
  );
  assert.match(
    navigation,
    /case "start-guidance":\s*if \(resumeGuidanceForVoice\(\) && permission\?\.granted\) \{/,
    "Analysis may start only after guidance resume succeeds.",
  );
  assert.match(
    navigation,
    /const observation = await stopRuntimeAndObserve\(\);\s*if \(!stopOperationIsCurrent\(\)\) \{\s*return;/,
    "Voice STOP must reject completion from an old focus before follow-up effects.",
  );
  assert.match(navigation, /finishVoiceStopOperation\(\{/);
});

test("paused and replaced guidance sessions reject stale frame results", () => {
  const navigation = read("../src/screens/NavigationScreen.tsx");
  const vision = read("../src/logic/VisionAI.ts");
  const api = read("../src/lib/api.ts");

  assert.match(navigation, /activeAnalysisControllerRef\.current\?\.abort\(\)/);
  assert.match(navigation, /const analysisGeneration = analysisGenerationRef\.current;/);
  assert.match(
    navigation,
    /const analysisIsCurrent = \(\) =>\s*analysisGenerationRef\.current === analysisGeneration[\s\S]*guidingRef\.current[\s\S]*isScreenFocusedRef\.current/,
  );
  assert.match(
    navigation,
    /signal: analysisController\.signal[\s\S]*if \(!analysisIsCurrent\(\) \|\| !rawResult\) \{\s*return;/,
  );
  assert.match(navigation, /catch \(error\) \{\s*if \(isAbortError\(error\)\) \{\s*return;/);
  assert.match(vision, /throwIfAborted\(options\?\.signal\)[\s\S]*await preprocessFrame[\s\S]*throwIfAborted\(options\?\.signal\)/);
  assert.match(vision, /signal: options\?\.signal/);
  assert.match(api, /fetchWithTimeout\([\s\S]*signal\);/);
  assert.match(api, /externalSignal\?\.addEventListener\("abort", abortFromCaller/);
});

test("STOP invalidates queued speech before native work can resume", () => {
  const voiceProvider = read("../src/components/VoiceAnnouncer.tsx");
  const navigation = read("../src/screens/NavigationScreen.tsx");
  const home = read("../src/screens/HomeScreen.tsx");

  assert.match(
    voiceProvider,
    /const voiceState = await GuidePupVoiceControl\.getState\(\)[\s\S]*if \(sessionRef\.current !== sessionId\) \{\s*return;/,
  );
  assert.match(
    voiceProvider,
    /const stop = useCallback\(\(\) => \{\s*sessionRef\.current \+= 1;[\s\S]*GuidePupVoiceControl\.stopSpeaking\(\)/,
  );
  assert.match(
    navigation,
    /const voiceOverState = voiceOverStateRef\.current;[\s\S]*GuidePupVoiceControl\.stopSpeaking\(\)[\s\S]*GuidePupNavigationCore\.stopSession\(\)/,
  );
  assert.match(home, /voiceResponseGenerationRef\.current \+= 1;[\s\S]*GuidePupVoiceControl\.stopSpeaking\(\)/);
  assert.match(home, /const responseIsCurrent = \(\) =>[\s\S]*voiceResponseGenerationRef\.current === responseGeneration/);
  assert.match(navigation, /staleSpeechObserved \|\|= lastObservation\.staleSpeechAfterStop/);
  assert.match(navigation, /voiceSessionOwnerTokenRef\.current = null;[\s\S]*GuidePupVoiceControl\.stopCommandSession\(\)/);
  assert.equal(
    navigation.match(/GuidePupVoiceControl\.stopCommandSession\(\)/g)?.length,
    1,
    "Only the deterministic STOP path may stop an unscoped command session.",
  );
  assert.doesNotMatch(home, /GuidePupVoiceControl\.stopCommandSession\(\)/);
  assert.doesNotMatch(voiceProvider, /stopCommandSession/);
});

test("native frames expire and camera ownership is released before JS fallback", () => {
  const cameraController = read("../modules/guidepup-navigation-core/ios/GuidePupCameraSessionController.swift");
  const navigation = read("../src/screens/NavigationScreen.tsx");
  const navigationWrapper = read("../src/native/GuidePupNavigationCore.ts");

  assert.match(cameraController, /maximumSampleAgeMs = 1_500\.0/);
  assert.match(cameraController, /CMSampleBufferGetPresentationTimeStamp/);
  assert.match(cameraController, /CMSyncConvertTime/);
  assert.match(cameraController, /presentationAgeMs <= Self\.maximumSampleAgeMs/);
  assert.match(cameraController, /sampleGeneration == activeFrameGeneration/);
  assert.match(cameraController, /"timestampMs": sample\.timestampMs/);
  assert.match(cameraController, /AVCaptureSession\.wasInterruptedNotification/);
  assert.match(cameraController, /UIApplication\.didEnterBackgroundNotification/);
  assert.match(cameraController, /latestSampleTimestampMs = nil/);
  assert.match(navigationWrapper, /const startedAt = Date\.now\(\);[\s\S]*timestampMs: startedAt/);

  assert.match(
    navigation,
    /if \(navigationCorePath === "native-core"\) \{\s*await GuidePupNavigationCore\.stopSession\(\)[\s\S]*setNavigationCorePath\("js-fallback"\)/,
  );
  assert.match(navigation, /navigationCorePath === "js-fallback"[\s\S]*GuidePupNavigationCore\.stopSession\(\)/);
});

test("speech delivery uses one VoiceOver-aware channel and stop control is explicit", () => {
  const navigation = read("../src/screens/NavigationScreen.tsx");
  const home = read("../src/screens/HomeScreen.tsx");
  const navigationModule = read("../modules/guidepup-navigation-core/ios/GuidePupNavigationCoreModule.swift");

  assert.match(navigation, /type VoiceOverState = "disabled" \| "enabled" \| "unknown"/);
  assert.match(navigation, /voiceOverStateRef = useRef<VoiceOverState>\("unknown"\)/);
  assert.match(home, /voiceOverStateRef = useRef<VoiceOverState>\("unknown"\)/);
  assert.match(navigation, /\.catch\(\(\) => \{\s*voiceOverStateRef\.current = "enabled";/);
  assert.match(home, /\.catch\(\(\) => \{\s*voiceOverStateRef\.current = "enabled";/);
  assert.match(
    navigation,
    /if \(voiceOverState === "enabled"\)[\s\S]*GuidePupNavigationCore\.announce\(message, announcementOwnerToken\)[\s\S]*GuidePupNavigationCore\.cancelAnnouncement\(announcementOwnerToken\)[\s\S]*speak\(message/,
  );
  assert.doesNotMatch(navigation, /voiceOverRunningRef/);
  assert.match(navigation, /voiceOverAnnouncementActiveRef\.current = true;[\s\S]*isSpeakingRef\.current = true;/);
  assert.match(navigation, /speechListeningOverlapReason: keepListeningDuringSpeech \? "stop-barge-in"/);
  assert.match(
    navigation,
    /const voiceState = await GuidePupVoiceControl\.getState\(\)[\s\S]*announcementOwnerTokenRef\.current !== announcementOwnerToken[\s\S]*voiceOverSpeechGenerationRef\.current !== speechGeneration[\s\S]*listening: voiceState\?\.listening[\s\S]*GuidePupNavigationCore\.announce\(message, announcementOwnerToken\)/,
  );
  assert.doesNotMatch(navigation, /shouldPauseListening/);
  assert.doesNotMatch(navigation, /cameraMessage[\s\S]{0,180}keepListeningDuringSpeech:\s*false/);
  assert.match(navigationModule, /accessibilitySpeechQueueAnnouncement/);
  assert.match(navigationModule, /let ownerToken: String/);
  assert.match(navigationModule, /private var currentOwnerToken: String\?/);
  assert.match(navigationModule, /func claimOwner\(_ rawOwnerToken: String\) async/);
  assert.match(navigationModule, /func releaseOwner\(_ rawOwnerToken: String\) async/);
  assert.match(
    navigationModule,
    /func cancel\(ownerToken rawOwnerToken: String\) async \{[\s\S]*self\.currentOwnerToken == ownerToken,[\s\S]*self\.pendingAnnouncement\?\.ownerToken == ownerToken[\s\S]*interruptCurrentAnnouncement\(\)[\s\S]*finishPendingAnnouncement\(\)/,
  );
  assert.match(
    navigationModule,
    /guard currentOwnerToken == ownerToken else \{[\s\S]*continuation\.resume\(returning: \(\)\)/,
  );
  assert.match(navigationModule, /private func interruptCurrentAnnouncement\(\)[\s\S]*accessibilitySpeechQueueAnnouncement[\s\S]*value: false/);
  assert.match(navigationModule, /AsyncFunction\("cancelAnnouncement"\)/);
  assert.match(navigationModule, /AsyncFunction\("claimAnnouncementOwner"\)/);
  assert.match(navigationModule, /AsyncFunction\("interruptAllAnnouncements"\)/);
  assert.match(navigationModule, /AsyncFunction\("releaseAnnouncementOwner"\)/);
  assert.match(navigationModule, /AsyncFunction\("supersedeAnnouncement"\)/);
  assert.doesNotMatch(home, /cancelAnnouncement\(\s*\)/);
  assert.doesNotMatch(navigation, /cancelAnnouncement\(\s*\)/);
  assert.doesNotMatch(home, /interruptAllAnnouncements/);
  assert.equal(
    navigation.match(/GuidePupNavigationCore\.interruptAllAnnouncements\(\)/g)?.length,
    1,
    "Only deterministic STOP may globally interrupt VoiceOver speech.",
  );
  assert.match(navigation, /accessibilityLabel="Stop guidance"/);
  assert.match(navigation, /accessibilityRole="button"/);
  assert.match(navigation, /name: "longpress", label: "SOS information"/);
  assert.doesNotMatch(navigation, /accessibilityLabel="Navigation screen"/);
});

test("camera and speech recovery events fail closed and remain bounded", () => {
  const cameraController = read("../modules/guidepup-navigation-core/ios/GuidePupCameraSessionController.swift");
  const navigationModule = read("../modules/guidepup-navigation-core/ios/GuidePupNavigationCoreModule.swift");
  const navigationWrapper = read("../src/native/GuidePupNavigationCore.ts");
  const nativeVoice = read("../modules/guidepup-voice-control/ios/GuidePupVoiceControlController.swift");
  const navigation = read("../src/screens/NavigationScreen.tsx");

  assert.match(cameraController, /maximumRecoveryAttempts = 3/);
  assert.match(cameraController, /case exhausted/);
  assert.match(cameraController, /onStateChanged\?\(payload\)/);
  assert.match(navigationModule, /Events\("onStateChanged"\)/);
  assert.match(navigationWrapper, /addStateListener\(listener:/);
  assert.match(navigation, /GuidePupNavigationCore\.addStateListener/);
  assert.match(navigation, /Stop\. Camera was interrupted\. Waiting to recover\./);
  assert.match(navigation, /Camera could not recover\. Guidance is paused\./);

  assert.match(nativeVoice, /maximumRecoveryAttempts = 3/);
  assert.match(nativeVoice, /recoveryStabilityDelay: TimeInterval = 10/);
  assert.match(nativeVoice, /AVAudioSession\.routeChangeNotification/);
  assert.match(nativeVoice, /AVAudioSession\.mediaServicesWereLostNotification/);
  assert.match(nativeVoice, /AVAudioSession\.mediaServicesWereResetNotification/);
  assert.match(nativeVoice, /stopSpeakingImmediately\(\)[\s\S]*stopListeningSession\(preserveConfiguration: true\)/);
  assert.match(nativeVoice, /"recoveryState": currentRecoveryState\.rawValue/);
  assert.doesNotMatch(nativeVoice, /private func markRecognitionHealthy\(\) \{[\s\S]{0,120}recoveryAttemptCount = 0/);
  assert.match(navigation, /enterVoiceRecoveryHold\(recoveryState\)/);
  assert.match(navigation, /recoveryState === "idle" && state\.listening[\s\S]*clearVoiceRecoveryHold\(\)/);
  assert.match(navigation, /runtimeSafetyHoldRef\.current = true/);
  assert.match(navigation, /recoveryFreshFrameAfterMsRef\.current/);
  assert.match(navigation, /Voice control could not recover\. Guidance is paused\./);
});

test("STOP evidence stays unknown until camera, listening, speech, and analysis are observed quiet", () => {
  const diagnostics = read("../src/lib/diagnostics.ts");
  const navigation = read("../src/screens/NavigationScreen.tsx");

  assert.match(navigation, /cutThrough: null/);
  assert.match(navigation, /cameraInactiveAfterStop: null/);
  assert.match(navigation, /listeningStoppedAfterStop: null/);
  assert.match(navigation, /STOP_OBSERVATION_QUIET_WINDOW_MS/);
  assert.match(navigation, /await stopRuntimeAndObserve\(\)/);
  assert.match(navigation, /GuidePupNavigationCore\.stopSession\(\)/);
  assert.match(navigation, /GuidePupVoiceControl\.stopCommandSession\(\)/);
  assert.match(diagnostics, /cutThrough: boolean \| null/);
  assert.match(diagnostics, /cameraInactiveAfterStop: boolean \| null/);
  assert.match(diagnostics, /postStopObservedAt: number \| null/);
  assert.match(diagnostics, /speechInputConfirmed: false,\s*spokenOutputConfirmed: false,/);
  assert.doesNotMatch(
    diagnostics,
    /speechInputConfirmed:\s*(?:diagnostics|snapshot|voice|permission|available)/,
  );
  assert.match(diagnostics, /input\.stopBargeIn\.cameraInactiveAfterStop === true/);
});

test("standalone no-screen validation is bound to clean source and the signed candidate", () => {
  const validator = read("./validate-no-screen-smoke-evidence.mjs");

  assert.match(validator, /resolveReleaseSourceState/);
  assert.match(validator, /validateReleaseCandidateEvidence/);
  assert.match(validator, /validateSmokeArtifactContract/);
  assert.match(validator, /expectedCandidateBinarySha256: candidate\.archive\.binarySha256/);
  assert.match(validator, /expectedBackendSmokeArtifact: backendSmoke/);
  assert.match(validator, /requireCandidateBinding: true/);
});

test("settings report persistence success before confirmation", () => {
  const provider = read("../src/providers/SettingsProvider.tsx");
  const home = read("../src/screens/HomeScreen.tsx");
  const navigation = read("../src/screens/NavigationScreen.tsx");

  assert.match(provider, /persistenceQueueRef\.current\.then\(async \(\) => \{/);
  assert.match(provider, /await AsyncStorage\.setItem/);
  assert.match(provider, /StoredSettingsSchema = z\.object/);
  assert.match(provider, /StoredSettingsSchema\.parse\(JSON\.parse\(stored\)\)/);
  assert.match(provider, /persistenceQueueRef\.current\.then\(loadSettings\)/);
  assert.match(provider, /setSettings\(next\);\s*return true;/);
  assert.match(provider, /return false;/);
  assert.match(home, /I could not save the speech rate\. The setting was not changed\./);
  assert.match(navigation, /I could not save the haptics setting\. The setting was not changed\./);
});
