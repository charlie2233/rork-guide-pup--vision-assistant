import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function findJsxControlByTestId(source, fileName, testID) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let match = null;

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const testIdAttribute = node.attributes.properties.find(
        (property) =>
          ts.isJsxAttribute(property)
          && property.name.text === "testID"
          && property.initializer
          && ts.isStringLiteral(property.initializer)
          && property.initializer.text === testID,
      );
      if (testIdAttribute) {
        assert.equal(match, null, `Expected one JSX control with testID "${testID}" in ${fileName}.`);
        match = node;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(match, `Missing JSX control with testID "${testID}" in ${fileName}.`);
  return match;
}

function getJsxAttribute(openingElement, attributeName) {
  return openingElement.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === attributeName,
  ) ?? null;
}

function getStringJsxAttribute(openingElement, attributeName) {
  const attribute = getJsxAttribute(openingElement, attributeName);
  assert.ok(attribute, `Missing ${attributeName} on the selected JSX control.`);
  assert.ok(attribute.initializer && ts.isStringLiteral(attribute.initializer), `${attributeName} must be a string literal.`);
  return attribute.initializer.text;
}

function getExpressionJsxAttribute(openingElement, attributeName) {
  const attribute = getJsxAttribute(openingElement, attributeName);
  assert.ok(attribute, `Missing ${attributeName} on the selected JSX control.`);
  assert.ok(
    attribute.initializer
      && ts.isJsxExpression(attribute.initializer)
      && attribute.initializer.expression,
    `${attributeName} must be a JSX expression.`,
  );
  return attribute.initializer.expression.getText();
}

