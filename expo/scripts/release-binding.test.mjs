import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  computeGuidePupCandidateIdentifier,
  createGuidePupCandidateBinding,
  resolveGuidePupSourceRevision,
} = require("../release/release-binding.js");

const REVISION = "a".repeat(40);
const RELEASE_BINDING = {
  apiBaseUrl: "https://api.example.test",
  appEnv: "production",
  experimentalTabsEnabled: false,
  privacyPolicyUrl: "https://example.test/privacy",
  releaseTrack: "store",
  schemaVersion: 1,
  supportUrl: "https://example.test/support",
  websiteUrl: "https://example.test",
};

function withEnvironment(changes, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(changes)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("candidate identifier binds release configuration and source revision", () => {
  const input = {
    appVersion: "1.0.0",
    buildNumber: "4",
    bundleIdentifier: "app.rork.guide-pup-vision-assist",
    releaseBinding: RELEASE_BINDING,
    sourceRevision: REVISION,
    teamIdentifier: "K99RADPB9G",
  };

  const binding = createGuidePupCandidateBinding(input);
  assert.equal(binding.candidateIdentifier, computeGuidePupCandidateIdentifier(input));
  assert.equal(binding.sourceRevision, REVISION);
  assert.notEqual(
    binding.candidateIdentifier,
    computeGuidePupCandidateIdentifier({
      ...input,
      sourceRevision: "b".repeat(40),
    }),
  );
});

test("source revision accepts the trusted EAS commit hash", () => {
  withEnvironment(
    {
      EAS_BUILD: "true",
      EAS_BUILD_GIT_COMMIT_HASH: REVISION.toUpperCase(),
      GUIDE_PUP_SOURCE_REVISION: "b".repeat(40),
    },
    () => {
      assert.equal(
        resolveGuidePupSourceRevision({
          cwd: path.join(tmpdir(), "guidepup-missing-repository"),
          explicitRevision: "c".repeat(40),
        }),
        REVISION,
      );
    },
  );
});

test("source revision ignores ad hoc environment and argument overrides", () => {
  const emptyDirectory = mkdtempSync(path.join(tmpdir(), "guidepup-release-binding-"));
  try {
    withEnvironment(
      {
        EAS_BUILD_GIT_COMMIT_HASH: undefined,
        GUIDE_PUP_SOURCE_REVISION: "b".repeat(40),
      },
      () => {
        assert.throws(
          () =>
            resolveGuidePupSourceRevision({
              cwd: emptyDirectory,
              explicitRevision: "c".repeat(40),
            }),
          /require a readable local Git repository or EAS_BUILD=true/,
        );
      },
    );
  } finally {
    rmSync(emptyDirectory, { force: true, recursive: true });
  }
});

test("local source revision requires a clean Git working tree", () => {
  const repository = mkdtempSync(
    path.join(tmpdir(), "guidepup-release-binding-git-"),
  );
  try {
    execFileSync("git", ["init", "-q"], { cwd: repository });
    execFileSync("git", ["config", "user.email", "release-test@example.invalid"], {
      cwd: repository,
    });
    execFileSync("git", ["config", "user.name", "GuidePup Release Test"], {
      cwd: repository,
    });
    const trackedPath = path.join(repository, "tracked.txt");
    writeFileSync(trackedPath, "clean\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd: repository });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: repository });
    const revision = execFileSync(
      "git",
      ["rev-parse", "--verify", "HEAD"],
      { cwd: repository, encoding: "utf8" },
    ).trim();

    withEnvironment(
      {
        EAS_BUILD: "true",
        EAS_BUILD_GIT_COMMIT_HASH: "b".repeat(40),
      },
      () => assert.equal(resolveGuidePupSourceRevision({ cwd: repository }), revision),
    );

    writeFileSync(trackedPath, `${readFileSync(trackedPath, "utf8")}dirty\n`);
    assert.throws(
      () =>
        withEnvironment(
          {
            EAS_BUILD: "true",
            EAS_BUILD_GIT_COMMIT_HASH: "b".repeat(40),
          },
          () => resolveGuidePupSourceRevision({ cwd: repository }),
        ),
      /clean Git working tree/,
    );
    writeFileSync(trackedPath, "clean\n");
    writeFileSync(path.join(repository, "untracked.txt"), "untracked\n");
    assert.throws(
      () =>
        withEnvironment(
          {
            EAS_BUILD: "true",
            EAS_BUILD_GIT_COMMIT_HASH: "b".repeat(40),
          },
          () => resolveGuidePupSourceRevision({ cwd: repository }),
        ),
      /clean Git working tree/,
    );
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("EAS revision cannot bypass unreadable local Git metadata", () => {
  const repository = mkdtempSync(
    path.join(tmpdir(), "guidepup-release-binding-corrupt-git-"),
  );
  try {
    writeFileSync(path.join(repository, ".git"), "not valid worktree metadata\n");
    assert.throws(
      () =>
        withEnvironment(
          {
            EAS_BUILD: "true",
            EAS_BUILD_GIT_COMMIT_HASH: REVISION,
          },
          () => resolveGuidePupSourceRevision({ cwd: repository }),
        ),
      /require readable Git metadata/,
    );
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("Git-free fallback rejects a spoofed EAS commit outside EAS Build", () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "guidepup-release-binding-not-eas-"),
  );
  try {
    assert.throws(
      () =>
        withEnvironment(
          {
            EAS_BUILD: undefined,
            EAS_BUILD_GIT_COMMIT_HASH: REVISION,
          },
          () => resolveGuidePupSourceRevision({ cwd: directory }),
        ),
      /EAS_BUILD=true with EAS_BUILD_GIT_COMMIT_HASH/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("EAS requires a committed source snapshot", () => {
  const easJson = JSON.parse(
    readFileSync(new URL("../eas.json", import.meta.url), "utf8"),
  );
  assert.equal(easJson.cli?.requireCommit, true);
});
