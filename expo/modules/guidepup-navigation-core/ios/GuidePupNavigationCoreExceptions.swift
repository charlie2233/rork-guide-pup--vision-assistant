import ExpoModulesCore

internal final class GuidePupCameraUnavailableException: Exception {
  override var reason: String {
    "Guide Pup could not access a back camera on this device."
  }
}

internal final class GuidePupPermissionDeniedException: Exception {
  override var reason: String {
    "Guide Pup camera permission is not granted."
  }
}

internal final class GuidePupSessionNotRunningException: Exception {
  override var reason: String {
    "Guide Pup camera session is not running."
  }
}

internal final class GuidePupFrameUnavailableException: Exception {
  override var reason: String {
    "Guide Pup could not capture a usable camera frame."
  }
}

internal final class GuidePupFrameEncodingException: Exception {
  override var reason: String {
    "Guide Pup could not encode a camera frame."
  }
}

internal final class GuidePupSessionConfigurationException: GenericException<String> {
  override var reason: String {
    param
  }
}
