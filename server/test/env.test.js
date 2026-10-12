import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const serverDirectory = fileURLToPath(new URL("..", import.meta.url));
const productionEnv = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  DATABASE_URL: "postgres://localhost/quartierplus",
  JWT_SECRET: "production-jwt-secret-with-at-least-32-characters",
  TICKET_QR_SECRET: "production-ticket-secret-with-at-least-32-characters",
  OTP_TEST_MODE: "false",
  OTP_TEST_ALLOWLIST: "+22670000000",
  SMS_DELIVERY_URL: "https://sms.example.invalid/send",
  SMS_DELIVERY_TOKEN: "fake-sms-token",
  GOOGLE_CLIENT_ID: "fake-google-client-id",
  LIVEKIT_API_KEY: "fake-livekit-key",
  LIVEKIT_API_SECRET: "fake-livekit-secret",
  LIVEKIT_URL: "wss://livekit.example.invalid",
  DOTENV_CONFIG_PATH: "/dev/null",
};

const loadProductionConfig = (overrides = {}) =>
  spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "import './config/env.js'"],
    {
      cwd: serverDirectory,
      env: { ...productionEnv, ...overrides },
      encoding: "utf8",
    },
  );

test("production environment accepts a complete valid configuration", () => {
  const result = loadProductionConfig();
  assert.equal(result.status, 0, result.stderr);
});

test("production environment rejects missing service credentials", () => {
  for (const name of ["SMS_DELIVERY_TOKEN", "GOOGLE_CLIENT_ID", "LIVEKIT_API_SECRET"]) {
    const result = loadProductionConfig({ [name]: "" });
    assert.notEqual(result.status, 0, `${name} should be required`);
    assert.match(result.stderr, new RegExp(name));
  }
});

test("production environment rejects test OTP mode even with an allowlisted number", () => {
  const result = loadProductionConfig({
    OTP_TEST_MODE: "true",
    OTP_TEST_ALLOWLIST: "+22670000000",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OTP_TEST_MODE must not be enabled in production/);
});

test("production environment rejects malformed OTP allowlist entries", () => {
  const result = loadProductionConfig({
    OTP_TEST_ALLOWLIST: "+22670000000,not-a-phone",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OTP_TEST_ALLOWLIST/);
});

test("production environment rejects malformed URLs and boolean variables", () => {
  for (const [name, value] of [
    ["LIVEKIT_URL", "ws://livekit.example.invalid"],
    ["PGSSL", "yes"],
    ["IS_PROMO_FREE_ACCESS", "sometimes"],
  ]) {
    const result = loadProductionConfig({ [name]: value });
    assert.notEqual(result.status, 0, `${name} should be validated`);
    assert.match(result.stderr, new RegExp(name));
  }
});

test("production environment requires Cloudinary credentials as a complete set", () => {
  const result = loadProductionConfig({
    CLOUDINARY_CLOUD_NAME: "quartierplus",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CLOUDINARY_API_KEY/);
});

test("media limits are configurable positive integers", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "import './config/env.js'"],
    {
      cwd: serverDirectory,
      env: {
        ...productionEnv,
        POST_MAX_PHOTO_BYTES: "0",
        DOTENV_CONFIG_PATH: "/dev/null",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POST_MAX_PHOTO_BYTES must be a positive integer/);
});