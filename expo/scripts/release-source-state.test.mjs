import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedGeneratedEvidencePath,
  parseGitStatusPorcelain,
  resolveReleaseSourceState,
  validateReleaseSourceEntries,
} from "./release-source-state.mjs";

const REVISION = "a".repeat(40);

test("parses tracked and untracked porcelain records", () => {
  assert.deepEqual(
    parseGitStatusPorcelain(" M expo/src/lib/api.ts\0?? expo/new-file.ts\0"),
    [
      { path: "expo/src/lib/api.ts", status: " M" },
      { path: "expo/new-file.ts", status: "??" },
    ],
  );
});

test("allows only enumerated evidence and final screenshot files", () => {
  const allowed = [
    "backend/guidepup-api/eval/smoke-results-staging.latest.json",
    "backend/guidepup-api/eval/smoke-results-staging.latest.md",
    "backend/guidepup-api/eval/smoke-results-production.latest.json",
    "backend/guidepup-api/eval/smoke-results-production.latest.md",
    "expo/release/no-screen-smoke.internal.latest.json",
    "expo/release/no-screen-smoke.blind-participant.latest.json",
    "expo/release/no-screen-smoke.testflight.latest.json",
    "expo/release/candidate-build.latest.json",
    "expo/release/ios-submission.latest.json",
    "expo/store-assets/screenshots/en-US/01-home.png",
    "expo/store-assets/screenshots/en-US/02-navigation.jpeg",
  ];
  const rejected = [
    "docs/release.md",
    "expo/src/lib/api.ts",
    "expo/package.json",
    "expo/release/ExportOptions.plist",
    "expo/release/unknown.json",
    "expo/store-assets/screenshots/README.md",
    "expo/store-assets/screenshots/../secret.png",
    "/tmp/screenshot.png",
  ];

  for (const filePath of allowed) {
    assert.equal(isAllowedGeneratedEvidencePath(filePath), true, filePath);
  }
  for (const filePath of rejected) {
    assert.equal(isAllowedGeneratedEvidencePath(filePath), false, filePath);
  }
});

test("rejects dirty tracked and untracked release source", () => {
  const result = validateReleaseSourceEntries(parseGitStatusPorcelain(
    " M expo/app.json\0?? expo/scripts/unknown.mjs\0",
  ));
  assert.equal(result.valid, false);
  assert.deepEqual(result.disallowed.map((entry) => entry.path), [
    "expo/app.json",
    "expo/scripts/unknown.mjs",
  ]);
});

test("resolves clean source with exact generated-evidence exceptions", () => {
  const commandRunner = (_command, args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      return { status: 0, stdout: "/repo\n", stderr: "" };
    }
    if (args[0] === "rev-parse") {
      return { status: 0, stdout: `${REVISION}\n`, stderr: "" };
    }
    return {
      status: 0,
      stdout: " M expo/release/candidate-build.latest.json\0?? expo/store-assets/screenshots/en-US/01.png\0",
      stderr: "",
    };
  };

  const state = resolveReleaseSourceState({ commandRunner, cwd: "/repo/expo" });
  assert.equal(state.sourceRevision, REVISION);
  assert.equal(state.allowedGeneratedChanges.length, 2);
});

test("hard-fails when an unknown path is dirty", () => {
  const commandRunner = (_command, args) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
      return { status: 0, stdout: "/repo\n", stderr: "" };
    }
    if (args[0] === "rev-parse") {
      return { status: 0, stdout: `${REVISION}\n`, stderr: "" };
    }
    return { status: 0, stdout: "?? expo/release/ExportOptions.plist\0", stderr: "" };
  };

  assert.throws(
    () => resolveReleaseSourceState({ commandRunner, cwd: "/repo" }),
    /dirty outside the generated-evidence allowlist.*ExportOptions\.plist/,
  );
});
