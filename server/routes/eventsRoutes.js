import { Router } from "express";
import {
  buyEventTicket,
  createEvent,
  getEvent,
  listEvents,
  listOrganizerEvents,
} from "../controllers/eventsController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { proRoleGuard } from "../middlewares/proRoleGuard.js";

const router = Router();

router.get("/", listEvents);
router.get("/mine", authMiddleware, listOrganizerEvents);
router.get("/:id", getEvent);
router.post("/", authMiddleware, proRoleGuard("ALLIANCE_PRO"), createEvent);
router.post("/:id/buy-ticket", authMiddleware, buyEventTicket);

export default router;
