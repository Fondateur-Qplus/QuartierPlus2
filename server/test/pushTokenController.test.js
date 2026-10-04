import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";

const { isValidExpoPushToken } = await import(
  "../controllers/pushTokenController.js"
);

test("push token validation accepts Expo tokens and rejects malformed input", () => {
  assert.equal(isValidExpoPushToken("ExpoPushToken[01234567-abcd-ABCD]"), true);
  assert.equal(isValidExpoPushToken("ExponentPushToken[01234567]"), false);
  assert.equal(isValidExpoPushToken("ExpoPushToken[]"), false);
  assert.equal(isValidExpoPushToken("ExpoPushToken[bad token]"), false);
  assert.equal(isValidExpoPushToken(null), false);
});
