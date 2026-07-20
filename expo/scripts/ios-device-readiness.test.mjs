import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildDeviceReadinessReport,
  parseDevicectlJson,
  probeCoreDeviceExecution,
  selectUniqueTargetDevice,
} from "./ios-device-readiness.mjs";

const FULL_DEVICE_IDENTIFIER = "INTERNAL-CORE-DEVICE-IDENTIFIER-12345678";
const FULL_HARDWARE_UDID = "INTERNAL-HARDWARE-UDID-ABCDEFGH";
const TARGET_NAME = "charlie's iPhone";

function makeDevice(overrides = {}) {
  return {
    connectionProperties: {
      lastConnectionDate: "2026-07-20T00:00:00Z",
      pairingState: "paired",
      status: "available",
      tunnelState: "connected",
      ...overrides.connectionProperties,
    },
    deviceProperties: {
      ddiServicesAvailable: true,
      developerModeStatus: "enabled",
      name: TARGET_NAME,
      ...overrides.deviceProperties,
    },
    hardwareProperties: {
      deviceType: "iPhone",
      udid: FULL_HARDWARE_UDID,
      ...overrides.hardwareProperties,
    },
    identifier: overrides.identifier ?? FULL_DEVICE_IDENTIFIER,
  };
}

function successfulProbe(overrides = {}) {
  return {
    checkedAt: "2026-07-20T00:00:00.000Z",
    coreDeviceExecutionReady: true,
    exitStatus: 0,
    outcome: "success",
    type: "devicectl-process-info",
    ...overrides,
  };
}

function makeReport(overrides = {}) {
  const device = overrides.device || makeDevice();
  return buildDeviceReadinessReport({
    coreDeviceProbe: overrides.coreDeviceProbe || successfulProbe(),
    destinationsOutput: overrides.destinationsOutput ?? `platform:iOS, name:${TARGET_NAME}`,
    device,
    devicectlOutput: overrides.devicectlOutput ?? `${TARGET_NAME} available`,
    targetName: TARGET_NAME,
    usbOutput: overrides.usbOutput ?? "iPhone USB",
    xctraceOutput: overrides.xctraceOutput ?? TARGET_NAME,
  });
}

function runProbeFixture(payload, options = {}) {
  let outputPath;
  const commandRunner = (_command, args) => {
    outputPath = args[args.indexOf("--json-output") + 1];
    if (options.writeOutput !== false) {
      fs.writeFileSync(outputPath, typeof payload === "string" ? payload : JSON.stringify(payload));
    }
    return {
      status: options.status ?? 0,
      timedOut: options.timedOut ?? false,
    };
  };
  const report = probeCoreDeviceExecution({
    commandRunner,
    deviceIdentifier: FULL_DEVICE_IDENTIFIER,
    now: () => new Date("2026-07-20T00:00:00.000Z"),
    tempRoot: os.tmpdir(),
  });
  return { outputPath, report };
}

test("parses JSON embedded in devicectl output", () => {
  const payload = { result: { devices: [makeDevice()] } };
  assert.deepEqual(parseDevicectlJson(`notice\n${JSON.stringify(payload)}\ntrailer`), payload);
});

test("selects only one exact target and never falls back to another iPhone", () => {
  const otherPhone = makeDevice({ deviceProperties: { name: "Other iPhone" } });
  assert.equal(
    selectUniqueTargetDevice({ result: { devices: [otherPhone] } }, TARGET_NAME).reason,
    "target device not found",
  );

  const duplicate = makeDevice({ identifier: "duplicate" });
  assert.equal(
    selectUniqueTargetDevice({ result: { devices: [makeDevice(), duplicate] } }, TARGET_NAME).reason,
    "target device ambiguous",
  );
});

