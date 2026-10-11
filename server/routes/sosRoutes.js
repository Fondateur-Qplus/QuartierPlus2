import { Router } from "express";
import { listNearbyAlerts } from "../controllers/publicController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/alerts", authMiddleware, listNearbyAlerts);

export default router;
