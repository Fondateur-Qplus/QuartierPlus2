import { Router } from "express";
import { listMapMarkers } from "../controllers/mapController.js";

const router = Router();
router.get("/markers", listMapMarkers);

export default router;
