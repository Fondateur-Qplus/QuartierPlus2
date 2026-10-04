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