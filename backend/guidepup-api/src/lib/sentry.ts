import { logWarn, sanitizeLogData, sanitizeLogMessage } from "./logging";

type ErrorContext = {
  requestId: string;
  route: string;
  [key: string]: unknown;
};

function parseSentryDsn(dsn: string) {
  const url = new URL(dsn);
  const projectId = url.pathname.split("/").filter(Boolean).pop();
  if (!projectId) {
    throw new Error("Invalid Sentry DSN.");
  }

  const basePath = url.pathname.replace(new RegExp(`/${projectId}$`), "");
  const ingestUrl = `${url.protocol}//${url.host}${basePath}/api/${projectId}/envelope/`;

  return {
    dsn,
    ingestUrl,
  };
}

function getReleaseMetadata(env: Env) {
  const fallbackRelease = env.PROMPT_VERSION
    ? `guidepup-api@${env.PROMPT_VERSION}`
    : `guidepup-api@${env.ENVIRONMENT || "development"}`;
  const envRecord = env as unknown as Record<string, string | undefined>;
  const release = envRecord.SENTRY_RELEASE?.trim() || fallbackRelease;
  const dist = envRecord.SENTRY_DIST?.trim() || env.PROMPT_VERSION || undefined;

  return {
    dist,
    environment: env.ENVIRONMENT || "development",
    release,
  };
}

export function reportBackendError(
  error: unknown,
  context: ErrorContext,
  env: Env,
  ctx: ExecutionContext,
) {
  if (!env.SENTRY_DSN) {
    return;
  }

  try {
    const { dsn, ingestUrl } = parseSentryDsn(env.SENTRY_DSN);
    const { dist, environment, release } = getReleaseMetadata(env);
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const message = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
    const extra = sanitizeLogData({
      ...context,
      environment,
    });
    const envelope = [
      JSON.stringify({ dsn, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({
        dist,
        environment,
        event_id: eventId,
        extra,
        level: "error",
        message: `[guidepup-api] ${message}`,
        platform: "javascript",
        release,
        request: {
          url: context.route,
        },
        sdk: {
          name: "guidepup-api",
          version: "1.0.0",
        },
        server_name: "cloudflare-worker",
        tags: {
          environment,
          promptVersion: env.PROMPT_VERSION,
          route: context.route,
          service: "guidepup-api",
        },
        timestamp: Math.floor(Date.now() / 1000),
        transaction: context.route,
      }),
    ].join("\n");

    ctx.waitUntil(
      fetch(ingestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
        },
        body: envelope,
      }),
    );
  } catch (sentryError) {
    logWarn("sentry.backend.report_failed", {
      message: sentryError instanceof Error ? sentryError.message : String(sentryError),
      requestId: context.requestId,
    });
  }
}
