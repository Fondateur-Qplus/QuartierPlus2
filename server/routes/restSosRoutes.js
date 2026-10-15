import { Router } from "express";
import { createSosAlert } from "../controllers/restSosController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.post("/", authMiddleware, createSosAlert);

export default router;
