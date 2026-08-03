import AVFoundation
import CoreImage
import CoreMedia
import UIKit

typealias GuidePupCameraStateHandler = ([String: Any?]) -> Void

final class GuidePupCameraSessionController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  private enum RecoveryState: String {
    case background
    case exhausted
    case idle
    case interrupted
    case recovering
  }

  private static let maximumRecoveryAttempts = 3
  private static let maximumSampleAgeMs = 1_500.0
  private static let recoveryDelays: [TimeInterval] = [0.25, 0.75, 1.5]
  private static let recoveryStabilityDelay: TimeInterval = 10
  private static let backgroundError = "Guide Pup camera capture is unavailable while the app is in the background."
  private static let interruptionError = "Guide Pup camera capture was interrupted. Waiting to recover."
  private static let recoveringError = "Guide Pup camera is recovering after an interruption."
  private static let recoveryExhaustedError = "Guide Pup camera could not recover after several attempts."
  private static let startError = "Guide Pup camera session could not start."

  private let ciContext = CIContext()
  private let sampleBufferQueue = DispatchQueue(label: "guidepup.navigation.sample-buffer")
  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "guidepup.navigation.session")
  private let stateLock = NSLock()

  private var activeFrameGeneration = 0
  private var appActive = true
  private var isConfigured = false
  private var lastCaptureLatencyMs: Double?
  private var lastError: String?
  private var latestFrameHeight: Int?
  private var latestFrameWidth: Int?
  private var latestSampleReceivedAtUptimeMs: Double?
  private var latestSampleBuffer: CMSampleBuffer?
  private var latestSampleGeneration: Int?
  private var latestSampleTimestampMs: Int?
  private var notificationObservers: [NSObjectProtocol] = []
  private var recoveryAttemptCount = 0
  private var recoveryState = RecoveryState.idle
  private var recoveryStabilityWorkItem: DispatchWorkItem?
  private var recoveryWorkItem: DispatchWorkItem?
  private var sessionActive = false
  private var sessionDesired = false
  private var sessionGeneration = 0
  private var sessionInterrupted = false
  private var videoOutput: AVCaptureVideoDataOutput?

  var onStateChanged: GuidePupCameraStateHandler?

  override init() {
    super.init()

    let notificationCenter = NotificationCenter.default
    notificationObservers = [
      notificationCenter.addObserver(
        forName: AVCaptureSession.wasInterruptedNotification,
        object: session,
        queue: nil
      ) { [weak self] _ in
        self?.handleSessionInterrupted()
      },
      notificationCenter.addObserver(
        forName: AVCaptureSession.interruptionEndedNotification,
        object: session,
        queue: nil
      ) { [weak self] _ in
        self?.handleSessionInterruptionEnded()
      },
      notificationCenter.addObserver(
        forName: AVCaptureSession.runtimeErrorNotification,
        object: session,
        queue: nil
      ) { [weak self] notification in
        self?.handleSessionRuntimeError(notification)
      },
      notificationCenter.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: nil
      ) { [weak self] _ in
        self?.handleAppDidEnterBackground()
      },
      notificationCenter.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: nil
      ) { [weak self] _ in
        self?.handleAppDidBecomeActive()
      }
    ]
  }

  deinit {
    recoveryWorkItem?.cancel()
    recoveryStabilityWorkItem?.cancel()
    notificationObservers.forEach { NotificationCenter.default.removeObserver($0) }
    releaseLatestSampleBuffer()
  }

  func isAvailable() -> Bool {
    AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil
  }

  func startSession() async throws -> [String: Any?] {
    try await withCheckedThrowingContinuation { continuation in
      sessionQueue.async {
        self.sessionGeneration += 1
        self.recoveryAttemptCount = 0
        self.cancelRecoveryWorkItems()
        self.setSessionDesired(true)
        self.setRecoveryState(.idle)
        self.clearLastError()

        do {
          guard self.appActive else {
            throw GuidePupSessionConfigurationException(Self.backgroundError)
          }
          guard !self.sessionInterrupted else {
            throw GuidePupSessionConfigurationException(Self.interruptionError)
          }

          try self.startSessionInternal()
          self.setRecoveryState(.idle)
          self.clearLastError()
          self.sendStateChanged()
          continuation.resume(returning: self.stateDictionary())
        } catch {
          self.setSessionDesired(false)
          self.stopSessionInternal(removeConfiguration: true)
          if self.currentLastError() == nil {
            self.recordError(Self.startError)
          }
          if !self.appActive {
            self.setRecoveryState(.background)
          } else if self.sessionInterrupted {
            self.setRecoveryState(.interrupted)
          } else {
            self.setRecoveryState(.idle)
          }
          self.sendStateChanged()
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func stopSession() async -> [String: Any?] {
    await withCheckedContinuation { continuation in
      sessionQueue.async {
        self.sessionGeneration += 1
        self.recoveryAttemptCount = 0
        self.cancelRecoveryWorkItems()
        self.setSessionDesired(false)
        self.stopSessionInternal(removeConfiguration: true)
        self.setRecoveryState(.idle)
        self.clearLastError()
        self.sendStateChanged()
        continuation.resume(returning: self.stateDictionary())
      }
    }
  }

  func captureFrame(compressionQuality: Double, maxDimension: Double) async throws -> [String: Any?] {
    try await withCheckedThrowingContinuation { continuation in
      sampleBufferQueue.async {
        let startedAt = CACurrentMediaTime()

        do {
          guard self.isSessionActive(), self.session.isRunning else {
            if self.markSessionUnavailableIfDesired(
              GuidePupSessionNotRunningException().reason,
              recoveryState: .recovering
            ) {
              self.sessionQueue.async {
                self.scheduleRecoveryIfNeeded()
              }
            }
            throw GuidePupSessionNotRunningException()
          }

          let sample = try self.copyLatestSampleBuffer()

          let result = try self.encodeFrame(
            sampleBuffer: sample.buffer,
            compressionQuality: compressionQuality,
            maxDimension: maxDimension
          )

          let latencyMs = (CACurrentMediaTime() - startedAt) * 1000
          self.stateLock.lock()
          self.lastCaptureLatencyMs = latencyMs
          self.latestFrameWidth = result.width
          self.latestFrameHeight = result.height
          self.lastError = nil
          self.stateLock.unlock()

          continuation.resume(returning: [
            "base64": result.base64,
            "captureLatencyMs": latencyMs,
            "height": result.height,
            "timestampMs": sample.timestampMs,
            "uri": nil,
            "width": result.width
          ])
        } catch {
          if self.currentLastError() == nil {
            if error is GuidePupFrameEncodingException {
              self.recordError(GuidePupFrameEncodingException().reason)
            } else if error is GuidePupFrameUnavailableException {
              self.recordError(GuidePupFrameUnavailableException().reason)
            } else {
              self.recordError(GuidePupSessionNotRunningException().reason)
            }
          }
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func stateDictionary() -> [String: Any?] {
    stateLock.lock()
    let currentLastCaptureLatencyMs = lastCaptureLatencyMs
    let currentLastError = lastError
    let currentRecoveryState = recoveryState
    let currentSessionActive = sessionActive
    stateLock.unlock()

    return [
      "available": isAvailable(),
      "lastCaptureLatencyMs": currentLastCaptureLatencyMs,
      "lastError": currentLastError,
      "permissionStatus": Self.permissionStatusString(),
      "recoveryState": currentRecoveryState.rawValue,
      "sessionActive": currentSessionActive,
      "sessionState": currentSessionActive ? "running" : "stopped",
      "voiceOverRunning": UIAccessibility.isVoiceOverRunning
    ]
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard let timestampMs = captureTimestampMs(for: sampleBuffer) else {
      return
    }

    stateLock.lock()
    guard
      sessionActive,
      let currentOutput = videoOutput,
      output === currentOutput
    else {
      stateLock.unlock()
      return
    }

    latestSampleBuffer = sampleBuffer
    latestSampleGeneration = activeFrameGeneration
    latestSampleReceivedAtUptimeMs = CACurrentMediaTime() * 1000
    latestSampleTimestampMs = timestampMs
    if let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
      latestFrameWidth = CVPixelBufferGetWidth(imageBuffer)
      latestFrameHeight = CVPixelBufferGetHeight(imageBuffer)
    }
    stateLock.unlock()
  }

  private func startSessionInternal() throws {
    let authorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    guard authorizationStatus == .authorized else {
      recordError(GuidePupPermissionDeniedException().reason)
      throw GuidePupPermissionDeniedException()
    }

    try configureSessionIfNeeded()
    if !session.isRunning {
      session.startRunning()
    }
    guard session.isRunning else {
      throw GuidePupSessionNotRunningException()
    }

    setSessionActive(true)
    clearLastError()
  }

  private func configureSessionIfNeeded() throws {
    guard !isConfigured else {
      return
    }

    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
      throw GuidePupCameraUnavailableException()
    }

    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.sessionPreset = .medium
    session.inputs.forEach { session.removeInput($0) }
    session.outputs.forEach { session.removeOutput($0) }

    let input = try AVCaptureDeviceInput(device: device)
    guard session.canAddInput(input) else {
      throw GuidePupSessionConfigurationException("Guide Pup could not attach a camera input.")
    }
    session.addInput(input)

    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
    ]
    output.setSampleBufferDelegate(self, queue: sampleBufferQueue)

    guard session.canAddOutput(output) else {
      throw GuidePupSessionConfigurationException("Guide Pup could not attach a video output.")
    }
    session.addOutput(output)

    if let connection = output.connection(with: .video) {
      if connection.isVideoMirroringSupported {
        connection.isVideoMirrored = false
      }
      if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
    }

    stateLock.lock()
    videoOutput = output
    stateLock.unlock()
    isConfigured = true
  }

  private func copyLatestSampleBuffer() throws -> (buffer: CMSampleBuffer, timestampMs: Int) {
    stateLock.lock()
    guard
      sessionActive,
      let sampleBuffer = latestSampleBuffer,
      let sampleGeneration = latestSampleGeneration,
      let receivedAtUptimeMs = latestSampleReceivedAtUptimeMs,
      let timestampMs = latestSampleTimestampMs,
      sampleGeneration == activeFrameGeneration
    else {
      stateLock.unlock()
      throw GuidePupFrameUnavailableException()
    }

    let receivedAgeMs = CACurrentMediaTime() * 1000 - receivedAtUptimeMs
    let presentationAgeMs = Date().timeIntervalSince1970 * 1000 - Double(timestampMs)
    guard
      receivedAgeMs >= 0,
      receivedAgeMs <= Self.maximumSampleAgeMs,
      presentationAgeMs >= -100,
      presentationAgeMs <= Self.maximumSampleAgeMs
    else {
      latestSampleBuffer = nil
      latestSampleGeneration = nil
      latestSampleReceivedAtUptimeMs = nil
      latestSampleTimestampMs = nil
      stateLock.unlock()
      throw GuidePupFrameUnavailableException()
    }
    stateLock.unlock()
    return (sampleBuffer, timestampMs)
  }

  private func captureTimestampMs(for sampleBuffer: CMSampleBuffer) -> Int? {
    let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    guard presentationTime.isValid, !presentationTime.isIndefinite else {
      return nil
    }

    let hostClock = CMClockGetHostTimeClock()
    let hostPresentationTime: CMTime
    if let masterClock = session.masterClock {
      hostPresentationTime = CMSyncConvertTime(
        presentationTime,
        from: masterClock,
        to: hostClock
      )
    } else {
      hostPresentationTime = presentationTime
    }

    let ageSeconds = CMTimeGetSeconds(
      CMTimeSubtract(CMClockGetTime(hostClock), hostPresentationTime)
    )
    guard ageSeconds.isFinite, ageSeconds >= -0.1, ageSeconds <= 60 else {
      return nil
    }

    let epochNowMs = Date().timeIntervalSince1970 * 1000
    return Int(epochNowMs - max(0, ageSeconds) * 1000)
  }

  private func encodeFrame(
    sampleBuffer: CMSampleBuffer,
    compressionQuality: Double,
    maxDimension: Double
  ) throws -> (base64: String, width: Int, height: Int) {
    guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      throw GuidePupFrameUnavailableException()
    }

    var image = CIImage(cvPixelBuffer: imageBuffer)
    let originalExtent = image.extent.integral
    let safeMaxDimension = maxDimension > 0 ? maxDimension : 768
    let longestEdge = max(originalExtent.width, originalExtent.height)

    if longestEdge > safeMaxDimension {
      let scale = safeMaxDimension / longestEdge
      image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    }

    let outputExtent = image.extent.integral
    guard let cgImage = ciContext.createCGImage(image, from: outputExtent) else {
      throw GuidePupFrameEncodingException()
    }

    let uiImage = UIImage(cgImage: cgImage)
    let clampedQuality = min(max(compressionQuality, 0.1), 1.0)

    guard let jpegData = uiImage.jpegData(compressionQuality: clampedQuality) else {
      throw GuidePupFrameEncodingException()
    }

    return (
      base64: jpegData.base64EncodedString(),
      width: Int(outputExtent.width),
      height: Int(outputExtent.height)
    )
  }

  private func handleSessionInterrupted() {
    guard markSessionUnavailableIfDesired(
      Self.interruptionError,
      recoveryState: .interrupted
    ) else {
      return
    }

    sessionQueue.async {
      guard self.isSessionDesired() else {
        return
      }
      self.sessionInterrupted = true
      self.cancelRecoveryWorkItems()
    }
  }

  private func handleSessionInterruptionEnded() {
    sessionQueue.async {
      self.sessionInterrupted = false
      guard self.isSessionDesired() else {
        return
      }
      self.scheduleRecoveryIfNeeded()
    }
  }

  private func handleSessionRuntimeError(_ notification: Notification) {
    guard markSessionUnavailableIfDesired(
      Self.recoveringError,
      recoveryState: .recovering
    ) else {
      return
    }

    let runtimeError = notification.userInfo?[AVCaptureSessionErrorKey] as? AVError
    let mediaServicesWereReset = runtimeError?.code == .mediaServicesWereReset
    sessionQueue.async {
      guard self.isSessionDesired() else {
        return
      }
      self.cancelRecoveryWorkItems()
      if self.session.isRunning {
        self.session.stopRunning()
      }
      self.setSessionActive(false)
      self.releaseLatestSampleBuffer()
      if mediaServicesWereReset {
        self.isConfigured = false
        self.stateLock.lock()
        self.videoOutput = nil
        self.stateLock.unlock()
      }
      self.scheduleRecoveryIfNeeded()
    }
  }

  private func handleAppDidEnterBackground() {
    _ = markSessionUnavailableIfDesired(
      Self.backgroundError,
      recoveryState: .background
    )
    sessionQueue.async {
      self.appActive = false
      self.cancelRecoveryWorkItems()
      if self.session.isRunning {
        self.session.stopRunning()
      }
      self.setSessionActive(false)
      self.releaseLatestSampleBuffer()
    }
  }

  private func handleAppDidBecomeActive() {
    sessionQueue.async {
      self.appActive = true
      guard self.isSessionDesired(), !self.sessionInterrupted else {
        return
      }
      guard !self.isSessionActive() || !self.session.isRunning else {
        return
      }
      self.scheduleRecoveryIfNeeded()
    }
  }

  private func scheduleRecoveryIfNeeded() {
    guard isSessionDesired(), appActive, !sessionInterrupted else {
      return
    }
    guard recoveryWorkItem == nil else {
      return
    }
    if session.isRunning {
      setSessionActive(true)
      setRecoveryState(.idle)
      clearLastError()
      sendStateChanged()
      return
    }
    guard recoveryAttemptCount < Self.maximumRecoveryAttempts else {
      markRecoveryExhausted()
      return
    }

    let attemptIndex = recoveryAttemptCount
    recoveryAttemptCount += 1
    let generation = sessionGeneration
    let workItem = DispatchWorkItem { [weak self] in
      self?.performRecovery(generation: generation)
    }
    recoveryWorkItem = workItem
    setRecoveryState(.recovering)
    recordError(Self.recoveringError)
    sendStateChanged()

    sessionQueue.asyncAfter(
      deadline: .now() + Self.recoveryDelays[attemptIndex],
      execute: workItem
    )
  }

  private func performRecovery(generation: Int) {
    recoveryWorkItem = nil
    guard
      generation == sessionGeneration,
      isSessionDesired(),
      appActive,
      !sessionInterrupted
    else {
      return
    }

    do {
      try startSessionInternal()
      setRecoveryState(.idle)
      clearLastError()
      sendStateChanged()
      scheduleRecoveryBudgetReset(generation: generation)
    } catch {
      setSessionActive(false)
      releaseLatestSampleBuffer()
      if recoveryAttemptCount >= Self.maximumRecoveryAttempts {
        markRecoveryExhausted()
      } else {
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
        generation == self.sessionGeneration,
        self.isSessionDesired(),
        self.session.isRunning,
        self.isSessionActive()
      else {
        return
      }
      self.recoveryAttemptCount = 0
    }
    recoveryStabilityWorkItem = workItem
    sessionQueue.asyncAfter(
      deadline: .now() + Self.recoveryStabilityDelay,
      execute: workItem
    )
  }

  private func markRecoveryExhausted() {
    recoveryWorkItem?.cancel()
    recoveryWorkItem = nil
    recoveryStabilityWorkItem?.cancel()
    recoveryStabilityWorkItem = nil
    setSessionActive(false)
    releaseLatestSampleBuffer()
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

  private func stopSessionInternal(removeConfiguration: Bool) {
    if session.isRunning {
      session.stopRunning()
    }

    if removeConfiguration {
      session.beginConfiguration()
      session.inputs.forEach { session.removeInput($0) }
      session.outputs.forEach { session.removeOutput($0) }
      session.commitConfiguration()
      stateLock.lock()
      videoOutput = nil
      stateLock.unlock()
      isConfigured = false
    }

    setSessionActive(false)
    releaseLatestSampleBuffer()
  }

  private func clearLastError() {
    stateLock.lock()
    lastError = nil
    stateLock.unlock()
  }

  private func currentLastError() -> String? {
    stateLock.lock()
    let currentError = lastError
    stateLock.unlock()
    return currentError
  }

  private func isSessionActive() -> Bool {
    stateLock.lock()
    let active = sessionActive
    stateLock.unlock()
    return active
  }

  private func isSessionDesired() -> Bool {
    stateLock.lock()
    let desired = sessionDesired
    stateLock.unlock()
    return desired
  }

  @discardableResult
  private func markSessionUnavailableIfDesired(
    _ message: String,
    recoveryState nextRecoveryState: RecoveryState
  ) -> Bool {
    stateLock.lock()
    guard sessionDesired else {
      stateLock.unlock()
      return false
    }
    let stateChanged = sessionActive
      || lastError != message
      || recoveryState != nextRecoveryState
    sessionActive = false
    lastError = message
    recoveryState = nextRecoveryState
    stateLock.unlock()
    releaseLatestSampleBuffer()
    if stateChanged {
      sendStateChanged()
    }
    return true
  }

  private func recordError(_ message: String) {
    stateLock.lock()
    lastError = message
    stateLock.unlock()
  }

  private func releaseLatestSampleBuffer() {
    stateLock.lock()
    latestSampleBuffer = nil
    latestSampleGeneration = nil
    latestSampleReceivedAtUptimeMs = nil
    latestSampleTimestampMs = nil
    stateLock.unlock()
  }

  private func sendStateChanged() {
    let payload = stateEventDictionary()
    if Thread.isMainThread {
      onStateChanged?(payload)
      return
    }

    DispatchQueue.main.async { [weak self] in
      self?.onStateChanged?(payload)
    }
  }

  private func setRecoveryState(_ nextRecoveryState: RecoveryState) {
    stateLock.lock()
    recoveryState = nextRecoveryState
    stateLock.unlock()
  }

  private func setSessionActive(_ active: Bool) {
    stateLock.lock()
    if active && !sessionActive {
      activeFrameGeneration += 1
      latestSampleBuffer = nil
      latestSampleGeneration = nil
      latestSampleReceivedAtUptimeMs = nil
      latestSampleTimestampMs = nil
    } else if !active {
      latestSampleBuffer = nil
      latestSampleGeneration = nil
      latestSampleReceivedAtUptimeMs = nil
      latestSampleTimestampMs = nil
    }
    sessionActive = active
    stateLock.unlock()
  }

  private func setSessionDesired(_ desired: Bool) {
    stateLock.lock()
    sessionDesired = desired
    stateLock.unlock()
  }

  private func stateEventDictionary() -> [String: Any?] {
    stateLock.lock()
    let currentLastError = lastError
    let currentRecoveryState = recoveryState
    let currentSessionActive = sessionActive
    stateLock.unlock()

    return [
      "lastError": currentLastError,
      "recoveryState": currentRecoveryState.rawValue,
      "sessionActive": currentSessionActive,
      "sessionState": currentSessionActive ? "running" : "stopped"
    ]
  }

  private static func permissionStatusString() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return "granted"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "undetermined"
    @unknown default:
      return "unknown"
    }
  }
}
