import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";
process.env.OTP_TEST_MODE = "false";

const { authMiddleware } = await import("../middlewares/authMiddleware.js");
const secret = process.env.JWT_SECRET;

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

test("authMiddleware accepts a valid application JWT", () => {
  const request = {
    get: () =>
      `Bearer ${jwt.sign({}, secret, {
        algorithm: "HS256",
        subject: "user-123",
      })}`,
  };
  const response = createResponse();
  let continued = false;

  authMiddleware(request, response, () => {
    continued = true;
  });

  assert.equal(continued, true);
  assert.deepEqual(request.auth, { userId: "user-123" });
  assert.deepEqual(request.user, { id: "user-123" });
});

test("authMiddleware rejects missing, invalid, and expired tokens", () => {
  for (const authorization of [
    undefined,
    "Basic abc",
    "Bearer not-a-token",
    `Bearer ${jwt.sign({}, secret, {
      algorithm: "HS256",
      subject: "user-123",
      expiresIn: -1,
    })}`,
  ]) {
    const request = {
      get: () => authorization,
    };
    const response = createResponse();
    let continued = false;

    authMiddleware(request, response, () => {
      continued = true;
    });

    assert.equal(continued, false);
    assert.equal(response.statusCode, 401);
    assert.ok(response.payload.error);
  }
});
