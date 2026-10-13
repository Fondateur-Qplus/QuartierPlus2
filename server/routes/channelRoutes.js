import { Router } from "express";
import {
  createChannelMessage,
  listChannelMessages,
} from "../controllers/channelController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/:channelId/messages", authMiddleware, listChannelMessages);
router.post("/:channelId/messages", authMiddleware, createChannelMessage);

export default router;