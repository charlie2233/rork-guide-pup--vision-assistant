import assert from "node:assert/strict";
import {
  generateKeyPairSync,
} from "node:crypto";
import test from "node:test";
import {
  buildAppStoreConnectBuildUrl,
  fetchAppStoreConnectBuildEvidence,
  parseAppStoreConnectBuildResponse,
  resolveAppStoreConnectApiToken,
} from "./app-store-connect-build-evidence.mjs";

const EXPECTED = {
  appId: "6756947790",
  buildNumber: "4",
  marketingVersion: "1.0.0",
};

function buildResponse(overrides = {}) {
  const build = {
    attributes: {
      expired: false,
      processingState: "VALID",
      uploadedDate: "2026-07-25T20:00:00.000Z",
      version: EXPECTED.buildNumber,
    },
    id: "asc-build-record-4",
    relationships: {
      preReleaseVersion: {
        data: {
          id: "prerelease-version-1",
          type: "preReleaseVersions",
        },
      },
    },
    type: "builds",
  };
  Object.assign(build.attributes, overrides.attributes);
  Object.assign(build, overrides.build);
  return {
    data: overrides.data ?? [build],
    included: overrides.included ?? [{
      attributes: {
        platform: "IOS",
        version: EXPECTED.marketingVersion,
      },
      id: "prerelease-version-1",
      type: "preReleaseVersions",
    }],
  };
}

test("parses one authenticated VALID App Store Connect build", () => {
  assert.deepEqual(
    parseAppStoreConnectBuildResponse(buildResponse(), EXPECTED),
    {
      appId: EXPECTED.appId,
      buildNumber: EXPECTED.buildNumber,
      buildRecordIdentifier: "asc-build-record-4",
      correlationBasis: "app-id-version-build-uploaded-date",
      expired: false,
      ipaDigestAvailable: false,
      marketingVersion: EXPECTED.marketingVersion,
      platform: "IOS",
      processingState: "VALID",
      source: "app-store-connect-api",
      uploadedAt: "2026-07-25T20:00:00.000Z",
    },
  );
});

test("rejects absent, duplicate, failed, expired, and wrong-version builds", () => {
  for (const response of [
    buildResponse({ data: [] }),
    buildResponse({ data: buildResponse().data.concat(buildResponse().data) }),
    buildResponse({ attributes: { processingState: "FAILED" } }),
    buildResponse({ attributes: { expired: true } }),
    buildResponse({ attributes: { version: "5" } }),
    buildResponse({
      included: [{
        attributes: { platform: "IOS", version: "1.0.1" },
        id: "prerelease-version-1",
        type: "preReleaseVersions",
      }],
    }),
  ]) {
    assert.throws(
      () => parseAppStoreConnectBuildResponse(response, EXPECTED),
      /matching build|prerelease version/,
    );
  }
});

test("build lookup sends the token without returning or logging it", async () => {
  const token = "header.payload.signature";
  const calls = [];
  const evidence = await fetchAppStoreConnectBuildEvidence({
    ...EXPECTED,
    async fetcher(url, init) {
      calls.push({ init, url });
      return {
        json: async () => buildResponse(),
        ok: true,
        status: 200,
      };
    },
    token,
  });
  assert.equal(evidence.buildRecordIdentifier, "asc-build-record-4");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(JSON.stringify(evidence), /header\.payload\.signature/);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("filter[app]"), EXPECTED.appId);
  assert.equal(
    url.searchParams.get("filter[version]"),
    EXPECTED.buildNumber,
  );
});

test("creates a bounded ES256 token from a private-key path", () => {
  const { privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const privateKeyPem = privateKey.export({
    format: "pem",
    type: "pkcs8",
  });
  const token = resolveAppStoreConnectApiToken({
    environment: {
      APP_STORE_CONNECT_API_ISSUER_ID:
        "57246542-96fe-1a63-e053-0824d011072a",
      APP_STORE_CONNECT_API_KEY_ID: "2X9R4HXF34",
      APP_STORE_CONNECT_API_PRIVATE_KEY_PATH: "/secure/AuthKey.p8",
    },
    fileSystem: {
      readFileSync(filePath) {
        assert.equal(filePath, "/secure/AuthKey.p8");
        return privateKeyPem;
      },
    },
    nowMs: Date.parse("2026-07-25T20:00:00.000Z"),
  });
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );
  assert.equal(payload.exp - payload.iat, 600);
});

test("requires credentials without echoing secret-shaped inputs", () => {
  assert.throws(
    () => resolveAppStoreConnectApiToken({ environment: {} }),
    /authentication is missing/,
  );
  const url = buildAppStoreConnectBuildUrl(EXPECTED);
  assert.match(url, /^https:\/\/api\.appstoreconnect\.apple\.com\/v1\/builds\?/);
});
