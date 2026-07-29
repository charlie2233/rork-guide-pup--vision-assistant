import {
  createPrivateKey,
  sign,
} from "node:crypto";
import fs from "node:fs";

export const APP_STORE_CONNECT_CORRELATION_BASIS =
  "app-id-version-build-uploaded-date";

const APP_STORE_CONNECT_API_BASE_URL =
  "https://api.appstoreconnect.apple.com";
const SAFE_RESOURCE_ID_PATTERN = /^[A-Za-z0-9-]{1,128}$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function buildAppStoreConnectBuildUrl({
  appId,
  buildNumber,
}) {
  if (!SAFE_RESOURCE_ID_PATTERN.test(String(appId ?? ""))) {
    throw new Error("App Store Connect app ID is invalid.");
  }
  if (!isNonEmptyString(buildNumber)) {
    throw new Error("App Store Connect build number is required.");
  }
  const url = new URL("/v1/builds", APP_STORE_CONNECT_API_BASE_URL);
  url.searchParams.set("filter[app]", String(appId));
  url.searchParams.set("filter[version]", String(buildNumber));
  url.searchParams.set("include", "preReleaseVersion");
  url.searchParams.set(
    "fields[builds]",
    "version,uploadedDate,expired,processingState,preReleaseVersion",
  );
  url.searchParams.set(
    "fields[preReleaseVersions]",
    "version,platform",
  );
  url.searchParams.set("limit", "10");
  url.searchParams.set("sort", "-uploadedDate");
  return url.toString();
}

export function resolveAppStoreConnectApiToken({
  environment = process.env,
  fileSystem = fs,
  nowMs = Date.now(),
} = {}) {
  const suppliedToken =
    environment.APP_STORE_CONNECT_API_TOKEN?.trim();
  if (suppliedToken) {
    return suppliedToken;
  }

  const issuerId =
    environment.APP_STORE_CONNECT_API_ISSUER_ID?.trim();
  const keyId = environment.APP_STORE_CONNECT_API_KEY_ID?.trim();
  const privateKeyPath =
    environment.APP_STORE_CONNECT_API_PRIVATE_KEY_PATH?.trim();
  if (!issuerId || !keyId || !privateKeyPath) {
    throw new Error(
      "App Store Connect API authentication is missing. Provide a short-lived APP_STORE_CONNECT_API_TOKEN or issuer ID, key ID, and private-key path.",
    );
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(
      fileSystem.readFileSync(privateKeyPath, "utf8"),
    );
  } catch {
    throw new Error(
      "App Store Connect API private key could not be read.",
    );
  }
  const issuedAt = Math.floor(nowMs / 1000);
  const signingInput = [
    base64UrlJson({
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    }),
    base64UrlJson({
      aud: "appstoreconnect-v1",
      exp: issuedAt + 10 * 60,
      iat: issuedAt,
      iss: issuerId,
    }),
  ].join(".");
  const signature = sign(
    "sha256",
    Buffer.from(signingInput, "utf8"),
    {
      dsaEncoding: "ieee-p1363",
      key: privateKey,
    },
  ).toString("base64url");
  return `${signingInput}.${signature}`;
}

export function parseAppStoreConnectBuildResponse(
  response,
  {
    appId,
    buildNumber,
    marketingVersion,
  },
) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("App Store Connect build response is invalid.");
  }
  const builds = Array.isArray(response.data) ? response.data : [];
  const matchingBuilds = builds.filter((build) =>
    build?.type === "builds"
    && SAFE_RESOURCE_ID_PATTERN.test(build.id ?? "")
    && String(build.attributes?.version ?? "") === String(buildNumber)
    && build.attributes?.processingState === "VALID"
    && build.attributes?.expired === false
    && isIsoTimestamp(build.attributes?.uploadedDate),
  );
  if (matchingBuilds.length !== 1) {
    throw new Error(
      "App Store Connect must return exactly one unexpired VALID matching build.",
    );
  }

  const build = matchingBuilds[0];
  const preReleaseVersionLink =
    build.relationships?.preReleaseVersion?.data;
  const included = Array.isArray(response.included)
    ? response.included
    : [];
  const preReleaseVersion = included.find((resource) =>
    resource?.type === "preReleaseVersions"
    && resource.id === preReleaseVersionLink?.id,
  );
  if (
    !preReleaseVersion
    || preReleaseVersion.attributes?.version !== marketingVersion
    || preReleaseVersion.attributes?.platform !== "IOS"
  ) {
    throw new Error(
      "App Store Connect prerelease version does not match the expected iOS marketing version.",
    );
  }

  return {
    appId: String(appId),
    buildNumber: String(buildNumber),
    buildRecordIdentifier: build.id,
    correlationBasis: APP_STORE_CONNECT_CORRELATION_BASIS,
    expired: false,
    ipaDigestAvailable: false,
    marketingVersion,
    platform: "IOS",
    processingState: "VALID",
    source: "app-store-connect-api",
    uploadedAt: new Date(build.attributes.uploadedDate).toISOString(),
  };
}

export async function fetchAppStoreConnectBuildEvidence({
  appId,
  buildNumber,
  fetcher = globalThis.fetch,
  marketingVersion,
  token,
}) {
  if (!isNonEmptyString(token)) {
    throw new Error("App Store Connect API token is missing.");
  }
  if (typeof fetcher !== "function") {
    throw new Error("App Store Connect API fetch is unavailable.");
  }
  const response = await fetcher(
    buildAppStoreConnectBuildUrl({ appId, buildNumber }),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      method: "GET",
    },
  );
  if (!response?.ok) {
    throw new Error(
      `App Store Connect build lookup failed with HTTP ${response?.status ?? "unknown"}.`,
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("App Store Connect build response is not valid JSON.");
  }
  return parseAppStoreConnectBuildResponse(body, {
    appId,
    buildNumber,
    marketingVersion,
  });
}
