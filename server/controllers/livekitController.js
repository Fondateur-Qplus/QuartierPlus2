import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { env } from "../config/env.js";

const ROOM_NAME_PATTERN =
  /^(?:emergency|grin|sos_[A-Za-z0-9-]{1,100}|channel_[A-Za-z0-9-]{1,100})$/;
const TOKEN_TTL_SECONDS = 10 * 60;

export const createLiveKitToken = async (request, response) => {
  const roomName =
    typeof request.body?.roomName === "string"
      ? request.body.roomName.trim()
      : typeof request.body?.room === "string"
        ? request.body.room.trim()
        : "";
  const userId = request.user?.id;
  if (!userId) {
    return response.status(401).json({ error: "Authentification requise." });
  }
  if (!roomName || !ROOM_NAME_PATTERN.test(roomName)) {
    return response.status(400).json({
      error:
        "Nom de room invalide. Utilisez emergency, grin, sos_<id> ou channel_<id>.",
    });
  }
  if (!env.livekitConfigurationIsUsable) {
    const details = env.livekitConfigurationProblems.join(", ");
    console.error(
      `LiveKit is unavailable; missing or invalid configuration: ${details}.`,
    );
    return response.status(503).json({
      error:
        `Talkie-walkie indisponible : vérifiez ${details}.`,
    });
  }

  let livekitUrl;
  try {
    livekitUrl = new URL(env.livekitUrl);
  } catch {
    return response.status(503).json({
      error: "L'adresse du service audio LiveKit est invalide.",
    });
  }
  if (
    !["wss:", "ws:"].includes(livekitUrl.protocol) ||
    !livekitUrl.hostname ||
    (livekitUrl.protocol === "ws:" && env.nodeEnv === "production")
  ) {
    return response.status(503).json({
      error: "L'adresse LiveKit doit utiliser WSS en production.",
    });
  }

  try {
    const accessToken = new AccessToken(
      env.livekitApiKey,
      env.livekitApiSecret,
      {
        identity: userId,
        ttl: TOKEN_TTL_SECONDS,
      },
    );
    accessToken.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishSources:
        roomName === "grin"
          ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
          : [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
    });
    if (roomName === "grin") {
      accessToken.roomConfig = new RoomConfiguration({
        name: roomName,
        maxParticipants: 6,
      });
    }
    const token = await accessToken.toJwt();
    return response.status(200).json({
      token,
      url: env.livekitUrl,
      roomName,
      expiresIn: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Failed to issue LiveKit access token:", error);
    return response.status(503).json({
      error: "Impossible de générer un jeton LiveKit pour le moment.",
    });
  }
};
