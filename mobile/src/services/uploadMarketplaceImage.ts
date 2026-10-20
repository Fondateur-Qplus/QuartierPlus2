import { apiFetch, API_BASE_URL } from "./api";
import {
  uploadCloudinaryMedia,
  type CloudinaryUploadSignature,
} from "./cloudinaryUpload";
import { MediaUploadError } from "./mediaUploadError";

type UploadSignature = CloudinaryUploadSignature & {
  max_bytes: number;
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
      "Cloudinary a renvoyé une réponse invalide pour la photo.",
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
    typeof payload.max_bytes !== "number" ||
    payload.resource_type !== "image"
  ) {
    const message =
      isRecord(payload) && typeof payload.reason === "string"
        ? payload.reason
        : isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Impossible de préparer la photo de l'annonce.";
    throw new MediaUploadError(
      message,
      `Étape : signature\nURL de signature : ${API_BASE_URL}/v1/media/sign\nStatut HTTP : ${response.status}\nMessage : ${message}`,
    );
  }
  const signature = payload as UploadSignature;
  if (size > Math.min(signature.max_bytes, 300 * 1024)) {
    throw new Error("La photo optimisée dépasse la limite autorisée.");
  }
  try {
    const result = await uploadCloudinaryMedia(signature, {
      uri,
      name: filename,
      type: "image/webp",
      size,
    });
    return result.publicId;
  } catch (error) {
    if (error instanceof MediaUploadError) throw error;
    throw new MediaUploadError(
      "Le média n'a pas pu être téléversé.",
      error instanceof Error ? error.message : "Erreur Cloudinary inconnue.",
    );
  }
};
