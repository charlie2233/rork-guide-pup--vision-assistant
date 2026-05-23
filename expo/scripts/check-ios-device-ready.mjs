import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function parseDevicectlJson(output) {
  const jsonStart = output.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("devicectl did not return JSON output.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = jsonStart; index < output.length; index += 1) {
    const char = output[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(output.slice(jsonStart, index + 1));
      }
    }
  }

  throw new Error("devicectl JSON output was incomplete.");
}

function suffix(value) {
  if (!value || typeof value !== "string") {
    return "not-found";
  }

  return value.length > 8 ? value.slice(-8) : value;
}

function findTargetDevice(devicectlPayload) {
  const devices = devicectlPayload?.result?.devices;
  if (!Array.isArray(devices)) {
    return undefined;
  }

  return devices.find((device) => device?.deviceProperties?.name === targetName)
    || devices.find((device) => device?.hardwareProperties?.deviceType === "iPhone");
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

let device;
try {
  device = findTargetDevice(parseDevicectlJson(devicectl.output));
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

const xctrace = run("xcrun", ["xctrace", "list", "devices"]);
const usb = run("system_profiler", ["SPUSBDataType"]);
const destinations = run("xcodebuild", [
  "-workspace",
  workspacePath,
  "-scheme",
  scheme,
  "-showdestinations",
]);

const deviceName = device?.deviceProperties?.name || "not-found";
const identifierSuffix = suffix(device?.identifier);
const udidSuffix = suffix(device?.hardwareProperties?.udid);
const tableState = devicectl.output
  .split("\n")
  .find((line) => deviceName !== "not-found" && line.includes(deviceName))
  ?.match(/\s(available|unavailable|connected|disconnected)(?:\s|$)/)?.[1];
const pairingState = device?.connectionProperties?.pairingState || "unknown";
const developerMode = device?.deviceProperties?.developerModeStatus || "unknown";
const ddiServicesAvailable = device?.deviceProperties?.ddiServicesAvailable;
const tunnelState = device?.connectionProperties?.tunnelState || "unknown";
const inferredState =
  ddiServicesAvailable === false || tunnelState === "unavailable" ? "unavailable" : "unknown";
const state = tableState || device?.connectionProperties?.status || inferredState;
const lastConnectionDate = device?.connectionProperties?.lastConnectionDate || "not-found";
const usbPresent = /iphone|apple mobile/i.test(usb.output);
const xctraceVisible = deviceName !== "not-found" && xctrace.output.includes(deviceName);
const xcodeDestinationVisible = deviceName !== "not-found" && destinations.output.includes(deviceName);
const executionVisible =
  ddiServicesAvailable === true &&
  tunnelState === "connected" &&
  xctraceVisible &&
  xcodeDestinationVisible;
const stateSupportsExecution =
  state === "available" ||
  state === "connected" ||
  (state === "unknown" && executionVisible);

const ready =
  stateSupportsExecution &&
  pairingState === "paired" &&
  developerMode === "enabled" &&
  ddiServicesAvailable === true &&
  xctraceVisible &&
  xcodeDestinationVisible;

const readinessReport = {
  device: {
    hardwareUdidSuffix: udidSuffix,
    identifierSuffix,
    name: deviceName,
  },
  deviceReadiness: {
    ddiServicesAvailable: ddiServicesAvailable === true,
    developerModeEnabled: developerMode === "enabled",
    lastConnectionDate,
    paired: pairingState === "paired",
    result: ready ? "ready" : "blocked",
    trusted: pairingState === "paired",
    tunnelConnected: tunnelState === "connected",
    usbOrSameLan: usbPresent || tunnelState === "connected",
    xcodeDestinationAvailable: xcodeDestinationVisible,
    xctraceVisible,
  },
  privacy: {
    containsFullDeviceIds: false,
    identifierHandling: "suffix-only",
  },
  targetName,
};

if (outputJson) {
  console.log(JSON.stringify(readinessReport, null, 2));
  process.exit(ready ? 0 : 1);
}

console.log("Guide Pup iPhone readiness check");
console.log("");
console.log(`Target: ${deviceName}`);
console.log(`Result: ${ready ? "READY" : "BLOCKED"}`);
console.log(`- Device identifier suffix: ${identifierSuffix}`);
console.log(`- Hardware UDID suffix: ${udidSuffix}`);
console.log(`- devicectl state: ${state}`);
console.log(`- Pairing state: ${pairingState}`);
console.log(`- Developer Mode: ${developerMode}`);
console.log(`- DDI services available: ${typeof ddiServicesAvailable === "boolean" ? String(ddiServicesAvailable) : "unknown"}`);
console.log(`- Tunnel state: ${tunnelState}`);
console.log(`- Last connection: ${lastConnectionDate}`);
console.log(`- USB iPhone present: ${usbPresent ? "yes" : "no"}`);
console.log(`- xctrace visibility: ${xctraceVisible ? "yes" : "no"}`);
console.log(`- xcodebuild destination visibility: ${xcodeDestinationVisible ? "yes" : "no"}`);

if (!ready) {
  console.log("");
  console.log("Next steps:");
  console.log("- Unlock the iPhone and keep Guide Pup's Mac and iPhone on the same LAN.");
  console.log("- Prefer a trusted USB cable for the first install/run if available.");
  console.log("- Confirm Developer Mode is enabled and respond to any trust prompts on the phone.");
  console.log("- Re-run this check before attempting the no-screen smoke.");
}

process.exit(ready ? 0 : 1);
