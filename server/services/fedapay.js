import { env } from "../config/env.js";

const FEDAPAY_URLS = {
  sandbox: "https://sandbox-api.fedapay.com",
  live: "https://api.fedapay.com",
};

const getBaseUrl = () => {
  if (!FEDAPAY_URLS[env.fedapayEnvironment]) {
    throw new Error("FEDAPAY_ENVIRONMENT doit être sandbox ou live.");
  }
  return FEDAPAY_URLS[env.fedapayEnvironment];
};

const getResource = (payload, name) =>
  payload?.[`v1/${name}`] ?? payload?.[name] ?? payload;

const fedapayRequest = async (path, options = {}) => {
  if (!env.fedapaySecretKey) {
    const error = new Error("Le service de paiement FedaPay n'est pas configuré.");
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.fedapaySecretKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("FedaPay API request failed:", error);
    const unavailable = new Error("FedaPay est momentanément indisponible.");
    unavailable.status = 502;
    throw unavailable;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("FedaPay API returned an error:", response.status);
    const failure = new Error("FedaPay n'a pas pu traiter cette demande.");
    failure.status = 502;
    throw failure;
  }
  return payload;
};

export const createFedaPayTransaction = async ({
  amount,
  description,
  customer,
}) => {
  const payload = await fedapayRequest("/v1/transactions", {
    method: "POST",
    body: JSON.stringify({
      description,
      amount,
      currency: { iso: "XOF" },
      customer,
    }),
  });
  const transaction = getResource(payload, "transaction");
  if (!transaction?.id) {
    throw new Error("FedaPay n'a pas renvoyé l'identifiant de transaction.");
  }

  const tokenPayload = await fedapayRequest(
    `/v1/transactions/${encodeURIComponent(transaction.id)}/token`,
    { method: "POST", body: JSON.stringify({}) },
  );
  const paymentUrl =
    tokenPayload?.url ?? tokenPayload?.["v1/token"]?.url ?? tokenPayload?.token?.url;
  if (typeof paymentUrl !== "string" || !/^https:\/\/[^\s]+$/i.test(paymentUrl)) {
    throw new Error("FedaPay n'a pas renvoyé une URL de paiement valide.");
  }
  return { transaction, paymentUrl };
};

export const getFedaPayTransaction = async (transactionId) => {
  const payload = await fedapayRequest(
    `/v1/transactions/${encodeURIComponent(transactionId)}`,
    { method: "GET" },
  );
  return getResource(payload, "transaction");
};
