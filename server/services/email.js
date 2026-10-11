const providers = {
  resend: async ({ apiKey, from, to, code, expiresInMinutes }) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Votre code de vérification QuartierPlus",
        text: `Votre code QuartierPlus est ${code}. Il expire dans ${expiresInMinutes} minutes.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Échec de livraison e-mail (${response.status}).`);
    }
  },
};

export const isEmailDeliveryConfigured = (configuration) =>
  Boolean(
    configuration.emailProvider &&
      configuration.emailApiKey &&
      configuration.emailFrom &&
      typeof providers[configuration.emailProvider] === "function",
  );

export const deliverVerificationEmail = async (configuration, to, code, ttl) => {
  const provider = providers[configuration.emailProvider];
  if (!provider || !isEmailDeliveryConfigured(configuration)) {
    throw new Error("L'envoi par e-mail n'est pas configuré.");
  }
  await provider({
    apiKey: configuration.emailApiKey,
    from: configuration.emailFrom,
    to,
    code,
    expiresInMinutes: ttl,
  });
};
