import ExpoModulesCore
import AudioToolbox
import StoreKit
import UIKit

private final class GuidePupAccessibilityAnnouncementController {
  private struct PendingAnnouncement {
    let identifier: Int
    let message: String
    let ownerToken: String
    var continuations: [CheckedContinuation<Void, Error>]
    let observer: NSObjectProtocol
    let timeoutWorkItem: DispatchWorkItem
  }

  private var nextIdentifier = 0
  private var currentOwnerToken: String?
  private var pendingAnnouncement: PendingAnnouncement?

  deinit {
    completePendingAnnouncement(disposition: .interrupted)
  }

  func claimOwner(_ rawOwnerToken: String) async {
    let ownerToken = rawOwnerToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !ownerToken.isEmpty else {
      return
    }

    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        if self.currentOwnerToken != ownerToken {
          if self.pendingAnnouncement != nil {
            self.interruptCurrentAnnouncement()
            self.completePendingAnnouncement(disposition: .ownershipChanged)
          }
          self.currentOwnerToken = ownerToken
        }
        continuation.resume(returning: ())
      }
    }
  }

  func releaseOwner(_ rawOwnerToken: String) async {
    let ownerToken = rawOwnerToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !ownerToken.isEmpty else {
      return
    }

    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        guard self.currentOwnerToken == ownerToken else {
          continuation.resume(returning: ())
          return
        }

        if self.pendingAnnouncement?.ownerToken == ownerToken {
          self.interruptCurrentAnnouncement()
          self.completePendingAnnouncement(disposition: .ownershipReleased)
        }
        self.currentOwnerToken = nil
        continuation.resume(returning: ())
      }
    }
  }

  func announce(_ rawMessage: String, ownerToken rawOwnerToken: String) async throws {
    let message = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    let ownerToken = rawOwnerToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty, !ownerToken.isEmpty else {
      return
    }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      DispatchQueue.main.async {
        self.beginAnnouncement(
          message,
          ownerToken: ownerToken,
          interruptExisting: false,
          continuation: continuation
        )
      }
    }
  }

  func cancel(ownerToken rawOwnerToken: String) async {
    let ownerToken = rawOwnerToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !ownerToken.isEmpty else {
      return
    }

    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        guard
          self.currentOwnerToken == ownerToken,
          self.pendingAnnouncement?.ownerToken == ownerToken
        else {
          continuation.resume(returning: ())
          return
        }

        self.interruptCurrentAnnouncement()
        self.completePendingAnnouncement(disposition: .cancelled)
        continuation.resume(returning: ())
      }
    }
  }

  func interruptAll() async {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        self.interruptCurrentAnnouncement()
        self.completePendingAnnouncement(disposition: .interrupted)
        continuation.resume(returning: ())
      }
    }
  }

  private func interruptCurrentAnnouncement() {
    guard UIAccessibility.isVoiceOverRunning else {
      return
    }

    let interrupt = NSMutableAttributedString(string: "\u{200B}")
    interrupt.addAttribute(
      .accessibilitySpeechQueueAnnouncement,
      value: false,
      range: NSRange(location: 0, length: interrupt.length)
    )
    UIAccessibility.post(notification: .announcement, argument: interrupt)
  }

  func supersede(_ rawMessage: String, ownerToken rawOwnerToken: String) async throws {
    let message = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    let ownerToken = rawOwnerToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !ownerToken.isEmpty else {
      return
    }
    guard !message.isEmpty else {
      await cancel(ownerToken: ownerToken)
      return
    }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      DispatchQueue.main.async {
        self.beginAnnouncement(
          message,
          ownerToken: ownerToken,
          interruptExisting: true,
          continuation: continuation
        )
      }
    }
  }

  private func beginAnnouncement(
    _ message: String,
    ownerToken: String,
    interruptExisting: Bool,
    continuation: CheckedContinuation<Void, Error>
  ) {
    guard currentOwnerToken == ownerToken else {
      resume(continuation, disposition: .ownershipChanged)
      return
    }

    guard UIAccessibility.isVoiceOverRunning else {
      resume(continuation, disposition: .voiceOverUnavailable)
      return
    }

    if
      !interruptExisting,
      var pendingAnnouncement,
      pendingAnnouncement.message == message,
      pendingAnnouncement.ownerToken == ownerToken
    {
      pendingAnnouncement.continuations.append(continuation)
      self.pendingAnnouncement = pendingAnnouncement
      return
    }

    if pendingAnnouncement != nil {
      interruptCurrentAnnouncement()
      completePendingAnnouncement(disposition: .superseded)
    }
    nextIdentifier += 1
    let identifier = nextIdentifier

    let observer = NotificationCenter.default.addObserver(
      forName: UIAccessibility.announcementDidFinishNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      self?.handleAnnouncementFinished(notification, identifier: identifier)
    }
    let timeoutWorkItem = DispatchWorkItem { [weak self] in
      self?.timeoutPendingAnnouncement(identifier: identifier)
    }
    pendingAnnouncement = PendingAnnouncement(
      identifier: identifier,
      message: message,
      ownerToken: ownerToken,
      continuations: [continuation],
      observer: observer,
      timeoutWorkItem: timeoutWorkItem
    )

    let announcement: Any
    if interruptExisting {
      let attributedMessage = NSMutableAttributedString(string: message)
      attributedMessage.addAttribute(
        .accessibilitySpeechQueueAnnouncement,
        value: false,
        range: NSRange(location: 0, length: attributedMessage.length)
      )
      announcement = attributedMessage
    } else {
      announcement = message
    }
    UIAccessibility.post(notification: .announcement, argument: announcement)
    DispatchQueue.main.asyncAfter(
      deadline: .now() + GuidePupAnnouncementDeliveryPolicy.completionTimeout(for: message),
      execute: timeoutWorkItem
    )
  }

  private func handleAnnouncementFinished(_ notification: Notification, identifier: Int) {
    guard
      let pendingAnnouncement,
      pendingAnnouncement.identifier == identifier,
      Self.announcementText(from: notification) == pendingAnnouncement.message
    else {
      return
    }

    completePendingAnnouncement(
      identifier: identifier,
      disposition: .completed(success: Self.announcementWasSuccessful(notification))
    )
  }

  private func timeoutPendingAnnouncement(identifier: Int) {
    guard pendingAnnouncement?.identifier == identifier else {
      return
    }

    interruptCurrentAnnouncement()
    completePendingAnnouncement(
      identifier: identifier,
      disposition: .timedOut
    )
  }

  private func completePendingAnnouncement(
    identifier: Int? = nil,
    disposition: GuidePupAnnouncementDeliveryDisposition
  ) {
    guard let pendingAnnouncement else {
      return
    }
    if let identifier, identifier != pendingAnnouncement.identifier {
      return
    }

    self.pendingAnnouncement = nil
    NotificationCenter.default.removeObserver(pendingAnnouncement.observer)
    pendingAnnouncement.timeoutWorkItem.cancel()
    let result = GuidePupAnnouncementDeliveryPolicy.result(for: disposition)
    pendingAnnouncement.continuations.forEach { continuation in
      switch result {
      case .success:
        continuation.resume(returning: ())
      case .failure(let error):
        continuation.resume(throwing: error)
      }
    }
  }

  private func resume(
    _ continuation: CheckedContinuation<Void, Error>,
    disposition: GuidePupAnnouncementDeliveryDisposition
  ) {
    switch GuidePupAnnouncementDeliveryPolicy.result(for: disposition) {
    case .success:
      continuation.resume(returning: ())
    case .failure(let error):
      continuation.resume(throwing: error)
    }
  }

  private static func announcementText(from notification: Notification) -> String? {
    if let message = notification.userInfo?[UIAccessibility.announcementStringValueUserInfoKey] as? String {
      return message
    }
    if let message = notification.userInfo?[UIAccessibility.announcementStringValueUserInfoKey]
      as? NSAttributedString {
      return message.string
    }
    return nil
  }

  private static func announcementWasSuccessful(_ notification: Notification) -> Bool? {
    if let successful =
      notification.userInfo?[UIAccessibility.announcementWasSuccessfulUserInfoKey] as? Bool {
      return successful
    }
    if let successful =
      notification.userInfo?[UIAccessibility.announcementWasSuccessfulUserInfoKey] as? NSNumber {
      return successful.boolValue
    }
    return nil
  }
}

