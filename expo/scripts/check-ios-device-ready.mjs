import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDeviceReadinessReport,
  parseDevicectlJson,
  probeCoreDeviceExecution,
  selectUniqueTargetDevice,
} from "./ios-device-readiness.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetName = process.env.GUIDEPUP_IOS_DEVICE_NAME || "charlie的iPhone";
const workspacePath = path.join(projectDir, "ios/GuidePupVisionAssistant.xcworkspace");
const scheme = "GuidePupVisionAssistant";
const outputJson = process.argv.includes("--json");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectDir,
    encoding: "utf8",
  });

  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}`,
    status: result.status,
  };
}

function exitWithBlockedJson(reason, details = {}) {
  console.log(JSON.stringify({
    device: {
      hardwareUdidSuffix: "not-found",
      identifierSuffix: "not-found",
      name: "not-found",
    },
    deviceReadiness: {
      ddiServicesAvailable: false,
      coreDeviceExecutionReady: false,
      coreDeviceProbe: {
        checkedAt: "not-run",
        exitStatus: null,
        outcome: "not-run",
        type: "devicectl-process-info",
      },
      developerModeEnabled: false,
      lastConnectionDate: "not-found",
      paired: false,
      result: "blocked",
      trusted: false,
      tunnelConnected: false,
      usbOrSameLan: false,
      xcodeDestinationAvailable: false,
      xctraceVisible: false,
    },
    privacy: {
      containsFullDeviceIds: false,
      identifierHandling: "suffix-only",
    },
    reason,
    targetName,
    ...details,
  }, null, 2));
  process.exit(1);
}

const devicectl = run("xcrun", ["devicectl", "list", "devices", "--json-output", "-"]);
if (!devicectl.ok) {
  if (outputJson) {
    exitWithBlockedJson("devicectl failed", {
      status: devicectl.status ?? "unknown",
    });
  }
  console.log("Guide Pup iPhone readiness check");
  console.log("");
  console.log(`Result: BLOCKED`);
  console.log(`- devicectl failed with status ${devicectl.status ?? "unknown"}.`);
  process.exit(1);
}

let selection;
try {
  selection = selectUniqueTargetDevice(parseDevicectlJson(devicectl.output), targetName);
} catch (error) {
  if (outputJson) {
    exitWithBlockedJson("devicectl JSON parse failed", {
      parseError: error instanceof Error ? error.message : "unknown parse error",
    });
  }
  console.log("Guide Pup iPhone readiness check");
  console.log("");
  console.log("Result: BLOCKED");
  console.log(
    `- Could not parse devicectl JSON: ${error instanceof Error ? error.message : "unknown parse error"}.`,
  );
  process.exit(1);
}

if (!selection.device) {
  if (outputJson) {
    exitWithBlockedJson(selection.reason);
  }
  console.log("Guide Pup iPhone readiness check");
  console.log("");
  console.log("Result: BLOCKED");
  console.log(`- ${selection.reason}.`);
  process.exit(1);
}

const device = selection.device;

const xctrace = run("xcrun", ["xctrace", "list", "devices"]);
const usb = run("system_profiler", ["SPUSBDataType"]);
const destinations = run("xcodebuild", [
  "-workspace",
  workspacePath,
  "-scheme",
  scheme,
  "-showdestinations",
]);
const coreDeviceProbe = probeCoreDeviceExecution({
  deviceIdentifier: device.identifier,
  projectDir,
});
const readinessReport = buildDeviceReadinessReport({
  coreDeviceProbe,
  destinationsOutput: destinations.output,
  device,
  devicectlOutput: devicectl.output,
  targetName,
  usbOutput: usb.output,
  xctraceOutput: xctrace.output,
});
const ready = readinessReport.deviceReadiness.result === "ready";

if (outputJson) {
  console.log(JSON.stringify(readinessReport, null, 2));
  process.exit(ready ? 0 : 1);
}

console.log("Guide Pup iPhone readiness check");
console.log("");
console.log(`Target: ${readinessReport.device.name}`);
console.log(`Result: ${ready ? "READY" : "BLOCKED"}`);
console.log(`- Device identifier suffix: ${readinessReport.device.identifierSuffix}`);
console.log(`- Hardware UDID suffix: ${readinessReport.device.hardwareUdidSuffix}`);
console.log(`- devicectl listed state: ${readinessReport.deviceReadiness.listedState}`);
console.log(`- Pairing state: ${readinessReport.deviceReadiness.paired ? "paired" : "not paired"}`);
console.log(`- Developer Mode: ${readinessReport.deviceReadiness.developerModeEnabled ? "enabled" : "not enabled"}`);
console.log(`- DDI services snapshot: ${readinessReport.deviceReadiness.ddiServicesAvailable ? "available" : "not available"}`);
console.log(`- Tunnel snapshot: ${readinessReport.deviceReadiness.tunnelConnected ? "connected" : "not connected"}`);
console.log(`- Last connection: ${readinessReport.deviceReadiness.lastConnectionDate}`);
console.log(`- USB or connected tunnel snapshot: ${readinessReport.deviceReadiness.usbOrSameLan ? "yes" : "no"}`);
console.log(`- xctrace visibility: ${readinessReport.deviceReadiness.xctraceVisible ? "yes" : "no"}`);
console.log(`- xcodebuild destination visibility: ${readinessReport.deviceReadiness.xcodeDestinationAvailable ? "yes" : "no"}`);
console.log(`- Active CoreDevice probe: ${readinessReport.deviceReadiness.coreDeviceProbe.outcome}`);

if (!ready) {
  console.log("");
  console.log("Next steps:");
  console.log("- Unlock the iPhone and keep Guide Pup's Mac and iPhone on the same LAN.");
  console.log("- Prefer a trusted USB cable for the first install/run if available.");
  console.log("- Confirm Developer Mode is enabled and respond to any trust prompts on the phone.");
  console.log("- Re-run this check before attempting the no-screen smoke.");
}

process.exit(ready ? 0 : 1);
