import axios from "axios";
import { apiFetch, API_BASE_URL } from "./api";

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
  const response = await apiFetch(`${API_BASE_URL}/v1/media/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "image" }),
  });
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
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Impossible de préparer la photo de l'annonce.",
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

  const upload = await axios.post<{ public_id: string }>(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
    formData,
    { timeout: 20_000 },
  );
  if (upload.data.public_id !== signature.public_id) {
    throw new Error("La réponse du téléversement de la photo est invalide.");
  }
  return upload.data.public_id;
};
