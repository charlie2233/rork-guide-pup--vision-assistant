import ExpoModulesCore

public final class GuidePupVoiceControlModule: Module {
  private let voiceController = GuidePupVoiceControlController()

  public func definition() -> ModuleDefinition {
    let controller = voiceController

    Name("GuidePupVoiceControl")

    Events("onCommandRecognized", "onStateChanged")

    OnCreate {
      controller.onRecognizedPhrase = { [weak self] payload in
        self?.emitRecognizedCommand(payload)
      }
      controller.onStateChanged = { [weak self] payload in
        self?.emitStateChanged(payload)
      }
    }

    AsyncFunction("isAvailable") {
      controller.isAvailable()
    }

    AsyncFunction("requestPermissions") { () -> [String: String] in
      await controller.requestPermissions()
    }

    AsyncFunction("startCommandSession") { (localeIdentifier: String?, partialResults: Bool?, ownerToken: String?) -> [String: Any] in
      return try await controller.startCommandSession(
        localeIdentifier: localeIdentifier,
        partialResults: partialResults ?? false,
        ownerToken: ownerToken
      )
    }

    AsyncFunction("stopCommandSession") { (ownerToken: String?) -> [String: Any] in
      await controller.stopCommandSession(ownerToken: ownerToken)
    }

    AsyncFunction("speak") { (text: String, localeIdentifier: String?, interrupt: Bool?, rate: Double?) in
      try await controller.speak(
        text: text,
        rate: rate,
        localeIdentifier: localeIdentifier,
        interrupt: interrupt ?? true
      )
    }

    AsyncFunction("stopSpeaking") {
      await controller.stopSpeaking()
    }

    AsyncFunction("getState") {
      controller.stateDictionary()
    }
  }

  private func emitRecognizedCommand(_ payload: [String: Any]) {
    sendEvent("onCommandRecognized", payload)
  }

  private func emitStateChanged(_ payload: [String: Any]) {
    sendEvent("onStateChanged", payload)
  }
}
