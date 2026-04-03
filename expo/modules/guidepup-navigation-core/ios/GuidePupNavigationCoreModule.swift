import ExpoModulesCore
import UIKit

public final class GuidePupNavigationCoreModule: Module {
  private let cameraController = GuidePupCameraSessionController()

  public func definition() -> ModuleDefinition {
    Name("GuidePupNavigationCore")

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

    AsyncFunction("announce") { (message: String) in
      UIAccessibility.post(notification: .announcement, argument: message)
    }
    .runOnQueue(.main)

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

    AsyncFunction("getState") {
      cameraController.stateDictionary()
    }
  }
}
