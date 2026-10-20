import assert from "node:assert/strict";
import { test } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";
process.env.LIVEKIT_API_KEY = "APITestUnitKey12345";
process.env.LIVEKIT_API_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.LIVEKIT_URL = "wss://quartierplus.livekit.cloud";

const { createLiveKitToken } = await import(
  "../controllers/livekitController.js"
);
const verifier = new TokenVerifier(
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

const invokeController = async (body, userId = "user-123") => {
  const response = {
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
  };
  await createLiveKitToken({ body, user: userId ? { id: userId } : undefined }, response);
  return response;
};

test("LiveKit token is scoped to a room, user, and audio-only publishing", async () => {
  const response = await invokeController({ roomName: "channel_abc-123" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.url, process.env.LIVEKIT_URL);
  assert.equal(response.payload.roomName, "channel_abc-123");
  const claims = await verifier.verify(response.payload.token);
  assert.equal(claims.sub, "user-123");
  assert.equal(claims.video?.room, "channel_abc-123");
  assert.equal(claims.video?.roomJoin, true);
  assert.equal(claims.video?.canPublish, true);
  assert.equal(claims.video?.canSubscribe, true);
  assert.deepEqual(claims.video?.canPublishSources, ["microphone"]);
  assert.equal(claims.video?.canPublishData, false);
});

test("Grin token enables camera and microphone with a six-participant room limit", async () => {
  const response = await invokeController({ roomName: "grin" });

  assert.equal(response.statusCode, 200);
  const claims = await verifier.verify(response.payload.token);
  assert.equal(claims.video?.room, "grin");
  assert.deepEqual(claims.video?.canPublishSources, ["microphone", "camera"]);
  assert.equal(claims.roomConfig?.name, "grin");
  assert.equal(claims.roomConfig?.maxParticipants, 6);
});

test("LiveKit token route rejects unauthenticated or arbitrary room names", async () => {
  const unauthenticated = await invokeController(
    { roomName: "emergency" },
    null,
  );
  assert.equal(unauthenticated.statusCode, 401);

  const invalidRoom = await invokeController({ roomName: "admin" });
  assert.equal(invalidRoom.statusCode, 400);
});
