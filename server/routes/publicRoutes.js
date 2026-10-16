import { Router } from "express";
import {
  getMediaStatus,
  getPublicConfig,
  listPublicMarketplace,
} from "../controllers/publicController.js";

const router = Router();

router.get("/marketplace", listPublicMarketplace);
router.get("/config", getPublicConfig);
router.get("/media-status", getMediaStatus);

export default router;
