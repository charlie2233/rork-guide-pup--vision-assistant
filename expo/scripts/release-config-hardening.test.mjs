import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const plist = require("@expo/plist").default;
const ts = require("typescript");
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(projectDir, "..");
const { launchInputs } = require("../release/launch-inputs.js");

function loadRuntimeConfig(launchSentryMode, sentryDsn) {
  const sourcePath = path.join(projectDir, "src/lib/config.ts");
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const runtimeModule = { exports: {} };
  const runtimeRequire = (specifier) => {
    if (specifier === "expo-constants") {
      return {
        __esModule: true,
        default: { expoConfig: { extra: { launchSentryMode } } },
      };
    }
    return require(specifier);
  };

  vm.runInNewContext(compiled, {
    __DEV__: false,
    console,
    exports: runtimeModule.exports,
    module: runtimeModule,
    process: { env: { EXPO_PUBLIC_SENTRY_DSN: sentryDsn } },
    require: runtimeRequire,
  });
  return runtimeModule.exports.appConfig;
}

function copyTreeWithoutBuildArtifacts(source, destination) {
  const excluded = new Set([".expo", "build", "dist", "node_modules", "Pods"]);
  cpSync(source, destination, {
    recursive: true,
    filter(sourcePath) {
      const relative = path.relative(source, sourcePath);
      return !relative.split(path.sep).some((part) => excluded.has(part));
    },
  });
}

function replaceOnce(filePath, expected, replacement) {
  const source = readFileSync(filePath, "utf8");
  assert.ok(source.includes(expected), `Mutation target is missing in ${filePath}`);
  writeFileSync(filePath, source.replace(expected, replacement));
}

function mutatePbxShellScript(filePath, phaseName, transform) {
  const source = readFileSync(filePath, "utf8");
  const phaseToken = `/* ${phaseName} */`;
  const phaseStart = source.indexOf(phaseToken);
  assert.notEqual(phaseStart, -1, `PBX phase is missing: ${phaseName}`);
  const shellAssignment = source.slice(phaseStart).match(/^[ \t]*shellScript = ("(?:\\.|[^"\\])*");[ \t]*$/m);
  assert.ok(shellAssignment, `PBX shell script is missing: ${phaseName}`);
  const quotedScript = shellAssignment[1];
  const script = JSON.parse(quotedScript);
  const transformed = transform(script);
  assert.notEqual(transformed, script, `PBX shell script mutation made no change: ${phaseName}`);
  const assignmentIndex = phaseStart + shellAssignment.index;
  const quotedIndex = source.indexOf(quotedScript, assignmentIndex);
  assert.notEqual(quotedIndex, -1, `PBX shell script value cannot be located: ${phaseName}`);
  writeFileSync(
    filePath,
    `${source.slice(0, quotedIndex)}${JSON.stringify(transformed)}${source.slice(quotedIndex + quotedScript.length)}`,
  );
}

function runPreviewPreflight(expoDir, envOverrides = {}) {
  return spawnSync(process.execPath, ["scripts/release-preflight.mjs", "--track", "preview"], {
    cwd: expoDir,
    encoding: "utf8",
    env: { ...process.env, ...envOverrides },
  });
}

function createPreflightFixture(prefix) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), prefix));
  const fixtureExpo = path.join(fixtureRoot, "expo");
  copyTreeWithoutBuildArtifacts(projectDir, fixtureExpo);
  symlinkSync(path.join(projectDir, "node_modules"), path.join(fixtureExpo, "node_modules"), "dir");

  mkdirSync(path.join(fixtureRoot, "backend/guidepup-api"), { recursive: true });
  cpSync(
    path.join(repoDir, "backend/guidepup-api/eval"),
    path.join(fixtureRoot, "backend/guidepup-api/eval"),
    { recursive: true },
  );
  for (const page of ["privacy", "safety", "support"]) {
    mkdirSync(path.join(fixtureRoot, "site"), { recursive: true });
    cpSync(path.join(repoDir, "site", page), path.join(fixtureRoot, "site", page), { recursive: true });
  }

  return { fixtureExpo, fixtureRoot };
}

