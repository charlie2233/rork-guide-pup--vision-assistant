import AVFoundation
import Speech
import UIKit

typealias GuidePupVoiceRecognitionHandler = ([String: Any]) -> Void
typealias GuidePupVoiceStateHandler = ([String: Any]) -> Void

final class GuidePupVoiceControlController: NSObject, AVSpeechSynthesizerDelegate {
  private struct PendingSpeech {
    let continuation: CheckedContinuation<Void, Error>
    let utterance: AVSpeechUtterance
  }

  private enum RecoveryState: String {
    case background
    case exhausted
    case idle
    case interrupted
    case recovering
  }

  private static let maximumRecoveryAttempts = 3
  private static let recoveryDelays: [TimeInterval] = [0.25, 0.75, 1.5]
  private static let recoveryStabilityDelay: TimeInterval = 10
  private static let backgroundError = "Guide Pup voice control is paused while the app is in the background."
  private static let interruptionError = "Guide Pup voice control is paused by an audio interruption."
  private static let routeChangeError = "Guide Pup voice control is paused while the audio route changes."
  private static let recoveringError = "Guide Pup voice control is temporarily unavailable. Retrying."
  private static let recoveryExhaustedError =
    "Guide Pup voice control could not recover after several attempts. Use the on-screen stop control and try again."

  private let audioEngine = AVAudioEngine()
  private let stateLock = NSLock()
  private let speechSynthesizer = AVSpeechSynthesizer()

  private var activeLocaleIdentifier: String?
  private var activePartialResults = false
  private var appActive = true
  private var audioSessionInterrupted = false
  private var audioTapInstalled = false
  private var commandSessionDesired = false
  private var commandSessionGeneration = 0
  private var commandSessionOwnerToken: String?
  private var lastError: String?
  private var lastTranscript: String?
  private var listening = false
  private var notificationObservers: [NSObjectProtocol] = []
  private var recognitionGeneration = 0
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var recoveryAttemptCount = 0
  private var recoveryState = RecoveryState.idle
  private var recoveryStabilityWorkItem: DispatchWorkItem?
  private var recoveryWorkItem: DispatchWorkItem?
  private var restartingAfterFinal = false
  private var pendingSpeech: PendingSpeech?
  private var speechRecognizer: SFSpeechRecognizer?
  private var speaking = false
  private var voiceProcessingEnabled = false

  var onRecognizedPhrase: GuidePupVoiceRecognitionHandler?
  var onStateChanged: GuidePupVoiceStateHandler?

