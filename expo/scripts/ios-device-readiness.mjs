import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CORE_DEVICE_PROBE_TYPE = "devicectl-process-info";

export function suffix(value) {
  if (!value || typeof value !== "string") {
    return "not-found";
  }

  return value.length > 8 ? value.slice(-8) : value;
}

export function parseDevicectlJson(output) {
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

export function selectUniqueTargetDevice(devicectlPayload, targetName) {
  const devices = devicectlPayload?.result?.devices;
  if (!Array.isArray(devices)) {
    return { device: undefined, reason: "devicectl device list missing" };
  }

  const matches = devices.filter((device) => device?.deviceProperties?.name === targetName);
  if (matches.length === 0) {
    return { device: undefined, reason: "target device not found" };
  }
  if (matches.length > 1) {
    return { device: undefined, reason: "target device ambiguous" };
  }

  return { device: matches[0], reason: undefined };
}

function defaultProbeCommandRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "ignore",
    timeout: 35_000,
  });

  return {
    status: result.status,
    timedOut: result.error?.code === "ETIMEDOUT",
  };
}

export function probeCoreDeviceExecution(options) {
  const {
    commandRunner = defaultProbeCommandRunner,
    deviceIdentifier,
    fileSystem = fs,
    now = () => new Date(),
    projectDir,
    tempRoot = os.tmpdir(),
  } = options;
  const checkedAt = now().toISOString();
  let report = {
    checkedAt,
    coreDeviceExecutionReady: false,
    exitStatus: null,
    outcome: "not-run",
    type: CORE_DEVICE_PROBE_TYPE,
  };

  if (typeof deviceIdentifier !== "string" || deviceIdentifier.length === 0) {
    return { ...report, outcome: "missing-device-identifier" };
  }

  let tempDirectory;
  let cleanupSucceeded = true;
  try {
    tempDirectory = fileSystem.mkdtempSync(path.join(tempRoot, "guidepup-coredevice-"));
    const outputPath = path.join(tempDirectory, "processes.json");
    let commandResult;
    try {
      commandResult = commandRunner(
        "xcrun",
        [
          "devicectl",
          "device",
          "info",
          "processes",
          "--device",
          deviceIdentifier,
          "--timeout",
          "30",
          "--quiet",
          "--json-output",
          outputPath,
        ],
        { cwd: projectDir },
      );
    } catch {
      report = { ...report, outcome: "command-failed" };
    }

    if (commandResult) {
      report = {
        ...report,
        exitStatus: Number.isInteger(commandResult.status) ? commandResult.status : null,
      };
      if (commandResult.timedOut) {
        report = { ...report, outcome: "timeout" };
      } else if (commandResult.status !== 0) {
        report = { ...report, outcome: "command-failed" };
      } else if (!fileSystem.existsSync(outputPath)) {
        report = { ...report, outcome: "output-missing" };
      } else {
        let payload;
        try {
          payload = JSON.parse(fileSystem.readFileSync(outputPath, "utf8"));
        } catch {
          report = { ...report, outcome: "malformed-json" };
        }

        if (payload) {
          if (payload.info?.outcome !== "success") {
            report = { ...report, outcome: "unsuccessful-outcome" };
          } else if (
            payload.info?.commandType !== "devicectl.device.info.processes" ||
            !Array.isArray(payload.result?.runningProcesses)
          ) {
            report = { ...report, outcome: "invalid-result" };
          } else {
            report = {
              ...report,
              coreDeviceExecutionReady: true,
              outcome: "success",
            };
          }
        }
      }
    }
  } catch {
    report = { ...report, outcome: "probe-failed" };
  } finally {
    if (tempDirectory) {
      try {
        fileSystem.rmSync(tempDirectory, { force: true, recursive: true });
        cleanupSucceeded = !fileSystem.existsSync(tempDirectory);
      } catch {
        cleanupSucceeded = false;
      }
    }
  }

  if (!cleanupSucceeded) {
    return {
      ...report,
      coreDeviceExecutionReady: false,
      outcome: "cleanup-failed",
    };
  }
  return report;
}

export function buildDeviceReadinessReport(options) {
  const {
    coreDeviceProbe,
    destinationsOutput,
    device,
    devicectlOutput,
    targetName,
    usbOutput,
    xctraceOutput,
  } = options;
  const deviceName = device?.deviceProperties?.name || "not-found";
  const identifierSuffix = suffix(device?.identifier);
  const hardwareUdidSuffix = suffix(device?.hardwareProperties?.udid);
  const tableState = devicectlOutput
    .split("\n")
    .find((line) => deviceName !== "not-found" && line.includes(deviceName))
    ?.match(/\s(available|unavailable|connected|disconnected)(?:\s|$)/)?.[1];
  const pairingState = device?.connectionProperties?.pairingState || "unknown";
  const developerMode = device?.deviceProperties?.developerModeStatus || "unknown";
  const ddiServicesAvailable = device?.deviceProperties?.ddiServicesAvailable;
  const tunnelState = device?.connectionProperties?.tunnelState || "unknown";
  const lastConnectionDate = device?.connectionProperties?.lastConnectionDate || "not-found";
  const usbPresent = /iphone|apple mobile/i.test(usbOutput);
  const xctraceVisible = deviceName !== "not-found" && xctraceOutput.includes(deviceName);
  const xcodeDestinationVisible = deviceName !== "not-found" && destinationsOutput.includes(deviceName);
  const ready =
    pairingState === "paired" &&
    developerMode === "enabled" &&
    xctraceVisible &&
    xcodeDestinationVisible &&
    coreDeviceProbe?.coreDeviceExecutionReady === true;

  return {
    device: {
      hardwareUdidSuffix,
      identifierSuffix,
      name: deviceName,
    },
    deviceReadiness: {
      coreDeviceExecutionReady: coreDeviceProbe?.coreDeviceExecutionReady === true,
      coreDeviceProbe: {
        checkedAt: coreDeviceProbe?.checkedAt || "not-run",
        exitStatus: coreDeviceProbe?.exitStatus ?? null,
        outcome: coreDeviceProbe?.outcome || "not-run",
        type: coreDeviceProbe?.type || CORE_DEVICE_PROBE_TYPE,
      },
      ddiServicesAvailable: ddiServicesAvailable === true,
      developerModeEnabled: developerMode === "enabled",
      lastConnectionDate,
      listedState: tableState || device?.connectionProperties?.status || "unknown",
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
}
