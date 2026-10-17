import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const result = (name, status, cause = "") => {
  console.log(`${status} ${name}${cause ? ` : ${cause}` : ""}`);
};

const cloudinary = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim().replace(/^(['"])(.*)\1$/, "$2"),
  apiKey: process.env.CLOUDINARY_API_KEY?.trim().replace(/^(['"])(.*)\1$/, "$2"),
  apiSecret: process.env.CLOUDINARY_API_SECRET?.trim().replace(/^(['"])(.*)\1$/, "$2"),
};

const cloudinarySignature = (parameters) =>
  createHash("sha1")
    .update(
      `${Object.entries(parameters)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join("&")}${cloudinary.apiSecret}`,
    )
    .digest("hex");

const cloudinaryRequest = async (resourceType, action, fields) => {
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/${resourceType}/${action}`;
  const response = await fetch(url, { method: "POST", body: fields });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
  }
  return payload;
};

const uploadCloudinary = async (resourceType, publicId, buffer, mimeType) => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const parameters = { public_id: publicId, timestamp };
  const form = new FormData();
  form.set("api_key", cloudinary.apiKey);
  form.set("timestamp", timestamp);
  form.set("public_id", publicId);
  form.set("signature", cloudinarySignature(parameters));
  form.set("file", new Blob([buffer], { type: mimeType }), `${publicId}.${mimeType === "video/mp4" ? "mp4" : "svg"}`);
  const uploaded = await cloudinaryRequest(resourceType, "upload", form);
  if (uploaded.public_id !== publicId) {
    throw new Error("Cloudinary n’a pas retourné le public_id demandé.");
  }
};

const deleteCloudinary = async (resourceType, publicId) => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const form = new FormData();
  form.set("api_key", cloudinary.apiKey);
  form.set("timestamp", timestamp);
  form.set("public_id", publicId);
  form.set("signature", cloudinarySignature({ public_id: publicId, timestamp }));
  const deleted = await cloudinaryRequest(resourceType, "destroy", form);
  if (deleted.result !== "ok" && deleted.result !== "not found") {
    throw new Error(`Résultat de suppression inattendu: ${deleted.result || "absent"}`);
  }
};

const runCloudinaryTest = async () => {
  const missing = Object.entries(cloudinary)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`variables absentes: ${missing.join(", ")}`);

  const publicId = `quartierplus-selftest-${Date.now()}`;
  const imageId = `${publicId}-image`;
  const videoId = `${publicId}-video`;
  const directory = await mkdtemp(join(tmpdir(), "quartierplus-selftest-"));
  const videoPath = process.env.SELFTEST_VIDEO_PATH?.trim() || join(directory, "test.mp4");
  const uploaded = [];
  try {
    await uploadCloudinary(
      "image",
      imageId,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2f6b4f"/></svg>'),
      "image/svg+xml",
    );
    uploaded.push(["image", imageId]);
    try {
      if (!process.env.SELFTEST_VIDEO_PATH?.trim()) {
        execFileSync("ffmpeg", [
          "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1", "-t", "1",
          "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", videoPath,
        ], { stdio: "ignore" });
      }
      const video = await readFile(videoPath);
      await uploadCloudinary("video", videoId, video, "video/mp4");
      uploaded.push(["video", videoId]);
    } catch (error) {
      throw new Error(`téléversement vidéo: ${error.message}`);
    }
  } finally {
    const deleteErrors = [];
    for (const [resourceType, id] of uploaded.reverse()) {
      try {
        await deleteCloudinary(resourceType, id);
      } catch (error) {
        deleteErrors.push(`${resourceType}: ${error.message}`);
      }
    }
    await rm(directory, { recursive: true, force: true });
    if (deleteErrors.length) throw new Error(`suppression: ${deleteErrors.join("; ")}`);
  }
};

const runLiveKitTest = async () => {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim().replace(/^(['"])(.*)\1$/, "$2");
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim().replace(/^(['"])(.*)\1$/, "$2");
  const livekitUrl = process.env.LIVEKIT_URL?.trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!apiKey || !apiSecret || !livekitUrl) {
    throw new Error("LIVEKIT_API_KEY, LIVEKIT_API_SECRET et LIVEKIT_URL sont requis.");
  }
  const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const roomName = `selftest-${Date.now()}`;
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: `selftest-${process.pid}`,
    ttl: "5m",
  });
  accessToken.addGrant({ roomJoin: true, room: roomName });
  const jwt = await accessToken.toJwt();
  if (!jwt) throw new Error("LiveKit n’a pas généré de token.");

  const rooms = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
  let created = false;
  try {
    await rooms.listRooms();
    await rooms.createRoom({ name: roomName, emptyTimeout: 60, maxParticipants: 1 });
    created = true;
    const listedRooms = await rooms.listRooms([roomName]);
    if (!listedRooms.some((room) => room.name === roomName)) {
      throw new Error("La room créée n’apparaît pas dans listRooms().");
    }
  } finally {
    if (created) await rooms.deleteRoom(roomName);
  }
};

let failed = false;
for (const [name, test] of [
  ["Cloudinary image + vidéo signées, puis suppression", runCloudinaryTest],
  ["LiveKit token + listRooms + création/suppression de room", runLiveKitTest],
]) {
  try {
    await test();
    result(name, "PASS");
  } catch (error) {
    failed = true;
    result(name, "FAIL", error.message);
  }
}

process.exitCode = failed ? 1 : 0;