test("runtime Sentry DSN fails closed unless checked-in launch mode is enabled", () => {
  assert.equal(loadRuntimeConfig("disabled", "https://remote.invalid/123").sentryDsn, undefined);
  assert.equal(loadRuntimeConfig("unexpected", "https://remote.invalid/123").sentryDsn, undefined);
  assert.equal(loadRuntimeConfig("enabled", " https://enabled.example/123 ").sentryDsn, "https://enabled.example/123");
});

test("preview preflight is order-independent and rejects unsafe release mutations", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-config-");

  try {
    const privacyPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy");
    const privacyManifest = plist.parse(readFileSync(privacyPath, "utf8"));
    privacyManifest.NSPrivacyCollectedDataTypes.reverse();
    for (const entry of privacyManifest.NSPrivacyCollectedDataTypes) {
      entry.NSPrivacyCollectedDataTypePurposes.reverse();
    }
    writeFileSync(privacyPath, plist.build(privacyManifest));

    const baseline = runPreviewPreflight(fixtureExpo, {
      IOS_BUNDLE_IDENTIFIER: "bad.remote.bundle",
    });
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);

    const easPath = path.join(fixtureExpo, "eas.json");
    const eas = JSON.parse(readFileSync(easPath, "utf8"));
    eas.build.preview.env.EXPO_PUBLIC_SENTRY_DSN = "https://remote.invalid/123";
    writeFileSync(easPath, `${JSON.stringify(eas, null, 2)}\n`);

    const audioEntry = privacyManifest.NSPrivacyCollectedDataTypes.find(
      (entry) => entry.NSPrivacyCollectedDataType === "NSPrivacyCollectedDataTypeAudioData",
    );
    const photosEntry = privacyManifest.NSPrivacyCollectedDataTypes.find(
      (entry) => entry.NSPrivacyCollectedDataType === "NSPrivacyCollectedDataTypePhotosorVideos",
    );
    const interactionEntry = privacyManifest.NSPrivacyCollectedDataTypes.find(
      (entry) => entry.NSPrivacyCollectedDataType === "NSPrivacyCollectedDataTypeProductInteraction",
    );
    const environmentScanningEntry = privacyManifest.NSPrivacyCollectedDataTypes.find(
      (entry) => entry.NSPrivacyCollectedDataType === "NSPrivacyCollectedDataTypeEnvironmentScanning",
    );
    assert.ok(audioEntry && photosEntry && interactionEntry && environmentScanningEntry);
    audioEntry.NSPrivacyCollectedDataTypeLinked = false;
    photosEntry.NSPrivacyCollectedDataTypeTracking = true;
    interactionEntry.NSPrivacyCollectedDataTypePurposes = ["NSPrivacyCollectedDataTypePurposeAnalytics"];
    environmentScanningEntry.NSPrivacyCollectedDataTypeLinked = false;
    environmentScanningEntry.NSPrivacyCollectedDataTypeTracking = true;
    environmentScanningEntry.NSPrivacyCollectedDataTypePurposes = ["NSPrivacyCollectedDataTypePurposeAnalytics"];
    privacyManifest.NSPrivacyCollectedDataTypes = privacyManifest.NSPrivacyCollectedDataTypes.filter(
      (entry) => entry.NSPrivacyCollectedDataType !== "NSPrivacyCollectedDataTypeOtherDiagnosticData",
    );
    writeFileSync(privacyPath, plist.build(privacyManifest));

    const projectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
    replaceOnce(
      projectPath,
      `DEVELOPMENT_TEAM = ${launchInputs.appleTeamId};`,
      "DEVELOPMENT_TEAM = MUTATEDDEBUGTEAM;",
    );
    replaceOnce(
      projectPath,
      `DEVELOPMENT_TEAM = ${launchInputs.appleTeamId};`,
      "DEVELOPMENT_TEAM = MUTATEDRELEASETEAM;",
    );
    replaceOnce(
      projectPath,
      `PRODUCT_BUNDLE_IDENTIFIER = "${launchInputs.iosBundleIdentifier}";`,
      "PRODUCT_BUNDLE_IDENTIFIER = invalid.debug.bundle;",
    );
    replaceOnce(
      projectPath,
      `PRODUCT_BUNDLE_IDENTIFIER = "${launchInputs.iosBundleIdentifier}";`,
      "PRODUCT_BUNDLE_IDENTIFIER = invalid.release.bundle;",
    );
    replaceOnce(projectPath, "CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = DebugManual;");
    replaceOnce(projectPath, "CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = ReleaseManual;");
    replaceOnce(
      projectPath,
      `MARKETING_VERSION = ${launchInputs.iosMarketingVersion};`,
      "MARKETING_VERSION = 9.9.1;",
    );
    replaceOnce(
      projectPath,
      `MARKETING_VERSION = ${launchInputs.iosMarketingVersion};`,
      "MARKETING_VERSION = 9.9.2;",
    );
    replaceOnce(
      projectPath,
      `CURRENT_PROJECT_VERSION = ${launchInputs.iosBuildNumber};`,
      "CURRENT_PROJECT_VERSION = 901;",
    );
    replaceOnce(
      projectPath,
      `CURRENT_PROJECT_VERSION = ${launchInputs.iosBuildNumber};`,
      "CURRENT_PROJECT_VERSION = 902;",
    );
    replaceOnce(
      projectPath,
      '. \\"$SRCROOT/.xcode.env\\"',
      '# removed launch environment source',
    );
    const xcodeEnvPath = path.join(fixtureExpo, "ios/.xcode.env");
    replaceOnce(
      xcodeEnvPath,
      `GUIDE_PUP_DEFAULT_API_BASE_URL="${launchInputs.productionApiBaseUrl}"`,
      'GUIDE_PUP_DEFAULT_API_BASE_URL="https://invalid-production.example"',
    );
    replaceOnce(
      xcodeEnvPath,
      `GUIDE_PUP_DEFAULT_API_BASE_URL="${launchInputs.stagingApiBaseUrl}"`,
      'GUIDE_PUP_DEFAULT_API_BASE_URL="https://invalid-staging.example"',
    );
    const xcodeEnvLocalPath = path.join(fixtureExpo, "ios/.xcode.env.local");
    writeFileSync(
      xcodeEnvLocalPath,
      `${readFileSync(xcodeEnvLocalPath, "utf8")}\nif [ "\${BUNDLE_COMMAND:-}" = "export:embed" ]; then\n  OVERRIDE_KEY=EXPO_PUBLIC_SUPPORT_EMAIL\n  export "$OVERRIDE_KEY=wrong-local@example.com"\nfi\nif [ "\${EXPO_PUBLIC_RELEASE_TRACK:-}" = "testflight" ]; then\n  export EXPO_PUBLIC_API_BASE_URL=https://wrong-testflight.example\nfi\nif [ "\${EAS_BUILD_PROFILE:-}" = "store" ]; then\n  export EXPO_PUBLIC_SUPPORT_URL=https://wrong-store.example\nfi\nif [ "\${CI:-}" = "1" ] && [ "\${EAS_BUILD_RUNNER:-}" = "eas-build" ]; then\n  export EXPO_PUBLIC_PRIVACY_POLICY_URL=https://wrong-eas-runner.example\nfi\n`,
    );

    replaceOnce(
      path.join(fixtureExpo, "app.config.ts"),
      "launchSentryMode: launchInputs.sentryMode,",
      'launchSentryMode: "enabled",',
    );
    replaceOnce(
      path.join(fixtureExpo, "src/lib/config.ts"),
      'return mode === "enabled" ? trimToUndefined(value) : undefined;',
      "return trimToUndefined(value);",
    );

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(output, /preview EXPO_PUBLIC_SENTRY_DSN must be "", found "https:\/\/remote\.invalid\/123"/);
    assert.match(output, /Resolved Expo extra\.launchSentryMode must be "disabled", found "enabled"/);
    assert.match(output, /Runtime config must expose a Sentry DSN only when launchSentryMode is enabled/);
    assert.match(output, /Debug DEVELOPMENT_TEAM must be "K99RADPB9G", found "MUTATEDDEBUGTEAM"/);
    assert.match(output, /Release DEVELOPMENT_TEAM must be "K99RADPB9G", found "MUTATEDRELEASETEAM"/);
    assert.match(output, /Debug PRODUCT_BUNDLE_IDENTIFIER must be "app\.rork\.guide-pup-vision-assist"/);
    assert.match(output, /Release PRODUCT_BUNDLE_IDENTIFIER must be "app\.rork\.guide-pup-vision-assist"/);
    assert.match(output, /Debug CODE_SIGN_STYLE must be "Automatic", found "DebugManual"/);
    assert.match(output, /Release CODE_SIGN_STYLE must be "Automatic", found "ReleaseManual"/);
    assert.match(output, /Debug MARKETING_VERSION must be "1\.0\.0", found "9\.9\.1"/);
    assert.match(output, /Release MARKETING_VERSION must be "1\.0\.0", found "9\.9\.2"/);
    assert.match(
      output,
      new RegExp(`Debug CURRENT_PROJECT_VERSION must be "${launchInputs.iosBuildNumber}", found "901"`),
    );
    assert.match(
      output,
      new RegExp(`Release CURRENT_PROJECT_VERSION must be "${launchInputs.iosBuildNumber}", found "902"`),
    );
    assert.match(output, /Sentry upload phase must source the versioned \.xcode\.env/);
    assert.match(output, /Direct Xcode Debug EXPO_PUBLIC_API_BASE_URL must be .*found "https:\/\/invalid-staging\.example"/);
    assert.match(output, /Direct Xcode Release EXPO_PUBLIC_API_BASE_URL must be .*found "https:\/\/invalid-production\.example"/);
    assert.match(output, /Direct Xcode Debug support email must be .*found "wrong-local@example\.com"/);
    assert.match(output, /Direct Xcode Release support email must be .*found "wrong-local@example\.com"/);
    assert.match(output, /Direct Xcode EAS testflight effective EXPO_PUBLIC_API_BASE_URL must be .*found "https:\/\/wrong-testflight\.example"/);
    assert.match(output, /Direct Xcode EAS store effective EXPO_PUBLIC_SUPPORT_URL must be .*found "https:\/\/wrong-store\.example"/);
    assert.match(output, /Direct Xcode EAS preview effective EXPO_PUBLIC_PRIVACY_POLICY_URL must be .*found "https:\/\/wrong-eas-runner\.example"/);
    assert.match(output, /AudioData linked flag must be "true", found "false"/);
    assert.match(output, /PhotosorVideos tracking flag must be "false", found "true"/);
    assert.match(output, /ProductInteraction purposes must be exactly/);
    assert.match(output, /EnvironmentScanning linked flag must be "true", found "false"/);
    assert.match(output, /EnvironmentScanning tracking flag must be "false", found "true"/);
    assert.match(output, /EnvironmentScanning purposes must be exactly: NSPrivacyCollectedDataTypePurposeAppFunctionality/);
    assert.match(output, /must disclose NSPrivacyCollectedDataTypeOtherDiagnosticData/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight rejects an unreachable post-command local source", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-unreachable-");

  try {
    const baseline = runPreviewPreflight(fixtureExpo);
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);

    const projectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
    mutatePbxShellScript(projectPath, "Bundle React Native code and images", (script) => {
      const sourceLine = '  source "$PODS_ROOT/../.xcode.env.local"';
      const sourceIndex = script.lastIndexOf(sourceLine);
      assert.notEqual(sourceIndex, -1, "Final local source is missing from the bundle phase");
      const sourceBlocked = `${script.slice(0, sourceIndex)}  if false; then\n${sourceLine}\n  fi${script.slice(sourceIndex + sourceLine.length)}`;
      const lines = sourceBlocked.split(/\r?\n/);
      const wrapperIndex = lines.findIndex((line) => line.includes("react-native-xcode.sh") && line.trim().startsWith("/bin/sh"));
      assert.notEqual(wrapperIndex, -1, "Native bundler invocation is missing from the bundle phase");
      lines[wrapperIndex] = `if false; then\n${lines[wrapperIndex]}\nfi`;
      return lines.join("\n");
    });
    const xcodeEnvLocalPath = path.join(fixtureExpo, "ios/.xcode.env.local");
    writeFileSync(
      xcodeEnvLocalPath,
      `${readFileSync(xcodeEnvLocalPath, "utf8")}\nexport GUIDE_PUP_PROBE_LOCAL_SOURCE_COUNT=2\nexport GUIDE_PUP_PROBE_BUNDLE_WRAPPER_REACHED=true\n`,
    );

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(output, /Direct Xcode Debug local environment source count must be "2", found "1"/);
    assert.match(output, /Direct Xcode Debug bundle wrapper reachability must be "true", found "undefined"/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight rejects a comment-only bundler mention", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-wrapper-");

  try {
    const baseline = runPreviewPreflight(fixtureExpo);
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);

    const projectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
    mutatePbxShellScript(projectPath, "Bundle React Native code and images", (script) => {
      const lines = script.split(/\r?\n/);
      const wrapperIndex = lines.findIndex((line) => line.includes("react-native-xcode.sh") && line.trim().startsWith("/bin/sh"));
      assert.notEqual(wrapperIndex, -1, "Native bundler invocation is missing from the bundle phase");
      lines[wrapperIndex] = ": # react-native-xcode.sh";
      return lines.join("\n");
    });

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(output, /must contain exactly one canonical executable react-native-xcode\.sh invocation/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight rejects trailing commands on Expo bundle assignments", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-assignment-");

  try {
    const projectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
    mutatePbxShellScript(projectPath, "Bundle React Native code and images", (script) => {
      const lines = script.split(/\r?\n/);
      const entryIndex = lines.findIndex((line) => line.trim().startsWith('export ENTRY_FILE="$('));
      const cliIndex = lines.findIndex((line) => line.trim().startsWith('export CLI_PATH="$('));
      assert.notEqual(entryIndex, -1, "Expo ENTRY_FILE assignment is missing from the bundle phase");
      assert.notEqual(cliIndex, -1, "Expo CLI_PATH assignment is missing from the bundle phase");
      lines[entryIndex] += "; export EXPO_PUBLIC_API_BASE_URL=https://wrong-entry.example";
      lines[cliIndex] += "; export EXPO_PUBLIC_SUPPORT_URL=https://wrong-cli.example";
      return lines.join("\n");
    });

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(output, /must contain exactly one canonical Expo ENTRY_FILE assignment/);
    assert.match(output, /must contain exactly one canonical Expo CLI_PATH assignment/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight preserves resolved Expo tooling semantics in later environment sources", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-tooling-");

  try {
    const xcodeEnvUpdatesPath = path.join(fixtureExpo, "ios/.xcode.env.updates");
    writeFileSync(
      xcodeEnvUpdatesPath,
      `if [ "$(basename "$ENTRY_FILE")" = "entry.js" ] && [ "$(basename "$CLI_PATH")" = "cli" ]; then
  export EXPO_PUBLIC_API_BASE_URL=https://wrong-resolved-tooling.example
fi
`,
    );

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(
      output,
      /Direct Xcode Debug EXPO_PUBLIC_API_BASE_URL must be .*found "https:\/\/wrong-resolved-tooling\.example"/,
    );
    assert.match(
      output,
      /Direct Xcode Release EXPO_PUBLIC_API_BASE_URL must be .*found "https:\/\/wrong-resolved-tooling\.example"/,
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight resolves Expo tooling with the Node binary sourced by Xcode", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-node-binary-");

  try {
    const nodeWrapperPath = path.join(fixtureRoot, "node-wrapper.sh");
    writeFileSync(
      nodeWrapperPath,
      `#!/bin/sh
case "$2" in
  *resolveAppEntry*) printf '%s\\n' /tmp/sourced-node-entry.js ;;
  *require.resolve*) printf '%s\\n' /tmp/sourced-node-cli ;;
  *) exec ${JSON.stringify(process.execPath)} "$@" ;;
esac
`,
    );
    chmodSync(nodeWrapperPath, 0o755);

    const xcodeEnvLocalPath = path.join(fixtureExpo, "ios/.xcode.env.local");
    writeFileSync(xcodeEnvLocalPath, `export NODE_BINARY=${JSON.stringify(nodeWrapperPath)}\n`);
    writeFileSync(
      path.join(fixtureExpo, "ios/.xcode.env.updates"),
      `if [ "$(basename "$ENTRY_FILE")" = "sourced-node-entry.js" ] && [ "$(basename "$CLI_PATH")" = "sourced-node-cli" ]; then
  export EXPO_PUBLIC_SUPPORT_URL=https://wrong-sourced-node.example
fi
`,
    );

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(
      output,
      /Direct Xcode Debug support URL must be .*found "https:\/\/wrong-sourced-node\.example"/,
    );
    assert.match(
      output,
      /Direct Xcode Release support URL must be .*found "https:\/\/wrong-sourced-node\.example"/,
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight rejects Expo tooling assignments moved after the bundle wrapper", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-tooling-order-");

  try {
    const projectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
    mutatePbxShellScript(projectPath, "Bundle React Native code and images", (script) => {
      const lines = script.split(/\r?\n/);
      const entryIndex = lines.findIndex((line) => line.trim().startsWith('export ENTRY_FILE="$('));
      const cliIndex = lines.findIndex((line) => line.trim().startsWith('export CLI_PATH="$('));
      const wrapperIndex = lines.findIndex(
        (line) => line.includes("react-native-xcode.sh") && line.trim().startsWith("/bin/sh"),
      );
      assert.notEqual(entryIndex, -1, "Expo ENTRY_FILE assignment is missing from the bundle phase");
      assert.notEqual(cliIndex, -1, "Expo CLI_PATH assignment is missing from the bundle phase");
      assert.notEqual(wrapperIndex, -1, "Native bundler invocation is missing from the bundle phase");
      const entryAssignment = lines[entryIndex];
      const cliAssignment = lines[cliIndex];
      lines[entryIndex] = "  :";
      lines[cliIndex] = "  :";
      lines.splice(wrapperIndex + 1, 0, entryAssignment, cliAssignment);
      return lines.join("\n");
    });

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(output, /must resolve the Expo entry after launch defaults and before the Expo CLI/);
    assert.match(output, /must resolve the Expo CLI before selecting the bundle command/);
    assert.match(output, /Expo entry resolution before bundle wrapper must be "true", found "false"/);
    assert.match(output, /Expo CLI resolution before bundle wrapper must be "true", found "false"/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight rejects Expo tooling values unset before the bundle wrapper", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-tooling-unset-");

  try {
    writeFileSync(
      path.join(fixtureExpo, "ios/.xcode.env.updates"),
      "unset ENTRY_FILE CLI_PATH\n",
    );

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(output, /Expo entry resolution before bundle wrapper must be "true", found "false"/);
    assert.match(output, /Expo CLI resolution before bundle wrapper must be "true", found "false"/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight rejects a commented-out native environment source", () => {
  const { fixtureExpo, fixtureRoot } = createPreflightFixture("guidepup-release-source-");

  try {
    const baseline = runPreviewPreflight(fixtureExpo);
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);

    const projectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
    replaceOnce(
      projectPath,
      'source \\"$PODS_ROOT/../.xcode.env\\"',
      '# source \\"$PODS_ROOT/../.xcode.env\\"',
    );

    const mutated = runPreviewPreflight(fixtureExpo);
    const output = mutated.stdout + mutated.stderr;
    assert.equal(mutated.status, 1, output);
    assert.match(output, /React Native bundle phase must source ios\/\.xcode\.env before selecting Expo export:embed/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