function getStyleLiteral(source, fileName, styleName, propertyName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let styles = null;

  function visit(node) {
    if (
      ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === "StyleSheet.create"
      && node.arguments.length === 1
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      assert.equal(styles, null, `Expected one StyleSheet.create call in ${fileName}.`);
      styles = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(styles, `Missing StyleSheet.create call in ${fileName}.`);

  const style = styles.properties.find(
    (property) =>
      ts.isPropertyAssignment(property)
      && property.name.getText(sourceFile).replaceAll("\"", "") === styleName,
  );
  assert.ok(style && ts.isObjectLiteralExpression(style.initializer), `Missing ${styleName} style in ${fileName}.`);

  const value = style.initializer.properties.find(
    (property) =>
      ts.isPropertyAssignment(property)
      && property.name.getText(sourceFile).replaceAll("\"", "") === propertyName,
  );
  assert.ok(value && ts.isPropertyAssignment(value), `Missing ${styleName}.${propertyName} in ${fileName}.`);

  if (ts.isStringLiteral(value.initializer) || ts.isNumericLiteral(value.initializer)) {
    return value.initializer.text;
  }

  assert.fail(`${styleName}.${propertyName} must be a string or numeric literal in ${fileName}.`);
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    assert.match(hex, /^#[0-9A-F]{6}$/i, `Expected a six-digit hex color, received ${hex}.`);
    const channels = hex
      .slice(1)
      .match(/.{2}/g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

test("the visible navigation hint has normal-text contrast on its surface", () => {
  const navigation = read("../src/screens/NavigationScreen.tsx");
  const foreground = getStyleLiteral(navigation, "NavigationScreen.tsx", "hintText", "color");
  const background = getStyleLiteral(navigation, "NavigationScreen.tsx", "container", "backgroundColor");
  const fontSize = Number(getStyleLiteral(navigation, "NavigationScreen.tsx", "hintText", "fontSize"));
  const ratio = contrastRatio(foreground, background);

  assert.ok(fontSize >= 16, `Navigation hint text must remain at least 16 points; received ${fontSize}.`);
  assert.ok(ratio >= 4.5, `Navigation hint contrast must be at least 4.5:1; received ${ratio.toFixed(2)}:1.`);
});

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
  const runtimeSafety = read("../src/lib/runtimeSafety.ts");
  const settings = read("../src/screens/SettingsScreen.tsx");

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

  assert.match(runtimeSafety, /createCameraOwnershipTransitionCoordinator/);
  assert.match(runtimeSafety, /DEFAULT_NATIVE_START_TIMEOUT_MS = 5_000/);
  assert.match(
    runtimeSafety,
    /startNativeSession\([\s\S]*startTimeoutMs = DEFAULT_NATIVE_START_TIMEOUT_MS[\s\S]*staleCleanupTimeoutMs = DEFAULT_NATIVE_STOP_ATTEMPT_TIMEOUT_MS[\s\S]*settlePromiseWithin\(\s*\(\) => startPromise,\s*startTimeoutMs,\s*"native camera start"[\s\S]*settlePromiseWithin\(\s*stopSession,\s*staleCleanupTimeoutMs,\s*"stale native camera cleanup"/,
    "Native camera startup and stale cleanup must both be deadline-bounded.",
  );
  assert.match(
    runtimeSafety,
    /error instanceof GuidePupDeadlineError[\s\S]*startPromise\.then\([\s\S]*enqueue\(async \(\) => \{[\s\S]*nativeOwnershipGeneration[\s\S]*settlePromiseWithin\(\s*stopSession,\s*staleCleanupTimeoutMs,\s*"late native camera cleanup"/,
    "A native start that resolves after its deadline must receive serialized bounded cleanup.",
  );
  assert.match(
    runtimeSafety,
    /releaseNativeForFallback\([\s\S]*settlePromiseWithin\(\s*stopSession,\s*stopTimeoutMs,\s*"native camera release for fallback"[\s\S]*if \(!isCurrent\(generation\)\)[\s\S]*fallbackOwnershipGeneration = generation/,
  );
  assert.match(navigation, /grantFallbackCameraAfterNativeRelease/);
  assert.match(navigation, /releaseNativeForFallback\([\s\S]*\(\) => GuidePupNavigationCore\.stopSession\(\)/);
  assert.match(runtimeSafety, /markFallbackReady\(generation: number\)/);
  assert.match(runtimeSafety, /isFallbackReady\(generation: number\)/);
  assert.match(
    runtimeSafety,
    /requestNativeStop\(\s*stopSession: \(\) => Promise<unknown>,\s*maxAttempts = 1,\s*attemptTimeoutMs =/,
  );
  assert.match(
    runtimeSafety,
    /currentStopRequest && isCurrent\(currentStopRequest\.generation\)[\s\S]*created: false/,
    "STOP and the inactive-session effect must reuse one current native shutdown.",
  );
  assert.match(
    runtimeSafety,
    /const boundedAttempts = Math\.max\(1, Math\.min\(3, Math\.floor\(maxAttempts\)\)\)[\s\S]*attempt < boundedAttempts[\s\S]*settlePromiseWithin\(\s*stopSession,\s*attemptTimeoutMs,\s*"native camera stop"/,
  );
  assert.match(
    navigation,
    /grantFallbackCameraAfterNativeRelease[\s\S]*cameraTransitionReadyRef\.current = false/,
    "Fallback ownership alone must not make analysis ready.",
  );
  assert.match(
    navigation,
    /handleFallbackCameraReady[\s\S]*markFallbackReady\(ownershipGeneration\)[\s\S]*cameraTransitionReadyRef\.current = true/,
    "Fallback analysis becomes ready only after the mounted camera reports readiness.",
  );
  assert.match(
    navigation,
    /fallbackCameraOwnershipGranted && fallbackCameraActive \? \(\s*<CameraView[\s\S]*active=\{fallbackCameraOwnershipGranted && fallbackCameraActive\}/,
    "The CameraView mount and active prop must both require granted post-release ownership.",
  );
  assert.match(
    navigation,
    /key=\{`fallback-camera-\$\{fallbackCameraOwnership\.generation\}-\$\{fallbackCameraOwnership\.pathRequestKey\}`\}/,
    "Every fallback owner must receive a distinct CameraView mount.",
  );
  assert.match(
    navigation,
    /onCameraReady=\{\(\) => handleFallbackCameraReady\(fallbackCameraOwnership\.generation\)\}/,
    "Camera readiness must carry the generation captured by that CameraView mount.",
  );
  assert.match(
    navigation,
    /handleFallbackCameraMountError\(fallbackCameraOwnership\.generation, event\)/,
    "Camera mount errors must carry the generation captured by that CameraView mount.",
  );
  assert.match(navigation, /const requestNativeCameraStop = useCallback/);
  assert.match(navigation, /const CAMERA_START_TIMEOUT_MS = 5_000/);
  assert.match(navigation, /const CAMERA_STOP_MAX_ATTEMPTS = 2/);
  assert.match(navigation, /const CAMERA_STOP_ATTEMPT_TIMEOUT_MS = 750/);
  assert.match(navigation, /const FALLBACK_CAMERA_READY_TIMEOUT_MS = 4_000/);
  assert.match(navigation, /const SHUTDOWN_OPERATION_TIMEOUT_MS = 750/);
  assert.match(navigation, /const STOP_SAFETY_ANNOUNCEMENT_DELIVERY_TIMEOUT_MS = 2_000/);
  assert.match(navigation, /const STOP_CONFIRMATION_DELIVERY_TIMEOUT_MS = 15_000/);
  assert.match(
    navigation,
    /requestNativeStop\([\s\S]*GuidePupNavigationCore\.stopSession\(\),\s*CAMERA_STOP_MAX_ATTEMPTS,\s*CAMERA_STOP_ATTEMPT_TIMEOUT_MS/,
  );
  assert.match(
    navigation,
    /try \{[\s\S]*startNativeSession\([\s\S]*GuidePupNavigationCore\.startSession[\s\S]*GuidePupNavigationCore\.stopSession\(\),\s*CAMERA_START_TIMEOUT_MS,\s*CAMERA_STOP_ATTEMPT_TIMEOUT_MS[\s\S]*\} catch \(error\) \{[\s\S]*grantFallbackOrFailClosed\(errorMessage\)/,
    "A native startup timeout must enter the existing fail-safe fallback handoff.",
  );
  assert.match(
    navigation,
    /if \(!isScreenFocused \|\| !permission\?\.granted \|\| !isGuiding \|\| runtimeSafetyHold\) \{[\s\S]*cameraStopError: unknown = null[\s\S]*await cameraStopRequest\.promise\.catch/,
  );
  assert.doesNotMatch(navigation, /stopNativeCameraForTransition/);
  assert.match(navigation, /fallbackCameraActiveRef\.current = fallbackCameraActive/);
  assert.doesNotMatch(
    navigation,
    /fallbackCameraActiveRef\.current = sessionActive/,
    "Requested readiness must not be recorded as actual fallback camera ownership.",
  );
  assert.match(runtimeSafety, /JS_FALLBACK_VALIDATION_CAMERA_PATH = "js-fallback-validation"/);
  assert.match(runtimeSafety, /requestedPaths\.some\(\(requestedPath\) =>/);
  assert.match(settings, /accessibilityLabel="Test backup camera path"/);
  assert.match(settings, /params: \{ cameraPath: JS_FALLBACK_VALIDATION_CAMERA_PATH \}/);
  assert.match(navigation, /useLocalSearchParams<\{ cameraPath\?: string \| string\[\] \}>\(\)/);
  assert.match(navigation, /const cameraPathTransitionKey = JSON\.stringify\(cameraPath \?\? null\)/);
  assert.match(
    navigation,
    /const transitionGeneration = beginCameraTransition\(\);[\s\S]*if \(forceJsFallbackValidation\)[\s\S]*grantFallbackCameraAfterNativeRelease/,
  );
  assert.match(
    navigation,
    /cameraPathTransitionKey,[\s\S]*forceJsFallbackValidation,[\s\S]*grantFallbackCameraAfterNativeRelease/,
    "Route-param changes must participate in the camera transition effect dependencies.",
  );
  assert.match(navigation, /Backup camera check requested\. Safety controls are unchanged\. Starting camera\./);
  assert.match(navigation, /Backup camera ready\. Guidance active\./);
  assert.match(navigation, /Native camera ready\. Guidance active\./);
  assert.match(
    navigation,
    /scheduleFallbackReadinessDeadline\([\s\S]*FALLBACK_CAMERA_READY_TIMEOUT_MS[\s\S]*failFallbackCameraReadiness/,
    "Fallback ownership must have a generation-bound CameraView readiness deadline.",
  );
  assert.match(
    navigation,
    /const failFallbackCameraReadiness = useCallback\(async[\s\S]*markFallbackUnavailable\(ownershipGeneration\)[\s\S]*invalidateAndAbortAnalysis\(\)[\s\S]*guidingRef\.current = false;[\s\S]*setIsGuiding\(false\);/,
    "Fallback readiness failure must invalidate analysis and stop guidance.",
  );
  assert.match(
    navigation,
    /handleFallbackCameraMountError[\s\S]*failFallbackCameraReadiness\([\s\S]*"mount-error"/,
    "CameraView mount errors must use the same fail-closed path as readiness timeouts.",
  );
  assert.match(navigation, /"timeout"[\s\S]*Fallback camera preview did not become ready/);
  assert.match(navigation, /GuidePupNavigationCore\.playAudioCue\("error"\)/);
  assert.match(navigation, /GuidePupNavigationCore\.playHaptic\("error"\)/);
  assert.doesNotMatch(
    navigation,
    /GuideAI[\s\S]{0,160}(?:fallbackCameraOwnership|scheduleFallbackReadinessDeadline|markFallbackReady)/,
    "GPT-facing analysis must not own fallback-camera lifecycle decisions.",
  );
});

test("shipping UI copy remains assistive and user-facing", () => {
  const settings = read("../src/screens/SettingsScreen.tsx");
  const onboarding = read("../src/screens/OnboardingScreen.tsx");

  assert.match(settings, /Adjust haptic confirmations for spoken guidance\./);
  assert.doesNotMatch(settings, /tester-only/i);
  assert.match(settings, /Review camera, voice, and service status\. Export sanitized diagnostics for support\./);
  assert.match(settings, /Test the backup camera path used when native capture is unavailable\./);
  assert.doesNotMatch(settings, /internal validation/i);
  assert.doesNotMatch(settings, /toggleBoundingBoxes|handleBoundingBoxesToggle|settings\.showBoundingBoxes/);
  assert.doesNotMatch(settings, /Bounding boxes|settings-bounding-boxes-switch/i);
  assert.match(onboarding, /It may miss hazards, so stop whenever you are uncertain\./);
  assert.doesNotMatch(onboarding, /guide you through any space/i);
});

test("speech delivery uses one VoiceOver-aware channel and stop control is explicit", () => {
  const navigation = read("../src/screens/NavigationScreen.tsx");
  const home = read("../src/screens/HomeScreen.tsx");
  const runtimeSafety = read("../src/lib/runtimeSafety.ts");
  const settings = read("../src/screens/SettingsScreen.tsx");
  const announcementPolicy = read(
    "../modules/guidepup-navigation-core/ios/GuidePupAnnouncementDeliveryPolicy.swift",
  );
  const navigationModule = read("../modules/guidepup-navigation-core/ios/GuidePupNavigationCoreModule.swift");
  const navigationWrapper = read("../src/native/GuidePupNavigationCore.ts");
  const homeStartControl = findJsxControlByTestId(home, "HomeScreen.tsx", "home-start-guidance");
  const navigationStopControl = findJsxControlByTestId(
    navigation,
    "NavigationScreen.tsx",
    "navigation-stop-guidance",
  );

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
    /func cancel\(ownerToken rawOwnerToken: String\) async \{[\s\S]*self\.currentOwnerToken == ownerToken,[\s\S]*self\.pendingAnnouncement\?\.ownerToken == ownerToken[\s\S]*interruptCurrentAnnouncement\(\)[\s\S]*completePendingAnnouncement\([\s\S]*\.cancelled/,
  );
  assert.match(
    navigationModule,
    /guard currentOwnerToken == ownerToken else \{[\s\S]*resume\(continuation, disposition: \.ownershipChanged\)/,
    "Stale native announcement owners must reject rather than report successful delivery.",
  );
  assert.match(navigationModule, /var continuations: \[CheckedContinuation<Void, Error>\]/);
  assert.doesNotMatch(navigationModule, /CheckedContinuation<Void, Never>/);
  assert.match(navigationModule, /func announce\([\s\S]*async throws/);
  assert.match(navigationModule, /func supersede\([\s\S]*async throws/);
  assert.match(
    navigationModule,
    /completePendingAnnouncement\([\s\S]*\.completed\(success: Self\.announcementWasSuccessful\(notification\)\)/,
    "The shipping controller must resolve completion through the executable native delivery policy.",
  );
  assert.match(
    navigationModule,
    /announcementWasSuccessful\(_ notification: Notification\) -> Bool\?[\s\S]*announcementWasSuccessfulUserInfoKey[\s\S]*return nil/,
    "Missing native success metadata must remain unconfirmed.",
  );
  assert.match(
    navigationModule,
    /timeoutPendingAnnouncement[\s\S]*interruptCurrentAnnouncement\(\)[\s\S]*disposition: \.timedOut/,
    "Native timeout must interrupt speech and reject delivery.",
  );
  assert.match(
    navigationModule,
    /GuidePupAnnouncementDeliveryPolicy\.completionTimeout\(for: message\)/,
    "Shipping timeout behavior must use the executable bounded policy.",
  );
  assert.match(
    announcementPolicy,
    /maximumCompletionTimeout: TimeInterval = 120[\s\S]*minimumCompletionTimeout: TimeInterval = 15[\s\S]*wordCompletionSeconds: TimeInterval = 2\.4[\s\S]*completionTimeout\(for message: String\)/,
    "Native completion timeouts must cover slow full-length prompts and remain bounded.",
  );
  assert.match(
    announcementPolicy,
    /case \.completed\(success: true\):[\s\S]*return \.success\(\(\)\)[\s\S]*case \.completed:[\s\S]*return \.failure\(\.completionFailed\)[\s\S]*case \.timedOut:[\s\S]*return \.failure\(\.timedOut\)/,
    "The executable native policy may resolve only an explicitly successful completion.",
  );
  assert.match(
    navigationModule,
    /GuidePupAnnouncementDeliveryPolicy\.result\(for: disposition\)/,
    "The shipping controller must use the independently compiled delivery policy.",
  );
  assert.match(navigationModule, /private func interruptCurrentAnnouncement\(\)[\s\S]*accessibilitySpeechQueueAnnouncement[\s\S]*value: false/);
  assert.match(navigationModule, /AsyncFunction\("cancelAnnouncement"\)/);
  assert.match(navigationModule, /AsyncFunction\("claimAnnouncementOwner"\)/);
  assert.match(navigationModule, /AsyncFunction\("interruptAllAnnouncements"\)/);
  assert.match(navigationModule, /AsyncFunction\("releaseAnnouncementOwner"\)/);
  assert.match(
    navigationModule,
    /AsyncFunction\("announce"\)[\s\S]*try await announcementController\.announce/,
  );
  assert.match(
    navigationModule,
    /AsyncFunction\("supersedeAnnouncement"\)[\s\S]*try await announcementController\.supersede/,
  );
  assert.match(
    navigationWrapper,
    /FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MINIMUM_MS = 15_000[\s\S]*FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MAXIMUM_MS = 120_000[\s\S]*FALLBACK_ANNOUNCEMENT_COMPLETION_MS_PER_WORD = 2_400/,
  );
  assert.match(
    navigationWrapper,
    /getFallbackAnnouncementCompletionTimeoutMs\([\s\S]*wordCount[\s\S]*Math\.min\([\s\S]*FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MAXIMUM_MS[\s\S]*Math\.max\(FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MINIMUM_MS/,
    "JS completion deadlines must cover slow full-length prompts and remain bounded.",
  );
  assert.doesNotMatch(navigationWrapper, /FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MS = 14_000/);
  assert.match(navigationWrapper, /let fallbackAnnouncementGeneration = 0/);
  assert.match(navigationWrapper, /let pendingFallbackAnnouncement:/);
  assert.match(
    navigationWrapper,
    /async function announce\([\s\S]*deliverAnnouncementWithFallback\([\s\S]*nativeModule\.announce\(trimmed, trimmedOwnerToken\)/,
    "Ordinary announcements must preserve native completion and share the completion-aware fallback.",
  );
  assert.doesNotMatch(
    navigationWrapper,
    /AccessibilityInfo\.announceForAccessibility\(/,
    "No ordinary iOS announcement may use the fire-and-forget accessibility API.",
  );
  assert.match(
    navigationWrapper,
    /function beginAnnouncementRequest\(\)[\s\S]*cancelPendingFallbackAnnouncement[\s\S]*interruptFallbackAccessibilityChannel/,
    "Ordinary and superseding JS fallback delivery must cancel-and-replace one pending registry.",
  );
  assert.match(
    navigationWrapper,
    /async function deliverAnnouncementWithFallback[\s\S]*beginAnnouncementRequest\(\)[\s\S]*waitForFallbackAnnouncementCompletion/,
  );
  assert.match(
    navigationWrapper,
    /function settleNativeAnnouncementDelivery[\s\S]*input\.cancel\(\)[\s\S]*signal\.addEventListener\("abort", handleAbort/,
    "An outer STOP deadline must cancel in-flight native announcement delivery.",
  );
  assert.match(
    navigationWrapper,
    /nativeCancellation: nativeModule[\s\S]*nativeModule\.cancelAnnouncement\(trimmedOwnerToken\)/,
  );
  assert.match(
    navigationWrapper,
    /AccessibilityInfo\.addEventListener\(\s*"announcementFinished"[\s\S]*event\.announcement !== postedAnnouncement[\s\S]*event\.success[\s\S]*announceForAccessibilityWithOptions\(postedAnnouncement, \{ queue: false \}\)/,
    "The completion listener must be registered before posting and match the generation-marked announcement.",
  );
  assert.match(
    navigationWrapper,
    /subscription\.remove\(\)[\s\S]*clearTimeout\(timeoutId\)[\s\S]*signal\?\.removeEventListener\("abort"/,
    "Every fallback settlement must remove its listener, timer, and abort hook.",
  );
  assert.match(
    navigationWrapper,
    /cancelPendingFallbackAnnouncement\([\s\S]*releaseAnnouncementOwner[\s\S]*cancelAnnouncement[\s\S]*interruptAllAnnouncements[\s\S]*supersedeAnnouncement/,
    "Every ownership or cancellation path must settle pending JS delivery.",
  );
  assert.match(
    navigationWrapper,
    /pendingCancelled && !interruptFallbackAccessibilityChannel\(\)/,
    "Replacement delivery must interrupt cancelled JS fallback speech before proceeding.",
  );
  assert.equal(
    navigationWrapper.match(
      /!pendingCancelled \|\| interruptFallbackAccessibilityChannel\(\)/g,
    )?.length,
    4,
    "Owner release, cancel, claim, and global interrupt must silence pending JS fallback speech.",
  );
  const cancelAnnouncementBlock = navigationWrapper
    .split("async function cancelAnnouncement")[1]
    .split("async function interruptAllAnnouncements")[0];
  const interruptAllAnnouncementsBlock = navigationWrapper
    .split("async function interruptAllAnnouncements")[1]
    .split("async function supersedeAnnouncement")[0];
  assert.match(
    cancelAnnouncementBlock,
    /let nativeInterrupted = true;[\s\S]*await nativeModule\.cancelAnnouncement[\s\S]*nativeInterrupted = false;[\s\S]*if \(!nativeInterrupted\) \{[\s\S]*throw new Error/,
    "Owner cancellation must reject when native interruption is unconfirmed.",
  );
  assert.match(
    interruptAllAnnouncementsBlock,
    /let nativeInterrupted = true;[\s\S]*await nativeModule\.interruptAllAnnouncements[\s\S]*nativeInterrupted = false;[\s\S]*if \(!nativeInterrupted\) \{[\s\S]*throw new Error/,
    "STOP shutdown must reject when global native interruption is unconfirmed.",
  );
  assert.doesNotMatch(
    cancelAnnouncementBlock,
    /nativeModule\.cancelAnnouncement[\s\S]*\.catch\(\(\) => undefined\)/,
  );
  const releaseAnnouncementOwnerBlock = navigationWrapper
    .split("async function releaseAnnouncementOwner")[1]
    .split("async function announce")[0];
  assert.match(
    releaseAnnouncementOwnerBlock,
    /let nativeReleased = true;[\s\S]*await nativeModule\.releaseAnnouncementOwner[\s\S]*nativeReleased = false;[\s\S]*if \(!nativeReleased\) \{[\s\S]*throw new Error/,
    "Native owner release must reject when cleanup is unconfirmed.",
  );
  assert.doesNotMatch(
    releaseAnnouncementOwnerBlock,
    /nativeModule\.releaseAnnouncementOwner[\s\S]*\.catch\(\(\) => undefined\)/,
  );
  assert.doesNotMatch(
    interruptAllAnnouncementsBlock,
    /nativeModule\.interruptAllAnnouncements[\s\S]*\.catch\(\(\) => undefined\)/,
  );
  assert.match(navigationWrapper, /createFallbackAnnouncementMarker\(generation\)/);
  assert.match(
    navigation,
    /const fallbackDeliveryAbortController = new AbortController\(\);[\s\S]*supersedeAnnouncement\([\s\S]*signal: fallbackDeliveryAbortController\.signal[\s\S]*onFailure: \(\) => fallbackDeliveryAbortController\.abort\(\)/,
    "Outer STOP failure must synchronously abort and clean the fallback listener.",
  );
  assert.match(
    runtimeSafety,
    /settleStopConfirmationDelivery[\s\S]*input\.onFailure\?\.\(\)/,
  );
  assert.match(
    runtimeSafety,
    /export async function settleCurrentAnnouncementDelivery[\s\S]*await input\.deliver\(\)[\s\S]*if \(!input\.isCurrent\(\)\) \{\s*return "unsafe";[\s\S]*await input\.interrupt\(\)[\s\S]*input\.isCurrent\(\) \? "interrupted" : "unsafe"/,
    "Callers need a truthful completed/interrupted/unsafe delivery outcome.",
  );
  const homeResponseBlock = home
    .split("const speakVoiceResponse = useCallback")[1]
    .split("const speakVoiceResponseRef = useRef")[0];
  assert.match(
    homeResponseBlock,
    /const announcementOutcome = await settleCurrentAnnouncementDelivery\(\{[\s\S]*deliver: \(\) => GuidePupNavigationCore\.announce\(message, announcementOwnerToken\)[\s\S]*interrupt: \(\) => GuidePupNavigationCore\.cancelAnnouncement\(announcementOwnerToken\)[\s\S]*isCurrent: responseIsCurrent[\s\S]*if \(announcementOutcome === "unsafe"\) \{\s*return;[\s\S]*if \(announcementOutcome === "interrupted"\) \{[\s\S]*playHaptic\("error"\)[\s\S]*playAudioCue\("error"\)[\s\S]*resumeListeningTimerRef\.current = setTimeout/,
    "Home must remain closed on unsafe delivery and recover voice after confirmed interruption.",
  );
  assert.doesNotMatch(
    homeResponseBlock,
    /GuidePupNavigationCore\.announce\(message, announcementOwnerToken\)\.catch/,
  );
  const navigationResponseBlock = navigation
    .split("const speakCommandResponse = useCallback")[1]
    .split("const pauseGuidanceForVoice = useCallback")[0];
  assert.match(
    navigationResponseBlock,
    /const announcementOutcome = await settleCurrentAnnouncementDelivery\(\{[\s\S]*deliver: \(\) => GuidePupNavigationCore\.announce\(message, announcementOwnerToken\)[\s\S]*interrupt: \(\) => GuidePupNavigationCore\.cancelAnnouncement\(announcementOwnerToken\)[\s\S]*if \(announcementOutcome === "unsafe"\) \{[\s\S]*speaking: true,[\s\S]*return;[\s\S]*voiceOverAnnouncementActiveRef\.current = false;[\s\S]*isSpeakingRef\.current = false;/,
    "Navigation may clear its STOP-only speech guard only after completion or settled interruption.",
  );
  assert.match(
    navigation,
    /if \(isSpeakingRef\.current && intent !== "stop-guidance"\) \{\s*return;/,
    "Non-STOP recognition must remain blocked while the VoiceOver delivery guard is active.",
  );
  assert.doesNotMatch(home, /cancelAnnouncement\(\s*\)/);
  assert.doesNotMatch(navigation, /cancelAnnouncement\(\s*\)/);
  assert.doesNotMatch(home, /interruptAllAnnouncements/);
  assert.equal(
    navigation.match(/GuidePupNavigationCore\.interruptAllAnnouncements\(\)/g)?.length,
    1,
    "Only deterministic STOP may globally interrupt VoiceOver speech.",
  );
  assert.equal(homeStartControl.tagName.getText(), "TouchableOpacity");
  assert.equal(getExpressionJsxAttribute(homeStartControl, "onPress"), "handlePress");
  assert.equal(getStringJsxAttribute(homeStartControl, "accessibilityRole"), "button");
  assert.equal(getStringJsxAttribute(homeStartControl, "accessibilityLabel"), "Start Guidance");
  assert.equal(getStringJsxAttribute(homeStartControl, "accessibilityHint"), "Double tap to start guidance.");
  assert.equal(getJsxAttribute(homeStartControl, "onLongPress"), null);
  assert.equal(getJsxAttribute(homeStartControl, "onAccessibilityAction"), null);
  assert.equal(getJsxAttribute(homeStartControl, "accessibilityActions"), null);
  assert.equal(navigationStopControl.tagName.getText(), "Pressable");
  assert.match(getExpressionJsxAttribute(navigationStopControl, "onPress"), /handleStop\(\)/);
  assert.equal(getStringJsxAttribute(navigationStopControl, "accessibilityRole"), "button");
  assert.equal(
    getExpressionJsxAttribute(navigationStopControl, "accessibilityLabel"),
    "primaryControlAccessibility.label",
  );
  assert.equal(
    getExpressionJsxAttribute(navigationStopControl, "accessibilityHint"),
    "primaryControlAccessibility.hint",
  );
  assert.match(
    navigation,
    /const primaryControlAccessibility = getNavigationPrimaryControlAccessibility\(isGuiding\)/,
  );
  assert.match(
    navigation,
    /<Text style=\{styles\.hintText\}>\s*\{permission\?\.granted\s*\?\s*primaryControlAccessibility\.visibleHint\s*:\s*"Grant camera access to start guidance"\}\s*<\/Text>/,
    "The visible Navigation hint must use the same guiding state as the primary accessibility control.",
  );
  assert.doesNotMatch(
    navigation,
    /permission\?\.granted\s*\?\s*"Tap to stop"/,
    "Camera permission alone must not render a stop instruction after voice STOP.",
  );
  assert.equal(getJsxAttribute(navigationStopControl, "onLongPress"), null);
  assert.equal(getJsxAttribute(navigationStopControl, "onAccessibilityAction"), null);
  assert.equal(getJsxAttribute(navigationStopControl, "accessibilityActions"), null);
  assert.doesNotMatch(home, /SOS|Long press for SOS/i);
  assert.doesNotMatch(navigation, /SOS|Long press for SOS/i);
  assert.doesNotMatch(navigation, /accessibilityLabel="Navigation screen"/);
  assert.match(
    navigation,
    /VoiceOver controls its own speech rate\./,
    "VoiceOver rate confirmations must not claim AVSpeechSynthesizer changed VoiceOver.",
  );
  assert.match(
    home,
    /const voiceOverState = await resolveVoiceOverState\(\);[\s\S]*App speech rate saved as[\s\S]*for when VoiceOver is off\. VoiceOver controls its own speech rate\./,
    "Home speech-rate commands must describe the persisted app rate truthfully under VoiceOver.",
  );
  assert.match(
    home,
    /updateSpeechRate\(nextRate\)\.then\(\(saved\) => announceSpeechRateResult\(/,
    "Home must persist a changed speech rate before announcing success.",
  );
  assert.match(
    settings,
    /const saved = await updateSpeechRate\(rate\);[\s\S]*AccessibilityInfo\.isScreenReaderEnabled\(\)[\s\S]*App speech rate saved as[\s\S]*for when VoiceOver is off\. VoiceOver controls its own speech rate\./,
    "Settings must query VoiceOver only after persistence and describe the active rate truthfully.",
  );
  const homeVoiceStart = home
    .split("const startVoiceSession = useCallback(async () => {")[1]
    .split("const speakVoiceResponse = useCallback")[0];
  assert.match(
    homeVoiceStart,
    /state\?\.listening[\s\S]*voiceSessionOwnerTokenRef\.current === ownerToken[\s\S]*attemptIsCurrent\(\)[\s\S]*listeningCueOwnerTokenRef\.current !== ownerToken[\s\S]*GuidePupNavigationCore\.playAudioCue\("success"\)/,
    "Home may emit the listening-ready cue only for the current owned listening session.",
  );
  assert.equal(
    homeVoiceStart.match(/GuidePupNavigationCore\.playAudioCue\("success"\)/g)?.length,
    1,
    "Each successful Home voice-session start has one listening-ready cue site.",
  );
  assert.match(
    navigation,
    /case "status":[\s\S]*settlePromiseWithin\(\s*\(\) => GuidePupNavigationCore\.getState\(\),\s*SHUTDOWN_OPERATION_TIMEOUT_MS,\s*"spoken status native camera state read"/,
    "Spoken native status must use a bounded read of actual session state.",
  );
  assert.match(
    navigation,
    /resolveNavigationCameraStatus\(\{[\s\S]*cameraRecoveryGateActive: cameraRecoveryGateActiveRef\.current[\s\S]*nativeRecoveryReady: nativeState\?\.recoveryState === "idle"[\s\S]*nativeSessionActive: nativeState\?\.sessionActive === true/,
    "Spoken status must include the camera recovery gate and actual native session readiness.",
  );
  assert.match(
    runtimeSafety,
    /activeCameraPath === "native-core"[\s\S]*!input\.cameraRecoveryGateActive[\s\S]*input\.nativeRecoveryReady[\s\S]*input\.nativeSessionActive/,
    "Native camera readiness must fail closed while recovery is gated or session state is inactive.",
  );
  assert.doesNotMatch(
    navigation,
    /cameraReady:\s*permission\?\.granted === true/,
    "Camera permission alone is not camera readiness.",
  );
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
  const voiceRecoveryBlock = navigation
    .split("const enterVoiceRecoveryHold = useCallback")[1]
    .split("const clearVoiceRecoveryHold = useCallback")[0];
  assert.match(
    voiceRecoveryBlock,
    /voiceOverAnnouncementActiveRef\.current = true;[\s\S]*isSpeakingRef\.current = true;/,
    "Voice recovery must enter a STOP-only speech guard before asynchronous cleanup.",
  );
  assert.match(
    voiceRecoveryBlock,
    /const previousSpeechStopped = await settlePromiseWithin\([\s\S]*GuidePupVoiceControl\.stopSpeaking\(\)[\s\S]*const announcementOutcome = await settleCurrentAnnouncementDelivery\(\{[\s\S]*GuidePupNavigationCore\.supersedeAnnouncement\(message, announcementOwnerToken\)[\s\S]*GuidePupNavigationCore\.cancelAnnouncement\(announcementOwnerToken\)/,
    "Recovery speech replacement and interruption must be observed rather than fire-and-forget.",
  );
  assert.match(
    voiceRecoveryBlock,
    /if \(!previousSpeechStopped \|\| announcementOutcome === "unsafe"\) \{[\s\S]*speaking: true,[\s\S]*return;[\s\S]*voiceOverAnnouncementActiveRef\.current = false;[\s\S]*isSpeakingRef\.current = false;/,
    "An unsafe recovery announcement must retain the STOP-only guard.",
  );
  const recoveryAnnouncementCurrentBlock = voiceRecoveryBlock
    .split("const recoveryAnnouncementIsCurrent = () =>")[1]
    .split("const announcementOutcome = await")[0];
  assert.match(recoveryAnnouncementCurrentBlock, /isScreenFocusedRef\.current/);
  assert.match(recoveryAnnouncementCurrentBlock, /announcementOwnerTokenRef\.current === announcementOwnerToken/);
  assert.match(recoveryAnnouncementCurrentBlock, /voiceOverSpeechGenerationRef\.current === speechGeneration/);
  assert.doesNotMatch(
    recoveryAnnouncementCurrentBlock,
    /voiceRecoveryGateActiveRef/,
    "A confirmed completion may release the speech guard after voice recovery itself becomes idle.",
  );
  assert.doesNotMatch(
    voiceRecoveryBlock,
    /supersedeAnnouncement\([^)]*\)\.catch\(\(\) => undefined\)/,
  );
  assert.match(
    navigation,
    /runtimeSafetyHoldRef\.current[\s\S]*voiceRecoveryGateActiveRef\.current[\s\S]*stopSafetyFailureHoldRef\.current[\s\S]*touchStopFailureHoldRef\.current[\s\S]*intent !== "stop-guidance"[\s\S]*return;/,
    "Every safety hold must block non-STOP voice commands.",
  );
});

test("STOP evidence stays unknown until camera, listening, speech, and analysis are observed quiet", () => {
  const diagnostics = read("../src/lib/diagnostics.ts");
  const navigation = read("../src/screens/NavigationScreen.tsx");
  const runtimeSafety = read("../src/lib/runtimeSafety.ts");

  assert.match(navigation, /cutThrough: null/);
  assert.match(navigation, /cameraInactiveAfterStop: null/);
  assert.match(navigation, /listeningStoppedAfterStop: null/);
  assert.match(navigation, /STOP_OBSERVATION_QUIET_WINDOW_MS/);
  assert.match(navigation, /await stopRuntimeAndObserve\(\)/);
  assert.match(navigation, /GuidePupNavigationCore\.stopSession\(\)/);
  assert.match(navigation, /GuidePupVoiceControl\.stopCommandSession\(\)/);
  for (const operation of [
    "GuidePupVoiceControl\\.stopSpeaking\\(\\)",
    "GuidePupVoiceControl\\.stopCommandSession\\(\\)",
    "GuidePupNavigationCore\\.interruptAllAnnouncements\\(\\)",
  ]) {
    assert.match(
      navigation,
      new RegExp(`settlePromiseWithin\\(\\s*\\(\\) => ${operation},\\s*SHUTDOWN_OPERATION_TIMEOUT_MS`),
    );
  }
  assert.match(
    navigation,
    /settlePromiseWithin\(\s*\(\) => cameraStopRequest\.promise,\s*CAMERA_STOP_TOTAL_TIMEOUT_MS/,
  );
  assert.match(
    navigation,
    /const observation = await observeStoppedRuntime\(\);[\s\S]*const shutdownConfirmed = resolveStopRuntimeShutdownTruth\([\s\S]*const stopAnnouncementDelivered = await \(async \(\) => \{[\s\S]*const delivered = await settleStopConfirmationDelivery\(\{[\s\S]*GuidePupNavigationCore\.supersedeAnnouncement\("Stop\."[\s\S]*timeoutMs: STOP_SAFETY_ANNOUNCEMENT_DELIVERY_TIMEOUT_MS/,
    "The short VoiceOver STOP delivery must run only after runtime shutdown truth is observed.",
  );
  const stopRuntimeBlock = navigation
    .split("const stopRuntimeAndObserve = useCallback(async () => {")[1]
    .split("const speakStopConfirmation = useCallback")[0];
  assert.doesNotMatch(
    stopRuntimeBlock,
    /reportUnconfirmedShutdown/,
    "The shared shutdown helper must not mutate a stale caller's screen state.",
  );
  assert.doesNotMatch(
    stopRuntimeBlock,
    /shutdownOperationsConfirmed\s*&&=\s*stopAnnouncement/,
    "Sensory announcement delivery must not alter runtime shutdown truth.",
  );
  assert.match(
    stopRuntimeBlock,
    /return \{[\s\S]*shutdownConfirmed,[\s\S]*stopAnnouncementDelivered/,
  );
  const stopConfirmationBlock = navigation
    .split("const speakStopConfirmation = useCallback(async (message: string) => {")[1]
    .split("const handleVoiceStopCommand = useCallback")[0];
  assert.match(
    stopConfirmationBlock,
    /resolveVoiceOverRunning,\s*SHUTDOWN_OPERATION_TIMEOUT_MS,\s*"VoiceOver state read"/,
  );
  assert.match(
    stopConfirmationBlock,
    /GuidePupVoiceControl\.stopSpeaking\(\),\s*SHUTDOWN_OPERATION_TIMEOUT_MS,\s*"confirmation speech stop"/,
  );
  assert.match(
    stopConfirmationBlock,
    /GuidePupNavigationCore\.cancelAnnouncement\(announcementOwnerToken\),\s*SHUTDOWN_OPERATION_TIMEOUT_MS,\s*"stop confirmation announcement cancellation"/,
  );
  assert.match(
    stopConfirmationBlock,
    /settleStopConfirmationDelivery\(\{[\s\S]*deliver: \(\) =>\s*GuidePupNavigationCore\.supersedeAnnouncement\(message, announcementOwnerToken, \{[\s\S]*signal: fallbackDeliveryAbortController\.signal[\s\S]*onFailure: \(\) => fallbackDeliveryAbortController\.abort\(\)[\s\S]*timeoutMs: STOP_CONFIRMATION_DELIVERY_TIMEOUT_MS/,
  );
  assert.match(
    stopConfirmationBlock,
    /settleStopConfirmationDelivery\(\{[\s\S]*deliver: \(\) => GuidePupVoiceControl\.speak\(message,[\s\S]*timeoutMs: STOP_CONFIRMATION_DELIVERY_TIMEOUT_MS/,
  );
  assert.doesNotMatch(
    stopConfirmationBlock,
    /"stop confirmation (?:announcement|speech)"[\s\S]{0,120}SHUTDOWN_OPERATION_TIMEOUT_MS/,
    "Delivery completion must not use the fast shutdown/control deadline.",
  );
  assert.match(stopConfirmationBlock, /reportStopConfirmationFailure/);
  assert.match(
    stopConfirmationBlock,
    /if \(confirmationFailureReported \|\| !confirmationIsCurrent\(\)\) \{\s*return;/,
    "A stale STOP confirmation must not recreate a safety hold.",
  );
  assert.doesNotMatch(
    stopConfirmationBlock,
    /reportUnconfirmedShutdown/,
    "Confirmation delivery failure must not rewrite the completed shutdown observation.",
  );
  assert.match(
    stopConfirmationBlock,
    /return !confirmationFailureReported && previousSpeechStopped && announced/,
    "A failed VoiceOver state/control prerequisite must keep listening disarmed.",
  );
  assert.match(
    stopConfirmationBlock,
    /return !confirmationFailureReported\s*&& previousSpeechStopped\s*&& announcementCancelled\s*&& spoken/,
    "A failed native state/control prerequisite must keep listening disarmed.",
  );
  const confirmationFailureBlock = navigation
    .split("const reportStopConfirmationFailure = useCallback((stage: string) => {")[1]
    .split("const observeStoppedRuntime = useCallback")[0];
  assert.doesNotMatch(
    confirmationFailureBlock,
    /refreshNavigationCoreState|sessionActive/,
    "Confirmation failure feedback must not alter camera, listening, or analysis shutdown truth.",
  );
  assert.match(
    navigation,
    /resolveStopRuntimeShutdownTruth\(\{[\s\S]*controlOperationsConfirmed: shutdownOperationsConfirmed,[\s\S]*runtimeQuiescent: observation\.quiescent/,
  );
  assert.match(
    navigation,
    /cutThrough:[\s\S]*input\.recognizedDuringSpeech[\s\S]*observation\.shutdownConfirmed[\s\S]*observation\.quiescent/,
    "STOP diagnostics must not report cut-through or inactive state after an unconfirmed shutdown.",
  );
  assert.match(
    navigation,
    /cameraInactiveAfterStop:[\s\S]*observation\.shutdownConfirmed && observation\.cameraInactive/,
  );
  assert.match(
    navigation,
    /const stopConfirmationDelivered = await speakStopConfirmation[\s\S]*const stopStillCurrent = stopOperationIsCurrent\(\);[\s\S]*shouldRearmVoiceAfterStopConfirmation\(\{[\s\S]*confirmationDelivered: stopConfirmationDelivered[\s\S]*shutdownConfirmed: observation\.shutdownConfirmed[\s\S]*stopCurrent: stopStillCurrent[\s\S]*startVoiceSession\(\)/,
    "Voice listening must not restart when STOP confirmation failed or timed out.",
  );
  assert.match(
    navigation,
    /const observation = await stopRuntimeAndObserve\(\);\s*if \(!stopOperationIsCurrent\(\)\) \{\s*return;\s*\}\s*if \(!observation\.shutdownConfirmed\) \{\s*reportUnconfirmedShutdown\("handleVoiceStopCommand"\);/,
    "Voice STOP may report shutdown failure only after proving operation currency.",
  );
  assert.match(
    runtimeSafety,
    /export async function settleStopConfirmationDelivery[\s\S]*settlePromiseWithin\([\s\S]*return input\.isCurrent\(\)/,
  );
  assert.match(
    runtimeSafety,
    /export function shouldRearmVoiceAfterStopConfirmation[\s\S]*input\.confirmationDelivered[\s\S]*input\.stopCurrent/,
  );
  assert.match(
    runtimeSafety,
    /export function shouldLeaveNavigationAfterTouchStop[\s\S]*input\.confirmationDelivered[\s\S]*input\.shutdownConfirmed[\s\S]*input\.stopCurrent/,
  );
  const touchStopBlock = navigation
    .split("const handleStop = useCallback(async () => {")[1]
    .split("const canOpenCameraSettings")[0];
  assert.match(
    touchStopBlock,
    /const confirmationDelivered = await speakStopConfirmation[\s\S]*shouldLeaveNavigationAfterTouchStop\(\{[\s\S]*confirmationDelivered,[\s\S]*shutdownConfirmed: observation\.shutdownConfirmed,[\s\S]*stopCurrent: stopStillCurrent/,
    "Touch STOP may leave Navigation only after shutdown and spoken feedback are confirmed.",
  );
  assert.match(
    touchStopBlock,
    /const observation = await stopRuntimeAndObserve\(\);\s*if \(!stopOperationIsCurrent\(\)\) \{\s*return;\s*\}\s*if \(!observation\.shutdownConfirmed\) \{\s*reportUnconfirmedShutdown\("handleStop"\);/,
    "Touch STOP may report shutdown failure only after proving operation currency.",
  );
  assert.match(
    touchStopBlock,
    /touchStopFailureHoldRef\.current = true;[\s\S]*runtimeSafetyHoldRef\.current = true;[\s\S]*tone: "critical"[\s\S]*title: "STOP not confirmed"[\s\S]*return;[\s\S]*touchStopFailureHoldRef\.current = false;[\s\S]*navigation\.canGoBack\(\)/,
    "A failed touch STOP must stay on Navigation in a retryable critical hold.",
  );
  assert.match(
    navigation,
    /case "stop-guidance": \{[\s\S]*if \(!guidingRef\.current\) \{[\s\S]*shouldRetryFailedStop\(\{[\s\S]*stopSafetyFailureHold: stopSafetyFailureHoldRef\.current,[\s\S]*touchStopFailureHold: touchStopFailureHoldRef\.current[\s\S]*touchStopRetryRef\.current\(\)/,
    "A blind user must be able to retry any unconfirmed STOP operation by voice.",
  );
  assert.match(
    navigation,
    /useLayoutEffect\(\(\) => \{\s*touchStopRetryRef\.current = handleStop;\s*\}, \[handleStop\]\);/,
  );
  assert.doesNotMatch(
    touchStopBlock,
    /await speakStopConfirmation\([^;]*;\s*if \(!stopOperationIsCurrent\(\)\)[\s\S]*navigation\.canGoBack\(\)/,
    "Touch STOP must not navigate solely because its asynchronous work returned.",
  );
  assert.match(
    runtimeSafety,
    /export function resolveStopRuntimeShutdownTruth[\s\S]*input\.controlOperationsConfirmed[\s\S]*input\.runtimeQuiescent/,
  );
  assert.match(
    runtimeSafety,
    /export function shouldRetainRuntimeSafetyHoldAfterVoiceRecovery[\s\S]*input\.stopSafetyFailureHold \|\| input\.touchStopFailureHold/,
  );
  assert.match(
    navigation,
    /const retainRuntimeSafetyHold = shouldRetainRuntimeSafetyHoldAfterVoiceRecovery[\s\S]*if \(retainRuntimeSafetyHold\) \{[\s\S]*title: "STOP not confirmed"[\s\S]*return;[\s\S]*title: "Checking a fresh frame"/,
    "Voice recovery must not replace an unresolved STOP failure with a normal fresh-frame status.",
  );
  assert.match(
    navigation,
    /const reportUnconfirmedShutdown[\s\S]*stopSafetyFailureHoldRef\.current = true;[\s\S]*runtimeSafetyHoldRef\.current = true;[\s\S]*const reportStopConfirmationFailure[\s\S]*stopSafetyFailureHoldRef\.current = true;[\s\S]*runtimeSafetyHoldRef\.current = true;/,
    "Unconfirmed shutdown or STOP feedback must keep queued non-STOP commands fail closed.",
  );
  assert.match(
    navigation,
    /sessionActive: true,[\s\S]*lastError: "Shutdown could not be confirmed\."/,
    "A failed or timed-out shutdown must remain conservatively active in diagnostics.",
  );
  assert.match(navigation, /title: "Shutdown not confirmed"/);
  assert.match(navigation, /Guidance remains paused\./);
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
