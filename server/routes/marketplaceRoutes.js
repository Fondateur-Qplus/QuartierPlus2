import { Router } from "express";
import { createMarketplaceItem } from "../controllers/marketplaceController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.post("/items", authMiddleware, createMarketplaceItem);

export default router;
