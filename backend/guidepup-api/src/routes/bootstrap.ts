import { jsonResponse } from "../lib/http";
import { logInfo } from "../lib/logging";
import { getPromptVersion } from "../lib/prompts";
import { getRateLimitPerMinute } from "../lib/rate-limit";
import { issueSessionToken } from "../lib/session";
import {
  BootstrapDeviceRequestSchema,
  BootstrapDeviceResponseSchema,
} from "../schemas/device";

export async function handleBootstrap(request: Request, env: Env, requestId: string) {
  const body = BootstrapDeviceRequestSchema.parse(await request.json());
  const deviceId = body.deviceId || crypto.randomUUID();
  const session = await issueSessionToken(deviceId, env);
  const response = BootstrapDeviceResponseSchema.parse({
    apiVersion: "v1",
    deviceId,
    expiresAt: session.expiresAt,
    issuedAt: session.issuedAt,
    promptVersion: getPromptVersion(env),
    rateLimitPerMinute: getRateLimitPerMinute(env),
    sessionToken: session.sessionToken,
  });

  logInfo("device.bootstrap", {
    appVersion: body.appVersion,
    deviceId,
    platform: body.platform || "unknown",
    requestId,
  });

  return jsonResponse(request, env, response);
}
