import { spawnSync } from "node:child_process";

const REQUIRED_SECRETS = [
  "BOOTSTRAP_SIGNING_SECRET",
  "OPENAI_API_KEY",
];

function parseArgs(argv) {
  const args = {
    env: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") {
      args.env = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--env=")) {
      args.env = arg.slice("--env=".length);
    }
  }

  return args;
}

function fail(message, details) {
  const output = [message, details].filter(Boolean).join("\n\n");
  console.error(output);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.env) {
    fail("Missing --env. Use --env staging or --env production.");
  }

  const command = spawnSync("npx", ["wrangler", "secret", "list", "--env", args.env], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });

  if (command.status !== 0) {
    fail(
      `Unable to verify required Cloudflare secrets for ${args.env}.`,
      (command.stderr || command.stdout || "").trim() || `wrangler secret list exited with status ${command.status ?? "unknown"}.`,
    );
  }

  let listedSecrets;
  try {
    listedSecrets = JSON.parse(command.stdout || "[]");
  } catch (error) {
    fail(
      `Unable to parse Cloudflare secret list for ${args.env}.`,
      error instanceof Error ? error.message : String(error),
    );
  }

  const secretNames = new Set(
    Array.isArray(listedSecrets)
      ? listedSecrets
          .map((entry) => (entry && typeof entry === "object" ? entry.name : undefined))
          .filter((value) => typeof value === "string")
      : [],
  );

  const missingSecrets = REQUIRED_SECRETS.filter((name) => !secretNames.has(name));
  if (missingSecrets.length > 0) {
    fail(
      `Missing required Cloudflare secrets for ${args.env}: ${missingSecrets.join(", ")}.`,
      "Set them with Wrangler secret management before running check or deploy.",
    );
  }

  console.log(`Verified required Cloudflare secrets for ${args.env}: ${REQUIRED_SECRETS.join(", ")}`);
}

main();