test("a successful active probe overrides disconnected DDI and tunnel snapshots", () => {
  const report = makeReport({
    device: makeDevice({
      connectionProperties: { tunnelState: "disconnected" },
      deviceProperties: { ddiServicesAvailable: false },
    }),
    usbOutput: "",
  });

  assert.equal(report.deviceReadiness.result, "ready");
  assert.equal(report.deviceReadiness.coreDeviceExecutionReady, true);
  assert.equal(report.deviceReadiness.ddiServicesAvailable, false);
  assert.equal(report.deviceReadiness.tunnelConnected, false);
  assert.equal(report.deviceReadiness.usbOrSameLan, false);
});

test("stale positive snapshots cannot override a failed active probe", () => {
  const report = makeReport({
    coreDeviceProbe: successfulProbe({
      coreDeviceExecutionReady: false,
      exitStatus: 1,
      outcome: "command-failed",
    }),
  });

  assert.equal(report.deviceReadiness.ddiServicesAvailable, true);
  assert.equal(report.deviceReadiness.tunnelConnected, true);
  assert.equal(report.deviceReadiness.result, "blocked");
});

for (const [name, overrides] of [
  ["unpaired device", { device: makeDevice({ connectionProperties: { pairingState: "unpaired" } }) }],
  ["disabled Developer Mode", { device: makeDevice({ deviceProperties: { developerModeStatus: "disabled" } }) }],
  ["missing xctrace visibility", { xctraceOutput: "" }],
  ["missing Xcode destination", { destinationsOutput: "" }],
]) {
  test(`${name} remains blocked even when the active probe succeeds`, () => {
    assert.equal(makeReport(overrides).deviceReadiness.result, "blocked");
  });
}

test("active probe accepts only a structured successful process result and sanitizes it", () => {
  const { outputPath, report } = runProbeFixture({
    info: {
      arguments: ["--device", FULL_DEVICE_IDENTIFIER],
      commandType: "devicectl.device.info.processes",
      outcome: "success",
    },
    result: {
      deviceIdentifier: FULL_DEVICE_IDENTIFIER,
      runningProcesses: [{ name: "Sensitive Process Name", processIdentifier: 42 }],
    },
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.coreDeviceExecutionReady, true);
  assert.equal(report.outcome, "success");
  assert.equal(fs.existsSync(path.dirname(outputPath)), false);
  assert.equal(serialized.includes(FULL_DEVICE_IDENTIFIER), false);
  assert.equal(serialized.includes("Sensitive Process Name"), false);
  assert.equal(serialized.includes(outputPath), false);
});

for (const [name, payload, options, expectedOutcome] of [
  ["timeout", undefined, { timedOut: true, writeOutput: false }, "timeout"],
  ["nonzero exit", undefined, { status: 1, writeOutput: false }, "command-failed"],
  ["missing output", undefined, { writeOutput: false }, "output-missing"],
  ["malformed JSON", "not-json", {}, "malformed-json"],
  [
    "unsuccessful outcome",
    { info: { commandType: "devicectl.device.info.processes", outcome: "failure" }, result: {} },
    {},
    "unsuccessful-outcome",
  ],
  [
    "invalid structured result",
    { info: { commandType: "devicectl.device.info.processes", outcome: "success" }, result: {} },
    {},
    "invalid-result",
  ],
]) {
  test(`active probe blocks ${name} and cleans temporary output`, () => {
    const { outputPath, report } = runProbeFixture(payload, options);
    assert.equal(report.coreDeviceExecutionReady, false);
    assert.equal(report.outcome, expectedOutcome);
    assert.equal(fs.existsSync(path.dirname(outputPath)), false);
  });
}

test("readiness report exposes suffixes only", () => {
  const serialized = JSON.stringify(makeReport());
  assert.equal(serialized.includes(FULL_DEVICE_IDENTIFIER), false);
  assert.equal(serialized.includes(FULL_HARDWARE_UDID), false);
  assert.match(serialized, /12345678/);
  assert.match(serialized, /ABCDEFGH/);
});
