import { Router } from "express";
import { createLiveKitToken } from "../controllers/livekitController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/token", authMiddleware, createLiveKitToken);

export default router;
