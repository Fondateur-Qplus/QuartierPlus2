import { createHash } from "node:crypto";
import { env } from "../config/env.js";

const requireCloudinaryConfiguration = () => {
  const missingVariables = [
    ["CLOUDINARY_CLOUD_NAME", env.cloudinaryCloudName],
    ["CLOUDINARY_API_KEY", env.cloudinaryApiKey],
    ["CLOUDINARY_API_SECRET", env.cloudinaryApiSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missingVariables.length > 0) {
    const details = `Variable(s) manquante(s) : ${missingVariables.join(", ")}.`;
    console.error("Cloudinary media upload is unavailable:", details);
    const error = new Error(
      `Le téléversement média n'est pas configuré. ${details}`,
    );
    error.status = 503;
    throw error;
  }
};

const getCloudinaryErrorMessage = async (response) => {
  const body = await response.text();
  let message = body.slice(0, 300);
  try {
    const payload = JSON.parse(body);
    if (typeof payload?.error?.message === "string") {
      message = payload.error.message;
    }
  } catch {
    if (!message) message = "Réponse Cloudinary vide.";
  }
  console.error("Cloudinary API refused a media request:", {
    status: response.status,
    message,
  });
  return message || `Réponse HTTP ${response.status} sans détail.`;
};

export const createCloudinaryUploadSignature = (parameters) => {
  requireCloudinaryConfiguration();
  const signedParameters = Object.entries(parameters)
    .filter(
      ([key, value]) =>
        !["api_key", "file", "resource_type", "signature"].includes(
          key.toLowerCase(),
        ) &&
        value !== undefined &&
        value !== null &&
        value !== "",
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signature = createHash("sha1")
    .update(`${signedParameters}${env.cloudinaryApiSecret}`)
    .digest("hex");
  return {
    apiKey: env.cloudinaryApiKey,
    cloudName: env.cloudinaryCloudName,
    signature,
  };
};

export const getCloudinaryAsset = async (resourceType, publicId) => {
  requireCloudinaryConfiguration();
  if (!["image", "video"].includes(resourceType)) {
    throw new Error("Type de média invalide.");
  }
  const url = new URL(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/resources/${resourceType}/upload/${encodeURIComponent(publicId)}`,
  );
  url.searchParams.set("metadata", "true");
  const authorization = Buffer.from(
    `${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`,
  ).toString("base64");
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${authorization}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const message = await getCloudinaryErrorMessage(response);
    const error = new Error(
      `Cloudinary a refusé la vérification du média (HTTP ${response.status}) : ${message}`,
    );
    error.status = 502;
    throw error;
  }
  return response.json();
};

export const deleteCloudinaryAsset = async (resourceType, publicId) => {
  requireCloudinaryConfiguration();
  if (!["image", "video"].includes(resourceType)) {
    throw new Error("Type de média invalide.");
  }
  const url = new URL(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/resources/${resourceType}/upload`,
  );
  url.searchParams.set("public_ids[]", publicId);
  const authorization = Buffer.from(
    `${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`,
  ).toString("base64");
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Basic ${authorization}` },
  });
  if (!response.ok) {
    const message = await getCloudinaryErrorMessage(response);
    const error = new Error(
      `Cloudinary a refusé la suppression des métadonnées GPS (HTTP ${response.status}) : ${message}`,
    );
    error.status = 502;
    throw error;
  }
};

export const hasGpsMetadata = (metadata) => {
  if (Array.isArray(metadata)) return metadata.some(hasGpsMetadata);
  if (!metadata || typeof metadata !== "object") return false;
  return Object.entries(metadata).some(([key, value]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (
      normalizedKey.includes("gps") ||
      normalizedKey === "latitude" ||
      normalizedKey === "longitude"
    ) {
      return value !== null && value !== undefined && value !== "";
    }
    return hasGpsMetadata(value);
  });
};
