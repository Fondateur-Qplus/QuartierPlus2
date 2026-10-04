import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";

const { authenticateSocket, readSocketToken } = await import(
  "../sockets/authSocket.js"
);

const socketFor = (auth = {}, headers = {}) => ({
  handshake: { auth, headers },
  data: {},
});

test("socket authentication reads bearer and auth payload tokens", () => {
  assert.equal(
    readSocketToken(socketFor({ token: "auth-token" })),
    "auth-token",
  );
  assert.equal(
    readSocketToken(socketFor({ accessToken: "access-token" })),
    "access-token",
  );
  assert.equal(
    readSocketToken(socketFor({}, { authorization: "Bearer header-token" })),
    "header-token",
  );
  assert.equal(
    readSocketToken(socketFor({ authorization: "Bearer auth-header-token" })),
    "auth-header-token",
  );
});

test("socket authentication rejects absent and invalid JWTs", async () => {
  for (const socket of [
    socketFor(),
    socketFor({ token: "not-a-jwt" }),
    socketFor({
      token: jwt.sign(
        { sub: "user-123" },
        "different-signing-secret-that-is-also-long",
      ),
    }),
  ]) {
    const error = await new Promise((resolve) => {
      authenticateSocket(socket, resolve);
    });
    assert.ok(error instanceof Error);
    assert.match(error.message, /Authentification|Jeton/);
  }
});
