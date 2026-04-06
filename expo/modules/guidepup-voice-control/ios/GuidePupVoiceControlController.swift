import AVFoundation
import Speech
import UIKit

typealias GuidePupVoiceRecognitionHandler = ([String: Any]) -> Void
typealias GuidePupVoiceStateHandler = ([String: Any]) -> Void

final class GuidePupVoiceControlController: NSObject, AVSpeechSynthesizerDelegate {
  private let audioEngine = AVAudioEngine()
  private let stateLock = NSLock()
  private let speechSynthesizer = AVSpeechSynthesizer()

  private var audioTapInstalled = false
  private var lastError: String?
  private var lastTranscript: String?
  private var listening = false
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var speechContinuation: CheckedContinuation<Void, Error>?
  private var speechRecognizer: SFSpeechRecognizer?
  private var speaking = false

  var onRecognizedPhrase: GuidePupVoiceRecognitionHandler?
  var onStateChanged: GuidePupVoiceStateHandler?

  override init() {
    super.init()
    speechSynthesizer.delegate = self
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
    partialResults: Bool
  ) async throws -> [String: Any] {
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
        do {
          try self.startListeningSession(
            localeIdentifier: localeIdentifier,
            partialResults: partialResults
          )
          self.clearError()
          self.sendStateChanged()
          continuation.resume(returning: self.stateDictionary())
        } catch {
          self.recordError(error.localizedDescription)
          self.sendStateChanged()
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func stopCommandSession() async -> [String: Any] {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        self.stopListeningSession(resetError: false)
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
        if let pendingContinuation = self.speechContinuation {
          self.speechContinuation = nil
          pendingContinuation.resume(returning: ())
        }

        if interrupt && self.speechSynthesizer.isSpeaking {
          self.speechSynthesizer.stopSpeaking(at: .immediate)
        }

        self.speechContinuation = continuation
        self.speaking = true
        self.sendStateChanged()

        let utterance = AVSpeechUtterance(string: trimmed)
        if let localeIdentifier, let voice = AVSpeechSynthesisVoice(language: localeIdentifier) {
          utterance.voice = voice
        }
        if let rate {
          let normalizedRate = min(max(rate, 0.5), 1.5)
          utterance.rate = Float(normalizedRate) * AVSpeechUtteranceDefaultSpeechRate
        }

        self.speechSynthesizer.speak(utterance)
      }
    }
  }

  func stopSpeaking() async {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        if self.speechSynthesizer.isSpeaking {
          self.speechSynthesizer.stopSpeaking(at: .immediate)
        } else if let pendingContinuation = self.speechContinuation {
          self.speechContinuation = nil
          pendingContinuation.resume(returning: ())
        }
        self.speaking = false
        self.sendStateChanged()
        continuation.resume(returning: ())
      }
    }
  }

  func stateDictionary() -> [String: Any] {
    stateLock.lock()
    let currentState: [String: Any] = [
      "available": isAvailable(),
      "lastError": lastError ?? NSNull(),
      "listening": listening,
      "microphonePermission": Self.microphonePermissionStatusString(),
      "speaking": speaking,
      "speechPermission": Self.speechPermissionStatusString(),
    ]
    stateLock.unlock()
    return currentState
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    completeSpeech()
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    completeSpeech()
  }

  private func startListeningSession(
    localeIdentifier: String?,
    partialResults: Bool
  ) throws {
    stopListeningSession(resetError: false)

    let locale = Locale(identifier: localeIdentifier ?? Locale.current.identifier)
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
      throw GuidePupSpeechRecognitionUnavailableException()
    }
    if !recognizer.isAvailable {
      throw GuidePupVoiceSessionStartException("Guide Pup speech recognition is temporarily unavailable.")
    }

    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(
      .playAndRecord,
      mode: .measurement,
        options: [.defaultToSpeaker, .duckOthers, .allowBluetoothHFP]
    )
    try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = partialResults

    let inputNode = audioEngine.inputNode
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
    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else {
        return
      }

      if let result {
        let transcript = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !transcript.isEmpty && transcript != self.lastTranscript {
          self.lastTranscript = transcript
          self.onRecognizedPhrase?([
            "isFinal": result.isFinal,
            "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
            "transcript": transcript,
          ])
        }
      }

      if let error {
        self.recordError(error.localizedDescription)
        self.stopListeningSession(resetError: false)
        self.sendStateChanged()
        return
      }

      if result?.isFinal == true {
        self.sendStateChanged()
      }
    }

    setListening(true)
  }

  private func stopListeningSession(resetError: Bool) {
    recognitionRequest?.endAudio()
    recognitionRequest = nil

    recognitionTask?.cancel()
    recognitionTask = nil

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

    if resetError {
      clearError()
    }
  }

  private func completeSpeech() {
    speaking = false
    sendStateChanged()

    guard let continuation = speechContinuation else {
      return
    }
    speechContinuation = nil
    continuation.resume(returning: ())
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
    onStateChanged?(stateDictionary())
  }

  private func setListening(_ nextValue: Bool) {
    stateLock.lock()
    listening = nextValue
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
