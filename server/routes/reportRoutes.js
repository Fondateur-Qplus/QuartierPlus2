import { Router } from "express";
import { createReport } from "../controllers/reportController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.post("/", authMiddleware, createReport);

export default router;
