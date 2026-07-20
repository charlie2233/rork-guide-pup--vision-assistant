import ExpoModulesCore
import AudioToolbox
import UIKit

private final class GuidePupAccessibilityAnnouncementController {
  private struct PendingAnnouncement {
    let identifier: Int
    let message: String
    let ownerToken: String
    var continuations: [CheckedContinuation<Void, Never>]
    let observer: NSObjectProtocol
    let timeoutWorkItem: DispatchWorkItem
  }

  private static let completionTimeout: TimeInterval = 30

  private var nextIdentifier = 0
  private var currentOwnerToken: String?
  private var pendingAnnouncement: PendingAnnouncement?

  deinit {
    finishPendingAnnouncement()
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
            self.finishPendingAnnouncement()
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
          self.finishPendingAnnouncement()
        }
        self.currentOwnerToken = nil
        continuation.resume(returning: ())
      }
    }
  }

  func announce(_ rawMessage: String, ownerToken rawOwnerToken: String) async {
    let message = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    let ownerToken = rawOwnerToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty, !ownerToken.isEmpty else {
      return
    }

    await withCheckedContinuation { continuation in
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
        self.finishPendingAnnouncement()
        continuation.resume(returning: ())
      }
    }
  }

  func interruptAll() async {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        self.interruptCurrentAnnouncement()
        self.finishPendingAnnouncement()
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

  func supersede(_ rawMessage: String, ownerToken rawOwnerToken: String) async {
    let message = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    let ownerToken = rawOwnerToken.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !ownerToken.isEmpty else {
      return
    }
    guard !message.isEmpty else {
      await cancel(ownerToken: ownerToken)
      return
    }

    await withCheckedContinuation { continuation in
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
    continuation: CheckedContinuation<Void, Never>
  ) {
    guard currentOwnerToken == ownerToken else {
      continuation.resume(returning: ())
      return
    }

    guard UIAccessibility.isVoiceOverRunning else {
      finishPendingAnnouncement()
      UIAccessibility.post(notification: .announcement, argument: message)
      continuation.resume(returning: ())
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

    takePendingAnnouncementContinuations().forEach { staleContinuation in
      staleContinuation.resume(returning: ())
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
      self?.finishPendingAnnouncement(identifier: identifier)
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
      deadline: .now() + Self.completionTimeout,
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

    finishPendingAnnouncement(identifier: identifier)
  }

  private func takePendingAnnouncementContinuations() -> [CheckedContinuation<Void, Never>] {
    guard let pendingAnnouncement else {
      return []
    }

    self.pendingAnnouncement = nil
    NotificationCenter.default.removeObserver(pendingAnnouncement.observer)
    pendingAnnouncement.timeoutWorkItem.cancel()
    return pendingAnnouncement.continuations
  }

  private func finishPendingAnnouncement(identifier: Int? = nil) {
    guard let pendingAnnouncement else {
      return
    }
    if let identifier, identifier != pendingAnnouncement.identifier {
      return
    }

    self.pendingAnnouncement = nil
    NotificationCenter.default.removeObserver(pendingAnnouncement.observer)
    pendingAnnouncement.timeoutWorkItem.cancel()
    pendingAnnouncement.continuations.forEach { continuation in
      continuation.resume(returning: ())
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

    AsyncFunction("announce") { (message: String, ownerToken: String) async in
      await announcementController.announce(message, ownerToken: ownerToken)
    }

    AsyncFunction("cancelAnnouncement") { (ownerToken: String) async in
      await announcementController.cancel(ownerToken: ownerToken)
    }

    AsyncFunction("interruptAllAnnouncements") {
      await announcementController.interruptAll()
    }

    AsyncFunction("supersedeAnnouncement") { (message: String, ownerToken: String) async in
      await announcementController.supersede(message, ownerToken: ownerToken)
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

    AsyncFunction("getState") {
      cameraController.stateDictionary()
    }
  }
}
