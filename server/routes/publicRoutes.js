import { Router } from "express";
import {
  listPublicMarketplace,
} from "../controllers/publicController.js";

const router = Router();

router.get("/marketplace", listPublicMarketplace);

export default router;
