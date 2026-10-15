import axios from "axios";
import { apiFetch, API_BASE_URL } from "./api";
import { MediaUploadError } from "./mediaUploadError";

type UploadSignature = {
  apiKey: string;
  cloudName: string;
  folder: string;
  max_bytes: number;
  public_id: string;
  signature: string;
  timestamp: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const uploadMarketplaceImage = async (
  uri: string,
  size: number,
  filename: string,
) => {
  if (!API_BASE_URL) throw new Error("L'adresse du serveur n'est pas configurée.");
  let response;
  try {
    response = await apiFetch(`${API_BASE_URL}/v1/media/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: "image" }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossible de joindre le serveur.";
    throw new MediaUploadError(
      "Le média n'a pas pu être téléversé.",
      `Étape : signature\nURL de signature : ${API_BASE_URL}/v1/media/sign\nErreur : ${message}`,
    );
  }
  const payload: unknown = await response.json();
  if (
    !response.ok ||
    !isRecord(payload) ||
    typeof payload.apiKey !== "string" ||
    typeof payload.cloudName !== "string" ||
    typeof payload.folder !== "string" ||
    typeof payload.public_id !== "string" ||
    typeof payload.signature !== "string" ||
    typeof payload.timestamp !== "number" ||
    typeof payload.max_bytes !== "number"
  ) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Impossible de préparer la photo de l'annonce.";
    throw new MediaUploadError(
      "Le média n'a pas pu être téléversé.",
      `Étape : signature\nURL de signature : ${API_BASE_URL}/v1/media/sign\nStatut HTTP : ${response.status}\nMessage : ${message}`,
    );
  }
  const signature = payload as UploadSignature;
  if (size > Math.min(signature.max_bytes, 300 * 1024)) {
    throw new Error("La photo optimisée dépasse la limite autorisée.");
  }
  const formData = new FormData();
  const file = { uri, name: filename, type: "image/webp" };
  (formData as FormData & {
    append: (name: string, value: string | typeof file) => void;
  }).append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("folder", signature.folder);
  formData.append("public_id", signature.public_id);
  formData.append("signature", signature.signature);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`;
  let upload;
  try {
    upload = await axios.post<{ public_id: string }>(
      uploadUrl,
      formData,
      { timeout: 20_000 },
    );
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const responseData: unknown = axios.isAxiosError(error)
      ? error.response?.data
      : null;
    const cloudinaryMessage =
      isRecord(responseData) &&
      isRecord(responseData.error) &&
      typeof responseData.error.message === "string"
        ? responseData.error.message
        : error instanceof Error
          ? error.message
          : "Réponse Cloudinary indisponible.";
    throw new MediaUploadError(
      "Le média n'a pas pu être téléversé.",
      [
        "Étape : téléversement Cloudinary",
        `URL : ${uploadUrl}`,
        "Type de ressource : image",
        `Timestamp signé : ${signature.timestamp}`,
        "Paramètres signés : folder, public_id, timestamp",
        `Statut HTTP : ${status ?? "indisponible"}`,
        `Message Cloudinary : ${cloudinaryMessage}`,
      ].join("\n"),
    );
  }
  if (upload.data.public_id !== signature.public_id) {
    throw new MediaUploadError(
      "Le média n'a pas pu être téléversé.",
      [
        "Étape : vérification de la réponse Cloudinary",
        `URL : ${uploadUrl}`,
        "Type de ressource : image",
        `Timestamp signé : ${signature.timestamp}`,
        "Paramètres signés : folder, public_id, timestamp",
        "Statut HTTP : 200",
        "Message Cloudinary : identifiant public inattendu.",
      ].join("\n"),
    );
  }
  return upload.data.public_id;
};
