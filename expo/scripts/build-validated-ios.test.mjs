import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEasBuildArgs,
  PINNED_EAS_CLI_PACKAGE,
  runValidatedIosBuild,
} from "./build-validated-ios.mjs";

const REVISION = "a".repeat(40);

function cleanState(sourceRevision = REVISION) {
  return {
    allowedGeneratedChanges: [],
    repositoryRoot: "/repo",
    sourceRevision,
  };
}

test("validated build uses one exact noninteractive iOS profile", () => {
  assert.equal(PINNED_EAS_CLI_PACKAGE, "eas-cli@21.2.0");
  assert.deepEqual(buildEasBuildArgs("testflight").slice(0, 3), [
    "--yes",
    PINNED_EAS_CLI_PACKAGE,
    "build",
  ]);
  const calls = [];
  const states = [cleanState(), cleanState()];
  const result = runValidatedIosBuild({
    commandRunner(command, args) {
      calls.push({ args, command });
      return { status: 0 };
    },
    profile: "testflight",
    resolveSourceState: () => states.shift(),
  });
  assert.deepEqual(calls, [{
    args: buildEasBuildArgs("testflight"),
    command: "npx",
  }]);
  assert.deepEqual(result, {
    buildCompleted: true,
    profile: "testflight",
    sourceRevision: REVISION,
  });
});

test("validated build rejects dirty or changing source", () => {
  assert.throws(
    () =>
      runValidatedIosBuild({
        commandRunner() {
          throw new Error("build must not run");
        },
        profile: "store",
        resolveSourceState: () => ({
          ...cleanState(),
          allowedGeneratedChanges: [{ path: "evidence.json" }],
        }),
      }),
    /completely clean committed source snapshot/,
  );

  const states = [cleanState(), cleanState("b".repeat(40))];
  assert.throws(
    () =>
      runValidatedIosBuild({
        commandRunner() {
          return { status: 0 };
        },
        profile: "preview",
        resolveSourceState: () => states.shift(),
      }),
    /Source revision changed/,
  );
});

test("validated build rejects unsupported profiles and EAS failure", () => {
  assert.equal(
    buildEasBuildArgs("store-validation").includes("store-validation"),
    true,
  );
  assert.throws(
    () => buildEasBuildArgs("development"),
    /must be preview, testflight, store, or store-validation/,
  );
  assert.throws(
    () =>
      runValidatedIosBuild({
        commandRunner() {
          return { status: 1 };
        },
        profile: "testflight",
        resolveSourceState: () => cleanState(),
      }),
    /EAS iOS build failed/,
  );
});
