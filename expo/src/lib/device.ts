import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { z } from "zod";

import { requireApiBaseUrl } from "./config";

const STORAGE_KEYS = {
  deviceId: "@guidepup/device-id",
  expiresAt: "@guidepup/session-expires-at",
  sessionToken: "@guidepup/session-token",
} as const;

const BootstrapResponseSchema = z.object({
  apiVersion: z.literal("v1"),
  deviceId: z.string().uuid(),
  expiresAt: z.string(),
  issuedAt: z.string(),
  promptVersion: z.string(),
  rateLimitPerMinute: z.number().int().positive(),
  sessionToken: z.string().min(16),
});

type StoredDeviceSession = {
  deviceId: string;
  expiresAt: string;
  sessionToken: string;
};

function getPlatform() {
  if (Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web") {
    return Platform.OS;
  }

  return "unknown";
}

async function canUseSecureStore() {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function readStoredValue(key: string) {
  if (await canUseSecureStore()) {
    return SecureStore.getItemAsync(key);
  }

  return AsyncStorage.getItem(key);
}

async function writeStoredValue(key: string, value: string) {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  await AsyncStorage.setItem(key, value);
}

async function removeStoredValue(key: string) {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }

  await AsyncStorage.removeItem(key);
}

export async function clearDeviceSession() {
  await Promise.all([
    removeStoredValue(STORAGE_KEYS.deviceId),
    removeStoredValue(STORAGE_KEYS.expiresAt),
    removeStoredValue(STORAGE_KEYS.sessionToken),
  ]);
}

export async function getStoredDeviceSession(): Promise<StoredDeviceSession | null> {
  const [deviceId, expiresAt, sessionToken] = await Promise.all([
    readStoredValue(STORAGE_KEYS.deviceId),
    readStoredValue(STORAGE_KEYS.expiresAt),
    readStoredValue(STORAGE_KEYS.sessionToken),
  ]);

  if (!deviceId || !expiresAt || !sessionToken) {
    return null;
  }

  return {
    deviceId,
    expiresAt,
    sessionToken,
  };
}

async function bootstrapDevice(existingDeviceId?: string) {
  const response = await fetch(`${requireApiBaseUrl()}/v1/device/bootstrap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appVersion: Constants.expoConfig?.version,
      buildVersion:
        Constants.expoConfig?.ios?.buildNumber ||
        String(Constants.expoConfig?.android?.versionCode || ""),
      deviceId: existingDeviceId,
      platform: getPlatform(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Bootstrap failed (${response.status}).`);
  }

  const parsed = BootstrapResponseSchema.parse(await response.json());
  await Promise.all([
    writeStoredValue(STORAGE_KEYS.deviceId, parsed.deviceId),
    writeStoredValue(STORAGE_KEYS.expiresAt, parsed.expiresAt),
    writeStoredValue(STORAGE_KEYS.sessionToken, parsed.sessionToken),
  ]);

  return {
    deviceId: parsed.deviceId,
    expiresAt: parsed.expiresAt,
    sessionToken: parsed.sessionToken,
  };
}

export async function ensureDeviceSession() {
  const existing = await getStoredDeviceSession();
  const expiresAtMs = existing ? Date.parse(existing.expiresAt) : 0;
  const expiresSoon = expiresAtMs <= Date.now() + 5 * 60 * 1000;

  if (existing && !expiresSoon) {
    return existing;
  }

  return bootstrapDevice(existing?.deviceId);
}
