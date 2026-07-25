import Foundation

@main
private enum GuidePupAnnouncementDeliveryPolicyTests {
  private static func expectFailure(
    _ disposition: GuidePupAnnouncementDeliveryDisposition,
    _ expectedFailure: GuidePupAccessibilityAnnouncementError
  ) {
    switch GuidePupAnnouncementDeliveryPolicy.result(for: disposition) {
    case .success:
      preconditionFailure("Expected \(expectedFailure), but delivery resolved successfully.")
    case .failure(let failure):
      precondition(failure == expectedFailure)
    }
  }

  static func main() {
    switch GuidePupAnnouncementDeliveryPolicy.result(for: .completed(success: true)) {
    case .success:
      break
    case .failure(let failure):
      preconditionFailure("Expected successful delivery, received \(failure).")
    }

    expectFailure(.completed(success: false), .completionFailed)
    expectFailure(.completed(success: nil), .completionFailed)
    expectFailure(.cancelled, .cancelled)
    expectFailure(.interrupted, .interrupted)
    expectFailure(.ownershipChanged, .ownershipChanged)
    expectFailure(.ownershipReleased, .ownershipReleased)
    expectFailure(.superseded, .superseded)
    expectFailure(.timedOut, .timedOut)
    expectFailure(.voiceOverUnavailable, .voiceOverUnavailable)

    let shortTimeout = GuidePupAnnouncementDeliveryPolicy.completionTimeout(for: "Stop.")
    precondition(shortTimeout == 15)

    let fullHelp = [
      "You can say start guidance, status, slower speech, faster speech, more detail,",
      "less detail, haptics on, haptics off, or help.",
      "Guide Pup only accepts this bounded command list for safety.",
    ].joined(separator: " ")
    let helpTimeout = GuidePupAnnouncementDeliveryPolicy.completionTimeout(for: fullHelp)
    let slowHelpDuration = Double(fullHelp.split(whereSeparator: \.isWhitespace).count) * 2.4
    precondition(helpTimeout > slowHelpDuration)
    precondition(helpTimeout <= 120)

    let boundedTimeout = GuidePupAnnouncementDeliveryPolicy.completionTimeout(
      for: String(repeating: "long announcement ", count: 200)
    )
    precondition(boundedTimeout == 120)

    print("GuidePup native announcement delivery policy: PASS")
  }
}
