import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import {
  deleteCloudinaryAsset,
  getCloudinaryAsset,
  hasGpsMetadata,
} from "../services/cloudinary.js";

const ITEM_TYPES = new Set(["listing", "local", "service"]);

const validateImage = async (userId, publicId) => {
  if (
    typeof publicId !== "string" ||
    publicId.length > 255 ||
    !publicId.startsWith(`${userId}_`)
  ) {
    return { error: "La photo téléversée ne vous appartient pas." };
  }
  const image = await getCloudinaryAsset("image", publicId);
  if (!image || image.public_id !== publicId) {
    return { error: "La photo téléversée est introuvable." };
  }
  if (hasGpsMetadata(image.image_metadata)) {
    await deleteCloudinaryAsset("image", publicId);
    return { error: "La photo contenait des coordonnées GPS et a été supprimée." };
  }
  if (
    typeof image.secure_url !== "string" ||
    !image.secure_url.startsWith(
      `https://res.cloudinary.com/${env.cloudinaryCloudName}/`,
    ) ||
    !["jpg", "jpeg", "png", "webp"].includes(String(image.format).toLowerCase()) ||
    !Number.isSafeInteger(image.bytes) ||
    image.bytes < 1 ||
    image.bytes > Math.min(env.postMaxPhotoBytes, 300 * 1024)
  ) {
    return { error: "La photo ne respecte pas les limites autorisées." };
  }
  return { image };
};

export const createMarketplaceItem = async (request, response, next) => {
  const title =
    typeof request.body?.title === "string" ? request.body.title.trim() : "";
  const description =
    typeof request.body?.description === "string"
      ? request.body.description.trim()
      : "";
  const category =
    typeof request.body?.category === "string"
      ? request.body.category.trim().slice(0, 30)
      : "";
  const itemType =
    typeof request.body?.item_type === "string"
      ? request.body.item_type.toLowerCase()
      : "";
  const isFree = request.body?.is_free === true;
  const price = isFree ? 0 : Number(request.body?.price);
  const coordinates = request.body?.location;
  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  const mediaPublicId = request.body?.media_public_id;
  if (
    !title ||
    title.length > 150 ||
    description.length > 5000 ||
    !category ||
    !ITEM_TYPES.has(itemType) ||
    !Number.isFinite(price) ||
    price < 0 ||
    (!isFree && price === 0) ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  ) {
    return response.status(400).json({ error: "Les informations de l'annonce sont invalides." });
  }
  try {
    let imageUrl = null;
    if (mediaPublicId !== undefined) {
      const verified = await validateImage(request.auth.userId, mediaPublicId);
      if (verified.error) {
        return response.status(400).json({ error: verified.error });
      }
      imageUrl = verified.image.secure_url;
    }
    const result = await pool.query(
      `INSERT INTO marketplace_items
         (seller_id, title, description, price_fcfa, category, item_type,
          image_urls, location, contact_phone, whatsapp_phone)
       SELECT profile.id, $2, $3, $4, $5, $6,
              CASE WHEN $7::text IS NULL THEN NULL ELSE ARRAY[$7::text] END,
              ST_SetSRID(ST_MakePoint($9, $8), 4326),
              profile.phone_number, profile.phone_number
       FROM users AS profile
       WHERE profile.id = $1
       RETURNING id, title, description, price_fcfa AS price,
                 price_fcfa = 0 AS is_free, category, item_type,
                 image_urls[1] AS image_url, created_at,
                 (SELECT profile.full_name FROM users AS profile
                  WHERE profile.id = seller_id) AS seller_name,
                 (SELECT profile.phone_number FROM users AS profile
                  WHERE profile.id = seller_id) AS seller_phone`,
      [
        request.auth.userId,
        title,
        description,
        price,
        category,
        itemType,
        imageUrl,
        latitude,
        longitude,
      ],
    );
    if (!result.rowCount) {
      return response.status(404).json({ error: "Utilisateur introuvable." });
    }
    return response.status(201).json({
      item: {
        ...result.rows[0],
        currency: "FCFA",
        seller_name: result.rows[0].seller_name ?? "Vendeur",
        seller_phone: result.rows[0].seller_phone ?? "",
        whatsapp_phone: result.rows[0].seller_phone ?? "",
      },
    });
  } catch (error) {
    return next(error);
  }
};
