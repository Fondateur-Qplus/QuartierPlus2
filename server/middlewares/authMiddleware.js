import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const authMiddleware = (request, response, next) => {
  const authorization = request.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return response.status(401).json({ error: "Authentification requise." });
  }

  try {
    const payload = jwt.verify(match[1], env.jwtSecret, {
      algorithms: ["HS256"],
    });
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string"
    ) {
      return response.status(401).json({ error: "Jeton invalide." });
    }
    request.auth = { userId: payload.sub };
    request.user = { id: payload.sub };
    return next();
  } catch {
    return response.status(401).json({ error: "Jeton invalide ou expiré." });
  }
};
