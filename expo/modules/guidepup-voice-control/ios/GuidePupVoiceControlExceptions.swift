import ExpoModulesCore

internal final class GuidePupSpeechRecognitionUnavailableException: Exception {
  override var reason: String {
    "Guide Pup voice control is unavailable on this device."
  }
}

internal final class GuidePupSpeechPermissionDeniedException: Exception {
  override var reason: String {
    "Guide Pup speech recognition permission is not granted."
  }
}

internal final class GuidePupMicrophonePermissionDeniedException: Exception {
  override var reason: String {
    "Guide Pup microphone permission is not granted."
  }
}

internal final class GuidePupVoiceSessionStartException: GenericException<String> {
  override var reason: String {
    param
  }
}