  override init() {
    super.init()
    speechSynthesizer.delegate = self

    let notificationCenter = NotificationCenter.default
    notificationObservers = [
      notificationCenter.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] notification in
        self?.handleAudioSessionInterruption(notification)
      },
      notificationCenter.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] notification in
        self?.handleAudioRouteChange(notification)
      },
      notificationCenter.addObserver(
        forName: AVAudioSession.mediaServicesWereLostNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] _ in
        self?.handleMediaServicesLost()
      },
      notificationCenter.addObserver(
        forName: AVAudioSession.mediaServicesWereResetNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] _ in
        self?.handleMediaServicesReset()
      },
      notificationCenter.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.handleAppDidEnterBackground()
      },
      notificationCenter.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.handleAppDidBecomeActive()
      }
    ]
  }

  deinit {
    recoveryWorkItem?.cancel()
    recoveryStabilityWorkItem?.cancel()
    notificationObservers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  func isAvailable() -> Bool {
    SFSpeechRecognizer(locale: Locale.current) != nil
  }

  func requestPermissions() async -> [String: String] {
    async let microphone = requestMicrophonePermission()
    async let speech = requestSpeechPermission()

    let resolvedPermissions = await (
      microphone: microphone,
      speech: speech
    )

    sendStateChanged()

    return [
      "microphone": resolvedPermissions.microphone,
      "speech": resolvedPermissions.speech,
    ]
  }

  func startCommandSession(
    localeIdentifier: String?,
    partialResults: Bool,
    ownerToken: String?
  ) async throws -> [String: Any] {
    setRecoveryState(.idle)

    guard isAvailable() else {
      recordError(GuidePupSpeechRecognitionUnavailableException().reason)
      throw GuidePupSpeechRecognitionUnavailableException()
    }

    guard Self.speechPermissionStatusString() == "granted" else {
      recordError(GuidePupSpeechPermissionDeniedException().reason)
      throw GuidePupSpeechPermissionDeniedException()
    }

    guard Self.microphonePermissionStatusString() == "granted" else {
      recordError(GuidePupMicrophonePermissionDeniedException().reason)
      throw GuidePupMicrophonePermissionDeniedException()
    }

    return try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.main.async {
        self.commandSessionGeneration += 1
        self.commandSessionDesired = true
        self.commandSessionOwnerToken = ownerToken
        self.activeLocaleIdentifier = localeIdentifier
        self.activePartialResults = partialResults
        self.recoveryAttemptCount = 0
        self.cancelRecoveryWorkItems()
        self.setRecoveryState(.idle)

        do {
          try self.startListeningSession()
          self.clearError()
          self.sendStateChanged()
          continuation.resume(returning: self.stateDictionary())
        } catch {
          self.stopListeningSession(preserveConfiguration: true)
          if !self.appActive {
            self.setRecoveryState(.background)
            self.recordError(Self.backgroundError)
          } else if self.audioSessionInterrupted {
            self.setRecoveryState(.interrupted)
            self.recordError(Self.interruptionError)
          } else {
            self.setRecoveryState(.recovering)
            self.recordError(Self.recoveringError)
          }
          self.sendStateChanged()
          self.scheduleRecoveryIfNeeded()
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func stopCommandSession(ownerToken: String?) async -> [String: Any] {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        if let ownerToken, self.commandSessionOwnerToken != ownerToken {
          continuation.resume(returning: self.stateDictionary())
          return
        }
        self.commandSessionDesired = false
        self.commandSessionOwnerToken = nil
        self.commandSessionGeneration += 1
        self.recoveryAttemptCount = 0
        self.cancelRecoveryWorkItems()
        self.stopListeningSession(preserveConfiguration: false)
        self.setRecoveryState(.idle)
        self.clearError()
        self.sendStateChanged()
        continuation.resume(returning: self.stateDictionary())
      }
    }
  }

  func speak(text: String, rate: Double?, localeIdentifier: String?, interrupt: Bool) async throws {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      return
    }

    try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.main.async {
        self.rejectPendingSpeech()

        if interrupt && self.speechSynthesizer.isSpeaking {
          self.speechSynthesizer.stopSpeaking(at: .immediate)
        }

        let utterance = AVSpeechUtterance(string: trimmed)
        if let localeIdentifier, let voice = AVSpeechSynthesisVoice(language: localeIdentifier) {
          utterance.voice = voice
        }
        if let rate {
          let normalizedRate = min(max(rate, 0.5), 1.5)
          utterance.rate = Float(normalizedRate) * AVSpeechUtteranceDefaultSpeechRate
        }

        self.pendingSpeech = PendingSpeech(
          continuation: continuation,
          utterance: utterance
        )
        self.setSpeaking(true)
        self.sendStateChanged()
        self.speechSynthesizer.speak(utterance)
      }
    }
  }

  func stopSpeaking() async {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        self.rejectPendingSpeech()
        if self.speechSynthesizer.isSpeaking {
          self.speechSynthesizer.stopSpeaking(at: .immediate)
        }
        self.setSpeaking(false)
        self.sendStateChanged()
        continuation.resume(returning: ())
      }
    }
  }

  func stateDictionary() -> [String: Any] {
    stateLock.lock()
    let currentError = lastError
    let currentListening = listening
    let currentRecoveryState = recoveryState
    let currentSpeaking = speaking
    let currentVoiceProcessingEnabled = voiceProcessingEnabled
    stateLock.unlock()

    return [
      "available": isAvailable(),
      "lastError": currentError ?? NSNull(),
      "listening": currentListening,
      "microphonePermission": Self.microphonePermissionStatusString(),
      "recoveryState": currentRecoveryState.rawValue,
      "speaking": currentSpeaking,
      "speechPermission": Self.speechPermissionStatusString(),
      "voiceProcessingEnabled": currentVoiceProcessingEnabled,
    ]
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    completeSpeech(for: utterance, delivered: false)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    completeSpeech(for: utterance, delivered: true)
  }

  private func startListeningSession() throws {
    guard commandSessionDesired else {
      throw GuidePupVoiceSessionStartException("Guide Pup voice control is not active.")
    }
    guard appActive else {
      throw GuidePupVoiceSessionStartException(Self.backgroundError)
    }
    guard !audioSessionInterrupted else {
      throw GuidePupVoiceSessionStartException(Self.interruptionError)
    }

    stopListeningSession(preserveConfiguration: true)
    lastTranscript = nil

    let locale = Locale(identifier: activeLocaleIdentifier ?? Locale.current.identifier)
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
      throw GuidePupSpeechRecognitionUnavailableException()
    }
    if !recognizer.isAvailable {
      throw GuidePupVoiceSessionStartException("Guide Pup speech recognition is temporarily unavailable.")
    }

    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.defaultToSpeaker, .duckOthers, .allowBluetoothHFP]
    )
    try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = activePartialResults
    if recognizer.supportsOnDeviceRecognition {
      request.requiresOnDeviceRecognition = true
    }

    let inputNode = audioEngine.inputNode
    if #available(iOS 13.0, *) {
      do {
        try inputNode.setVoiceProcessingEnabled(true)
        setVoiceProcessingEnabled(inputNode.isVoiceProcessingEnabled)
      } catch {
        setVoiceProcessingEnabled(false)
        throw GuidePupVoiceSessionStartException(
          "Guide Pup could not enable acoustic echo cancellation for voice commands."
        )
      }
      guard inputNode.isVoiceProcessingEnabled else {
        throw GuidePupVoiceSessionStartException(
          "Guide Pup could not enable acoustic echo cancellation for voice commands."
        )
      }
    }
    let recordingFormat = inputNode.outputFormat(forBus: 0)
    if recordingFormat.sampleRate == 0 {
      throw GuidePupVoiceSessionStartException("Guide Pup could not access a live microphone input.")
    }

    if audioTapInstalled {
      inputNode.removeTap(onBus: 0)
      audioTapInstalled = false
    }

    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
      self?.recognitionRequest?.append(buffer)
    }
    audioTapInstalled = true

    audioEngine.prepare()
    try audioEngine.start()

    speechRecognizer = recognizer
    recognitionRequest = request
    recognitionGeneration += 1
    let generation = recognitionGeneration
    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      DispatchQueue.main.async {
        self?.handleRecognitionUpdate(
          result: result,
          error: error,
          generation: generation
        )
      }
    }

    setListening(true)
  }

  private func handleRecognitionUpdate(
    result: SFSpeechRecognitionResult?,
    error: Error?,
    generation: Int
  ) {
    guard
      generation == recognitionGeneration,
      commandSessionDesired
    else {
      return
    }

    if let result {
      let transcript = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
      if !transcript.isEmpty && transcript != lastTranscript {
        lastTranscript = transcript
        markRecognitionHealthy()
        onRecognizedPhrase?([
          "isFinal": result.isFinal,
          "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
          "transcript": transcript,
        ])
      }
    }

    if error != nil {
      stopListeningSession(preserveConfiguration: true)
      setRecoveryState(.recovering)
      recordError(Self.recoveringError)
      sendStateChanged()
      scheduleRecoveryIfNeeded()
      return
    }

    if result?.isFinal == true {
      DispatchQueue.main.async { [weak self] in
        self?.restartListeningAfterFinalIfNeeded()
      }
    }
  }

  private func restartListeningAfterFinalIfNeeded() {
    guard
      commandSessionDesired,
      listening,
      appActive,
      !audioSessionInterrupted,
      !restartingAfterFinal
    else {
      sendStateChanged()
      return
    }

    restartingAfterFinal = true
    do {
      try startListeningSession()
      setRecoveryState(.idle)
      clearError()
    } catch {
      stopListeningSession(preserveConfiguration: true)
      setRecoveryState(.recovering)
      recordError(Self.recoveringError)
      scheduleRecoveryIfNeeded()
    }
    restartingAfterFinal = false
    sendStateChanged()
  }

  private func scheduleRecoveryIfNeeded() {
    guard commandSessionDesired else {
      return
    }
    guard appActive, !audioSessionInterrupted else {
      return
    }
    guard recoveryWorkItem == nil else {
      return
    }
    guard recoveryAttemptCount < Self.maximumRecoveryAttempts else {
      markRecoveryExhausted()
      return
    }

    let attemptIndex = recoveryAttemptCount
    recoveryAttemptCount += 1
    let generation = commandSessionGeneration
    let workItem = DispatchWorkItem { [weak self] in
      self?.performRecovery(generation: generation)
    }
    recoveryWorkItem = workItem
    setRecoveryState(.recovering)
    recordError(Self.recoveringError)
    sendStateChanged()

    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.recoveryDelays[attemptIndex],
      execute: workItem
    )
  }

  private func performRecovery(generation: Int) {
    recoveryWorkItem = nil
    guard
      generation == commandSessionGeneration,
      commandSessionDesired,
      appActive,
      !audioSessionInterrupted
    else {
      return
    }

    do {
      try startListeningSession()
      setRecoveryState(.idle)
      clearError()
      sendStateChanged()
      scheduleRecoveryBudgetReset(generation: generation)
    } catch {
      stopListeningSession(preserveConfiguration: true)
      if recoveryAttemptCount >= Self.maximumRecoveryAttempts {
        markRecoveryExhausted()
      } else {
        setRecoveryState(.recovering)
        recordError(Self.recoveringError)
        sendStateChanged()
        scheduleRecoveryIfNeeded()
      }
    }
  }

  private func scheduleRecoveryBudgetReset(generation: Int) {
    recoveryStabilityWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else {
        return
      }
      self.recoveryStabilityWorkItem = nil
      guard
        generation == self.commandSessionGeneration,
        self.commandSessionDesired,
        self.listening,
        self.appActive,
        !self.audioSessionInterrupted
      else {
        return
      }
      self.recoveryAttemptCount = 0
    }
    recoveryStabilityWorkItem = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.recoveryStabilityDelay,
      execute: workItem
    )
  }

  private func markRecognitionHealthy() {
    setRecoveryState(.idle)
    clearError()
  }

  private func markRecoveryExhausted() {
    recoveryWorkItem?.cancel()
    recoveryWorkItem = nil
    recoveryStabilityWorkItem?.cancel()
    recoveryStabilityWorkItem = nil
    stopListeningSession(preserveConfiguration: true)
    setRecoveryState(.exhausted)
    recordError(Self.recoveryExhaustedError)
    sendStateChanged()
  }

  private func cancelRecoveryWorkItems() {
    recoveryWorkItem?.cancel()
    recoveryWorkItem = nil
    recoveryStabilityWorkItem?.cancel()
    recoveryStabilityWorkItem = nil
  }

  private func handleAudioSessionInterruption(_ notification: Notification) {
    guard
      let rawValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let interruptionType = AVAudioSession.InterruptionType(rawValue: rawValue)
    else {
      return
    }

    switch interruptionType {
    case .began:
      audioSessionInterrupted = true
      cancelRecoveryWorkItems()
      if commandSessionDesired {
        stopSpeakingImmediately()
        stopListeningSession(preserveConfiguration: true)
        setRecoveryState(.interrupted)
        recordError(Self.interruptionError)
        sendStateChanged()
      }
    case .ended:
      audioSessionInterrupted = false
      if commandSessionDesired {
        setRecoveryState(.recovering)
        recordError(Self.recoveringError)
        sendStateChanged()
        scheduleRecoveryIfNeeded()
      }
    @unknown default:
      break
    }
  }

  private func handleAudioRouteChange(_ notification: Notification) {
    guard
      commandSessionDesired,
      let rawValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: rawValue)
    else {
      return
    }

    switch reason {
    case .newDeviceAvailable,
         .oldDeviceUnavailable,
         .wakeFromSleep,
         .noSuitableRouteForCategory,
         .routeConfigurationChange:
      cancelRecoveryWorkItems()
      stopSpeakingImmediately()
      stopListeningSession(preserveConfiguration: true)
      setRecoveryState(.recovering)
      recordError(Self.routeChangeError)
      sendStateChanged()
      scheduleRecoveryIfNeeded()
    default:
      break
    }
  }

  private func handleMediaServicesLost() {
    guard commandSessionDesired else {
      return
    }

    cancelRecoveryWorkItems()
    stopSpeakingImmediately()
    stopListeningSession(preserveConfiguration: true)
    setRecoveryState(.recovering)
    recordError(Self.recoveringError)
    sendStateChanged()
  }

  private func handleMediaServicesReset() {
    guard commandSessionDesired else {
      return
    }

    cancelRecoveryWorkItems()
    stopSpeakingImmediately()
    stopListeningSession(preserveConfiguration: true)
    setRecoveryState(.recovering)
    recordError(Self.recoveringError)
    sendStateChanged()
    scheduleRecoveryIfNeeded()
  }

  private func handleAppDidEnterBackground() {
    appActive = false
    cancelRecoveryWorkItems()
    if commandSessionDesired {
      stopSpeakingImmediately()
      stopListeningSession(preserveConfiguration: true)
      setRecoveryState(.background)
      recordError(Self.backgroundError)
      sendStateChanged()
    }
  }

  private func handleAppDidBecomeActive() {
    appActive = true
    if commandSessionDesired && !listening {
      setRecoveryState(.recovering)
      recordError(Self.recoveringError)
      sendStateChanged()
      scheduleRecoveryIfNeeded()
    }
  }

  private func stopListeningSession(preserveConfiguration: Bool) {
    recognitionGeneration += 1
    recognitionRequest?.endAudio()
    recognitionRequest = nil

    recognitionTask?.cancel()
    recognitionTask = nil
    lastTranscript = nil

    if audioEngine.isRunning {
      audioEngine.stop()
    }

    let inputNode = audioEngine.inputNode
    if audioTapInstalled {
      inputNode.removeTap(onBus: 0)
      audioTapInstalled = false
    }

    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

    speechRecognizer = nil
    setListening(false)
    if !preserveConfiguration {
      activeLocaleIdentifier = nil
      activePartialResults = false
    }
  }

  private func stopSpeakingImmediately() {
    rejectPendingSpeech()
    if speechSynthesizer.isSpeaking {
      speechSynthesizer.stopSpeaking(at: .immediate)
    }
    setSpeaking(false)
  }

  private func rejectPendingSpeech() {
    guard let pendingSpeech else {
      return
    }

    self.pendingSpeech = nil
    pendingSpeech.continuation.resume(
      throwing: GuidePupSpeechDeliveryCancelledException()
    )
  }

  private func completeSpeech(for utterance: AVSpeechUtterance, delivered: Bool) {
    guard let pendingSpeech, pendingSpeech.utterance === utterance else {
      return
    }

    self.pendingSpeech = nil
    setSpeaking(false)
    sendStateChanged()

    if delivered {
      pendingSpeech.continuation.resume(returning: ())
    } else {
      pendingSpeech.continuation.resume(
        throwing: GuidePupSpeechDeliveryCancelledException()
      )
    }
  }

  private func clearError() {
    stateLock.lock()
    lastError = nil
    stateLock.unlock()
  }

  private func recordError(_ message: String) {
    stateLock.lock()
    lastError = message
    stateLock.unlock()
  }

  private func sendStateChanged() {
    let payload = stateDictionary()
    if Thread.isMainThread {
      onStateChanged?(payload)
      return
    }

    DispatchQueue.main.async { [weak self] in
      self?.onStateChanged?(payload)
    }
  }

  private func setListening(_ nextValue: Bool) {
    stateLock.lock()
    listening = nextValue
    stateLock.unlock()
  }

  private func setRecoveryState(_ nextValue: RecoveryState) {
    stateLock.lock()
    recoveryState = nextValue
    stateLock.unlock()
  }

  private func setSpeaking(_ nextValue: Bool) {
    stateLock.lock()
    speaking = nextValue
    stateLock.unlock()
  }

  private func setVoiceProcessingEnabled(_ nextValue: Bool) {
    stateLock.lock()
    voiceProcessingEnabled = nextValue
    stateLock.unlock()
  }

  private func requestMicrophonePermission() async -> String {
    let currentStatus = Self.microphonePermissionStatusString()
    if currentStatus != "undetermined" {
      return currentStatus
    }

    return await withCheckedContinuation { continuation in
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        continuation.resume(returning: granted ? "granted" : "denied")
      }
    }
  }

  private func requestSpeechPermission() async -> String {
    let currentStatus = Self.speechPermissionStatusString()
    if currentStatus != "undetermined" {
      return currentStatus
    }

    return await withCheckedContinuation { continuation in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: Self.speechPermissionStatusString(status))
      }
    }
  }

  private static func microphonePermissionStatusString() -> String {
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      return "granted"
    case .denied:
      return "denied"
    case .undetermined:
      return "undetermined"
    @unknown default:
      return "restricted"
    }
  }

  private static func speechPermissionStatusString() -> String {
    speechPermissionStatusString(SFSpeechRecognizer.authorizationStatus())
  }

  private static func speechPermissionStatusString(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized:
      return "granted"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "undetermined"
    @unknown default:
      return "restricted"
    }
  }
}
