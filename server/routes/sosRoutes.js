import { Router } from "express";
import {
	assistSosAlert,
	reportSosAlert,
} from "../controllers/sosController.js";
import { listNearbyAlerts } from "../controllers/publicController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/alerts", authMiddleware, listNearbyAlerts);
router.post("/:id/assist", authMiddleware, assistSosAlert);
router.post("/:id/report-fake", authMiddleware, reportSosAlert);

export default router;
