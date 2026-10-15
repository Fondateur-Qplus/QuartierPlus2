import { Router } from "express";
import {
  createPrivateMessage,
  listConversations,
  listPrivateMessages,
} from "../controllers/conversationController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.use(authMiddleware);
router.get("/", listConversations);
router.get("/:conversationId/messages", listPrivateMessages);
router.post("/:conversationId/messages", createPrivateMessage);

export default router;
