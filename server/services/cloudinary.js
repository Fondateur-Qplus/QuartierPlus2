import { createHash } from "node:crypto";
import { env } from "../config/env.js";

const requireCloudinaryConfiguration = () => {
  if (
    !env.cloudinaryCloudName ||
    !env.cloudinaryApiKey ||
    !env.cloudinaryApiSecret
  ) {
    const error = new Error("Le téléversement média n'est pas configuré.");
    error.status = 503;
    throw error;
  }
};

export const createCloudinaryUploadSignature = (parameters) => {
  requireCloudinaryConfiguration();
  const signedParameters = Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
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
    const error = new Error("Impossible de vérifier le média sur Cloudinary.");
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
    const error = new Error("Impossible de supprimer les métadonnées GPS du média.");
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
