export const API_CONTRACT_VERSION = 2;

export const getHealthPayload = () => ({
  status: "ok",
  commit: process.env.RENDER_GIT_COMMIT ?? "unknown",
  contractVersion: API_CONTRACT_VERSION,
});

export const handleHealth = (_request, response) =>
  response.status(200).json(getHealthPayload());
