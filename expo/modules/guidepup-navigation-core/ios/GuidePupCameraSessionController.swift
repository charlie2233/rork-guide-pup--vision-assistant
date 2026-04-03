import AVFoundation
import CoreImage
import CoreMedia
import UIKit

final class GuidePupCameraSessionController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let ciContext = CIContext()
  private let sampleBufferQueue = DispatchQueue(label: "guidepup.navigation.sample-buffer")
  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "guidepup.navigation.session")
  private let stateLock = NSLock()

  private var isConfigured = false
  private var lastCaptureLatencyMs: Double?
  private var lastError: String?
  private var latestFrameHeight: Int?
  private var latestFrameWidth: Int?
  private var latestSampleBuffer: CMSampleBuffer?
  private var sessionActive = false
  private var videoOutput: AVCaptureVideoDataOutput?

  deinit {
    releaseLatestSampleBuffer()
  }

  func isAvailable() -> Bool {
    AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil
  }

  func startSession() async throws -> [String: Any?] {
    try await withCheckedThrowingContinuation { continuation in
      sessionQueue.async {
        do {
          let authorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
          guard authorizationStatus == .authorized else {
            self.recordError(GuidePupPermissionDeniedException().reason)
            throw GuidePupPermissionDeniedException()
          }

          try self.configureSessionIfNeeded()
          if !self.session.isRunning {
            self.session.startRunning()
          }
          self.setSessionActive(true)
          self.clearLastError()
          continuation.resume(returning: self.stateDictionary())
        } catch {
          self.recordError(error.localizedDescription)
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func stopSession() async -> [String: Any?] {
    await withCheckedContinuation { continuation in
      sessionQueue.async {
        self.stopSessionInternal()
        continuation.resume(returning: self.stateDictionary())
      }
    }
  }

  func captureFrame(compressionQuality: Double, maxDimension: Double) async throws -> [String: Any?] {
    try await withCheckedThrowingContinuation { continuation in
      sampleBufferQueue.async {
        let startedAt = CACurrentMediaTime()

        do {
          guard self.session.isRunning else {
            self.recordError(GuidePupSessionNotRunningException().reason)
            throw GuidePupSessionNotRunningException()
          }

          let sampleBuffer = try self.copyLatestSampleBuffer()
          defer {
            CFRelease(sampleBuffer)
          }

          let result = try self.encodeFrame(
            sampleBuffer: sampleBuffer,
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
            "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
            "uri": nil,
            "width": result.width
          ])
        } catch {
          self.recordError(error.localizedDescription)
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func stateDictionary() -> [String: Any?] {
    stateLock.lock()
    let currentState: [String: Any?] = [
      "available": isAvailable(),
      "lastCaptureLatencyMs": lastCaptureLatencyMs,
      "lastError": lastError,
      "permissionStatus": Self.permissionStatusString(),
      "sessionActive": sessionActive,
      "sessionState": sessionActive ? "running" : "stopped",
      "voiceOverRunning": UIAccessibility.isVoiceOverRunning
    ]
    stateLock.unlock()
    return currentState
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    CFRetain(sampleBuffer)

    stateLock.lock()
    if let existingBuffer = latestSampleBuffer {
      CFRelease(existingBuffer)
    }
    latestSampleBuffer = sampleBuffer
    if let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
      latestFrameWidth = CVPixelBufferGetWidth(imageBuffer)
      latestFrameHeight = CVPixelBufferGetHeight(imageBuffer)
    }
    stateLock.unlock()
  }

  private func clearLastError() {
    stateLock.lock()
    lastError = nil
    stateLock.unlock()
  }

  private func configureSessionIfNeeded() throws {
    guard !isConfigured else {
      return
    }

    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
      throw GuidePupCameraUnavailableException()
    }

    session.beginConfiguration()
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

    videoOutput = output
    isConfigured = true
    session.commitConfiguration()
  }

  private func copyLatestSampleBuffer() throws -> CMSampleBuffer {
    stateLock.lock()
    guard let sampleBuffer = latestSampleBuffer else {
      stateLock.unlock()
      throw GuidePupFrameUnavailableException()
    }
    CFRetain(sampleBuffer)
    stateLock.unlock()
    return sampleBuffer
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

  private func recordError(_ message: String) {
    stateLock.lock()
    lastError = message
    stateLock.unlock()
  }

  private func releaseLatestSampleBuffer() {
    stateLock.lock()
    if let existingBuffer = latestSampleBuffer {
      CFRelease(existingBuffer)
      latestSampleBuffer = nil
    }
    stateLock.unlock()
  }

  private func setSessionActive(_ active: Bool) {
    stateLock.lock()
    sessionActive = active
    stateLock.unlock()
  }

  private func stopSessionInternal() {
    if session.isRunning {
      session.stopRunning()
    }
    session.beginConfiguration()
    session.inputs.forEach { session.removeInput($0) }
    session.outputs.forEach { session.removeOutput($0) }
    session.commitConfiguration()
    videoOutput = nil
    isConfigured = false
    setSessionActive(false)
    releaseLatestSampleBuffer()
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
