import { logWarn } from "./logging";

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
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const message = error instanceof Error ? error.message : String(error);
    const envelope = [
      JSON.stringify({ dsn, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({
        environment: env.ENVIRONMENT || "development",
        event_id: eventId,
        extra: context,
        level: "error",
        message: `[guidepup-api] ${message}`,
        platform: "javascript",
        request: {
          url: context.route,
        },
        sdk: {
          name: "guidepup-api",
          version: "1.0.0",
        },
        server_name: "cloudflare-worker",
        tags: {
          service: "guidepup-api",
        },
        timestamp: Math.floor(Date.now() / 1000),
      }),
    ].join("\n");

    ctx.waitUntil(fetch(ingestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
      },
      body: envelope,
    }));
  } catch (sentryError) {
    logWarn("sentry.backend.report_failed", {
      message: sentryError instanceof Error ? sentryError.message : String(sentryError),
      requestId: context.requestId,
    });
  }
}
