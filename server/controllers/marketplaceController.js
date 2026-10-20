import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import {
  deleteCloudinaryAsset,
  getCloudinaryAsset,
  hasGpsMetadata,
  isCloudinaryPublicIdOwnedByUser,
} from "../services/cloudinary.js";

const ITEM_TYPES = new Set(["listing", "local", "service"]);

const validateImage = async (userId, publicId) => {
  if (
    typeof publicId !== "string" ||
    publicId.length > 255 ||
    !isCloudinaryPublicIdOwnedByUser(userId, publicId)
  ) {
    return { error: "La photo téléversée ne vous appartient pas." };
  }
  const image = await getCloudinaryAsset("image", publicId);
  if (!image || image.public_id !== publicId) {
    console.error("Cloudinary public ID mismatch:", {
      expectedPublicId: publicId,
      receivedPublicId: image?.public_id ?? null,
    });
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
  const countryCode =
    typeof request.body?.country_code === "string"
      ? request.body.country_code.trim().toUpperCase()
      : null;
  const countryOfOrigin =
    typeof request.body?.country_of_origin === "string"
      ? request.body.country_of_origin.trim().toUpperCase()
      : null;
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
  const errors = [];
  const addError = (field, message) => errors.push({ field, message });
  if (!title) addError("title", "Le titre est obligatoire.");
  else if (title.length > 150) {
    addError("title", "Le titre ne peut pas dépasser 150 caractères.");
  }
  if (description.length > 5000) {
    addError("description", "La description ne peut pas dépasser 5 000 caractères.");
  }
  if (!category) addError("category", "La catégorie est obligatoire.");
  if (!ITEM_TYPES.has(itemType)) {
    addError("item_type", "Choisissez une portée d'annonce valide.");
  }
  if (
    itemType === "local" &&
    (!countryOfOrigin || !/^[A-Z]{2,3}$/.test(countryOfOrigin))
  ) {
    addError("country_of_origin", "Le pays d'origine est obligatoire.");
  } else if (
    countryOfOrigin !== null &&
    !/^[A-Z]{2,3}$/.test(countryOfOrigin)
  ) {
    addError("country_of_origin", "Choisissez un pays d'origine valide.");
  }
  if (!isFree && !Number.isFinite(price)) {
    addError("price", "Saisissez un prix valide ou choisissez Gratuit / Don.");
  } else if (!isFree && price <= 0) {
    addError("price", "Le prix doit être supérieur à zéro, sauf pour un don.");
  } else if (isFree && request.body?.price !== undefined && Number(request.body.price) !== 0) {
    addError("price", "Le prix d'une annonce gratuite doit être égal à zéro.");
  }
  if (
    request.body?.currency !== undefined &&
    request.body.currency !== "FCFA"
  ) {
    addError("currency", "La devise acceptée est le FCFA.");
  }
  if (
    countryCode !== null &&
    !/^[A-Z]{2,3}$/.test(countryCode)
  ) {
    addError("country_code", "Choisissez un code pays valide.");
  }
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    addError("location.latitude", "La latitude doit être comprise entre -90 et 90.");
  }
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    addError("location.longitude", "La longitude doit être comprise entre -180 et 180.");
  }
  if (errors.length) {
    return response.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Vérifiez les champs de votre annonce.",
      errors,
    });
  }
  try {
    let imageUrl = null;
    if (mediaPublicId !== undefined) {
      const verified = await validateImage(request.auth.userId, mediaPublicId);
      if (verified.error) {
        return response.status(400).json({
          code: "VALIDATION_ERROR",
          message: "La photo ne peut pas être utilisée.",
          errors: [{ field: "media_public_id", message: verified.error }],
        });
      }
      imageUrl = verified.image.secure_url;
    }
    const result = await pool.query(
      `INSERT INTO marketplace_items
         (seller_id, title, description, price_fcfa, category, item_type,
          image_urls, location, contact_phone, whatsapp_phone, country_of_origin)
       SELECT profile.id, $2, $3, $4, $5, $6,
              CASE WHEN $7::text IS NULL THEN NULL ELSE ARRAY[$7::text] END,
              ST_SetSRID(ST_MakePoint($9, $8), 4326),
              profile.phone_number, profile.phone_number, $11
       FROM users AS profile
       WHERE profile.id = $1
         AND ($10::text IS NULL OR profile.country_code = $10)
       RETURNING id, title, description, price_fcfa AS price,
                 price_fcfa = 0 AS is_free, category, item_type,
                 image_urls[1] AS image_url, country_of_origin, created_at,
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
        countryCode,
        countryOfOrigin,
      ],
    );
    if (!result.rowCount) {
      if (countryCode) {
        const seller = await pool.query(
          "SELECT country_code FROM users WHERE id = $1",
          [request.auth.userId],
        );
        if (
          seller.rowCount &&
          seller.rows[0].country_code !== countryCode
        ) {
          return response.status(400).json({
            code: "VALIDATION_ERROR",
            message: "Le pays de l'annonce doit correspondre au pays du compte.",
            errors: [{
              field: "country_code",
              message: "Le pays sélectionné ne correspond pas à votre compte.",
            }],
          });
        }
      }
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
