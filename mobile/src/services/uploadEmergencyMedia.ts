import axios from "axios";
import { apiFetch, API_BASE_URL, type ApiFetchResponse } from "./api";
import { MediaUploadError } from "./mediaUploadError";

type MediaKind = "image" | "video";

type UploadSignature = {
  apiKey: string;
  cloudName: string;
  folder: string;
  max_bytes: number;
  public_id: string;
  resource_type: MediaKind;
  signature: string;
  timestamp: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const uploadEmergencyMedia = async (
  uri: string,
  filename: string,
  mimeType: string,
  mediaKind: MediaKind,
) => {
  if (!API_BASE_URL) throw new Error("L'adresse du serveur n'est pas configurée.");
  const signUrl = `${API_BASE_URL}/v1/media/sign`;
  let response: ApiFetchResponse;
  try {
    response = await apiFetch(signUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: mediaKind }),
    });
  } catch (error) {
    throw new MediaUploadError(
      "Le média d'urgence n'a pas pu être téléversé.",
      `Étape : signature\nURL : ${signUrl}\nErreur : ${
        error instanceof Error ? error.message : "Impossible de joindre le serveur."
      }`,
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
    typeof payload.max_bytes !== "number" ||
    payload.resource_type !== mediaKind
  ) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Impossible de préparer le média d'urgence.";
    throw new MediaUploadError(
      message.startsWith("Le téléversement média n'est pas configuré")
        ? message
        : "Le serveur n'a pas pu préparer le téléversement du média d'urgence.",
      `Étape : signature\nURL : ${signUrl}\nStatut HTTP : ${response.status}\nMessage : ${message}`,
    );
  }

  const signature = payload as UploadSignature;
  const formData = new FormData();
  const file = { uri, name: filename, type: mimeType };
  (formData as FormData & {
    append: (name: string, value: string | typeof file) => void;
  }).append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("folder", signature.folder);
  formData.append("public_id", signature.public_id);
  formData.append("signature", signature.signature);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${signature.cloudName}/${mediaKind}/upload`;
  try {
    const upload = await axios.post<{ public_id: string; secure_url: string }>(
      uploadUrl,
      formData,
      { timeout: 20_000 },
    );
    if (
      upload.data.public_id !== signature.public_id ||
      typeof upload.data.secure_url !== "string"
    ) {
      throw new MediaUploadError(
        "Cloudinary a renvoyé une réponse invalide pour le média d'urgence.",
        `Étape : vérification de la réponse Cloudinary\nURL : ${uploadUrl}\nType de ressource : ${mediaKind}\nTimestamp signé : ${signature.timestamp}\nParamètres signés : folder, public_id, timestamp\nStatut HTTP : 200\nMessage Cloudinary : identifiant ou URL inattendu.`,
      );
    }
    return upload.data.secure_url;
  } catch (error) {
    if (error instanceof MediaUploadError) throw error;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const data: unknown = axios.isAxiosError(error) ? error.response?.data : null;
    const message =
      isRecord(data) &&
      isRecord(data.error) &&
      typeof data.error.message === "string"
        ? data.error.message
        : error instanceof Error
          ? error.message
          : "Réponse Cloudinary indisponible.";
    throw new MediaUploadError(
      status
        ? "Cloudinary a refusé le téléversement du média d'urgence. Vérifiez sa configuration et réessayez."
        : "Cloudinary est injoignable pour le moment. Réessayez plus tard.",
      [
        "Étape : téléversement Cloudinary",
        `URL : ${uploadUrl}`,
        `Type de ressource : ${mediaKind}`,
        `Timestamp signé : ${signature.timestamp}`,
        "Paramètres signés : folder, public_id, timestamp",
        `Statut HTTP : ${status ?? "indisponible"}`,
        `Message Cloudinary : ${message}`,
      ].join("\n"),
    );
  }
};