public final class GuidePupNavigationCoreModule: Module {
  private let announcementController = GuidePupAccessibilityAnnouncementController()
  private let cameraController = GuidePupCameraSessionController()

  public func definition() -> ModuleDefinition {
    Name("GuidePupNavigationCore")

    Events("onStateChanged")

    OnCreate {
      cameraController.onStateChanged = { [weak self] payload in
        self?.sendEvent("onStateChanged", payload)
      }
    }

    AsyncFunction("isAvailable") {
      cameraController.isAvailable()
    }

    AsyncFunction("startSession") { () -> [String: Any?] in
      try await cameraController.startSession()
    }

    AsyncFunction("stopSession") { () -> [String: Any?] in
      await cameraController.stopSession()
    }

    AsyncFunction("captureFrame") { () -> [String: Any?] in
      try await cameraController.captureFrame(
        compressionQuality: 0.55,
        maxDimension: 768
      )
    }

    AsyncFunction("claimAnnouncementOwner") { (ownerToken: String) async in
      await announcementController.claimOwner(ownerToken)
    }

    AsyncFunction("releaseAnnouncementOwner") { (ownerToken: String) async in
      await announcementController.releaseOwner(ownerToken)
    }

    AsyncFunction("announce") { (message: String, ownerToken: String) in
      try await announcementController.announce(message, ownerToken: ownerToken)
    }

    AsyncFunction("cancelAnnouncement") { (ownerToken: String) async in
      await announcementController.cancel(ownerToken: ownerToken)
    }

    AsyncFunction("interruptAllAnnouncements") {
      await announcementController.interruptAll()
    }

    AsyncFunction("supersedeAnnouncement") { (message: String, ownerToken: String) in
      try await announcementController.supersede(message, ownerToken: ownerToken)
    }

    AsyncFunction("playHaptic") { (type: String) in
      switch type {
      case "left":
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.prepare()
        generator.impactOccurred()
      case "right":
        let generator = UIImpactFeedbackGenerator(style: .heavy)
        generator.prepare()
        generator.impactOccurred()
      case "forward":
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.prepare()
        generator.impactOccurred()
      case "success":
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.success)
      case "stop", "error":
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.error)
      default:
        let generator = UISelectionFeedbackGenerator()
        generator.prepare()
        generator.selectionChanged()
      }
    }
    .runOnQueue(.main)

    AsyncFunction("playAudioCue") { (type: String) in
      let soundId: SystemSoundID
      switch type {
      case "stop", "error":
        soundId = 1006
      case "success":
        soundId = 1103
      case "left":
        soundId = 1057
      case "right":
        soundId = 1058
      default:
        soundId = 1104
      }
      AudioServicesPlaySystemSound(soundId)
    }
    .runOnQueue(.main)

    AsyncFunction("getDistributionEvidence") { () async -> [String: Any] in
      guard #available(iOS 16.0, *) else {
        return [
          "appStoreAppIdMatched": false,
          "bundleVersionMatched": false,
          "transactionVerified": false,
          "identityMatched": false,
          "environment": "none",
        ]
      }

      do {
        switch try await AppTransaction.shared {
        case .verified(let appTransaction):
          let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
          let appVersion =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            ?? ""
          let bundleVersion =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
            ?? ""
          let expectedBuildNumber =
            Bundle.main.object(forInfoDictionaryKey: "GuidePupExpectedBuildNumber") as? String
            ?? ""
          let expectedAppStoreAppId =
            Bundle.main.object(forInfoDictionaryKey: "GuidePupAppStoreConnectAppID") as? String
            ?? ""
          let appStoreAppIdMatched =
            appTransaction.appID.map(String.init) == expectedAppStoreAppId
            && !expectedAppStoreAppId.isEmpty
          let bundleVersionMatched =
            bundleVersion == expectedBuildNumber
            && !expectedBuildNumber.isEmpty
          let identityMatched =
            !bundleIdentifier.isEmpty
            && !appVersion.isEmpty
            && appTransaction.bundleID == bundleIdentifier
            && appTransaction.appVersion == appVersion
            && appStoreAppIdMatched
          let environment: String
          switch appTransaction.environment {
          case .sandbox:
            environment = "apple-sandbox"
          case .production:
            environment = "app-store-production"
          case .xcode:
            environment = "xcode"
          default:
            environment = "unknown"
          }
          return [
            "appStoreAppIdMatched": appStoreAppIdMatched,
            "bundleVersionMatched": bundleVersionMatched,
            "transactionVerified": true,
            "identityMatched": identityMatched,
            "environment": environment,
          ]
        case .unverified:
          return [
            "appStoreAppIdMatched": false,
            "bundleVersionMatched": false,
            "transactionVerified": false,
            "identityMatched": false,
            "environment": "none",
          ]
        }
      } catch {
        return [
          "appStoreAppIdMatched": false,
          "bundleVersionMatched": false,
          "transactionVerified": false,
          "identityMatched": false,
          "environment": "none",
        ]
      }
    }

    AsyncFunction("getState") {
      cameraController.stateDictionary()
    }
  }
}
