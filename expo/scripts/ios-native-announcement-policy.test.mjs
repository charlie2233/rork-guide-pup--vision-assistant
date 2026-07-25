import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const policyPath = fileURLToPath(new URL(
  "../modules/guidepup-navigation-core/ios/GuidePupAnnouncementDeliveryPolicy.swift",
  import.meta.url,
));
const testsPath = fileURLToPath(new URL(
  "./GuidePupAnnouncementDeliveryPolicyTests.swift",
  import.meta.url,
));

test("native VoiceOver delivery policy rejects every unconfirmed outcome and keeps long help bounded", {
  skip: process.platform !== "darwin" ? "Swift iOS policy validation requires macOS." : false,
}, () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "guidepup-announcement-policy-"));
  const executablePath = join(temporaryDirectory, "announcement-policy-tests");

  try {
    const compile = spawnSync(
      "xcrun",
      ["swiftc", policyPath, testsPath, "-o", executablePath],
      { encoding: "utf8" },
    );
    assert.equal(
      compile.status,
      0,
      `Swift announcement policy compilation failed.\n${compile.stdout}\n${compile.stderr}`,
    );

    const run = spawnSync(executablePath, [], { encoding: "utf8" });
    assert.equal(
      run.status,
      0,
      `Swift announcement policy validation failed.\n${run.stdout}\n${run.stderr}`,
    );
    assert.match(run.stdout, /announcement delivery policy: PASS/);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});
