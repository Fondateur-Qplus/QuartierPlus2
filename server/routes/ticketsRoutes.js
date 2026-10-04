import { Router } from "express";
import {
  listMyTickets,
  scanTicket,
} from "../controllers/eventsController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.use(authMiddleware);
router.get("/my-tickets", listMyTickets);
router.post("/scan", scanTicket);

export default router;
