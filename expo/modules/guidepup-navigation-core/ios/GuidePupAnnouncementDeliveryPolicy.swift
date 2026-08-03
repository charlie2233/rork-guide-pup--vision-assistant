import Foundation

internal enum GuidePupAccessibilityAnnouncementError: Error, Equatable, LocalizedError {
  case cancelled
  case completionFailed
  case interrupted
  case ownershipChanged
  case ownershipReleased
  case superseded
  case timedOut
  case voiceOverUnavailable

  var errorDescription: String? {
    switch self {
    case .cancelled:
      return "VoiceOver announcement delivery was cancelled."
    case .completionFailed:
      return "VoiceOver reported that announcement delivery failed."
    case .interrupted:
      return "VoiceOver announcement delivery was interrupted."
    case .ownershipChanged:
      return "VoiceOver announcement ownership is no longer current."
    case .ownershipReleased:
      return "VoiceOver announcement ownership was released."
    case .superseded:
      return "VoiceOver announcement delivery was replaced by newer output."
    case .timedOut:
      return "VoiceOver announcement delivery timed out."
    case .voiceOverUnavailable:
      return "VoiceOver is no longer available for announcement delivery."
    }
  }
}

internal enum GuidePupAnnouncementDeliveryDisposition: Equatable {
  case cancelled
  case completed(success: Bool?)
  case interrupted
  case ownershipChanged
  case ownershipReleased
  case superseded
  case timedOut
  case voiceOverUnavailable
}

internal enum GuidePupAnnouncementDeliveryPolicy {
  private static let baseCompletionTimeout: TimeInterval = 8
  private static let maximumCompletionTimeout: TimeInterval = 120
  private static let minimumCompletionTimeout: TimeInterval = 15
  private static let wordCompletionSeconds: TimeInterval = 2.4

  static func completionTimeout(for message: String) -> TimeInterval {
    let trimmedMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)
    let wordCount = max(1, trimmedMessage.split(whereSeparator: \.isWhitespace).count)
    let estimatedSpeechTime = Double(wordCount) * wordCompletionSeconds
    return min(
      maximumCompletionTimeout,
      max(minimumCompletionTimeout, baseCompletionTimeout + estimatedSpeechTime)
    )
  }

  static func result(
    for disposition: GuidePupAnnouncementDeliveryDisposition
  ) -> Result<Void, GuidePupAccessibilityAnnouncementError> {
    switch disposition {
    case .completed(success: true):
      return .success(())
    case .completed:
      return .failure(.completionFailed)
    case .cancelled:
      return .failure(.cancelled)
    case .interrupted:
      return .failure(.interrupted)
    case .ownershipChanged:
      return .failure(.ownershipChanged)
    case .ownershipReleased:
      return .failure(.ownershipReleased)
    case .superseded:
      return .failure(.superseded)
    case .timedOut:
      return .failure(.timedOut)
    case .voiceOverUnavailable:
      return .failure(.voiceOverUnavailable)
    }
  }
}
