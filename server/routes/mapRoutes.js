import { Router } from "express";
import {
  confirmMapMarker,
  createMapMarker,
  listMapMarkers,
} from "../controllers/mapController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.get("/markers", authMiddleware, listMapMarkers);
router.post("/markers", authMiddleware, createMapMarker);
router.post("/markers/:id/confirm", authMiddleware, confirmMapMarker);

export default router;
