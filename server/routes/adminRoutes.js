import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { sendSmtpDiagnosticEmail } from "../services/email.js";

const router = Router();

router.post("/test-email", async (request, response) => {
  const configuredToken = env.adminTestEmailToken;
  const suppliedToken = request.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configuredToken) {
    return response.status(503).json({
      error: "Variable ADMIN_TEST_EMAIL_TOKEN manquante.",
    });
  }
  const expected = Buffer.from(configuredToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return response.status(401).json({ error: "Authentification admin requise." });
  }
  if (!env.smtpConfigured) {
    return response.status(503).json({
      error: "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et MAIL_FROM sont requis.",
    });
  }
  try {
    await sendSmtpDiagnosticEmail(env.emailFrom);
    return response.status(200).json({ ok: true, provider: "smtp" });
  } catch (error) {
    console.error("Échec du test SMTP :", error.code || error.message);
    return response.status(502).json({
      error: `Échec de l'envoi SMTP (${error.code || "erreur transport"}).`,
    });
  }
});

export default router;