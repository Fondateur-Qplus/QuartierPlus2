import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { env } from "../config/env.js";

const ROOM_NAME_PATTERN =
  /^(?:emergency|grin|sos_[A-Za-z0-9-]{1,100}|channel_[A-Za-z0-9-]{1,100})$/;
const TOKEN_TTL_SECONDS = 10 * 60;

const safeDiagnostic = (error) => {
  const code =
    typeof error?.code === "string" || typeof error?.code === "number"
      ? String(error.code)
      : "LIVEKIT_TOKEN_ERROR";
  let message =
    typeof error?.message === "string" ? error.message : "Erreur inconnue.";
  for (const secret of [env.livekitApiKey, env.livekitApiSecret]) {
    if (secret) message = message.replaceAll(secret, "[masqué]");
  }
  return { code, message: message.slice(0, 300) };
};

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
    const diagnostic = env.livekitConfigurationProblemDetails.join(" ");
    const code = details.includes("LIVEKIT_API_KEY")
      ? "LIVEKIT_API_KEY_INVALID"
      : details.includes("LIVEKIT_API_SECRET")
        ? "LIVEKIT_API_SECRET_INVALID"
        : "LIVEKIT_URL_INVALID";
    console.error(
      `LiveKit configuration rejected (${code}): ${diagnostic}`,
    );
    return response.status(503).json({
      error: "LiveKit est indisponible.",
      code,
      reason: `${diagnostic} (code ${code}).`,
    });
  }

  let livekitUrl;
  try {
    livekitUrl = new URL(env.livekitUrl);
  } catch {
    console.error("LiveKit configuration error: LIVEKIT_URL is not a valid URL.");
    return response.status(503).json({
      error: "LiveKit est indisponible.",
      code: "LIVEKIT_URL_INVALID",
      reason: "LIVEKIT_URL doit être une URL wss:// valide (code LIVEKIT_URL_INVALID).",
    });
  }
  if (
    livekitUrl.protocol !== "wss:" ||
    !livekitUrl.hostname
  ) {
    console.error(
      "LiveKit configuration error: LIVEKIT_URL must be a valid wss:// URL.",
    );
    return response.status(503).json({
      error: "LiveKit est indisponible.",
      code: "LIVEKIT_URL_INVALID",
      reason: "LIVEKIT_URL doit être une URL wss:// valide (code LIVEKIT_URL_INVALID).",
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
    const diagnostic = safeDiagnostic(error);
    console.error("Failed to issue LiveKit access token:", diagnostic);
    return response.status(503).json({
      error: "Impossible de générer un jeton LiveKit.",
      code: diagnostic.code,
      reason: `Génération du jeton LiveKit échouée : ${diagnostic.message} (code ${diagnostic.code}).`,
    });
  }
};
