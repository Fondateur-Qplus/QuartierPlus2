import { Router } from "express";
import {
  createTransaction,
  getTransactionStatus,
  handleFedaPayWebhook,
  listSponsoredPins,
} from "../controllers/paymentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/fedapay-webhook", handleFedaPayWebhook);
router.post("/transactions", authMiddleware, createTransaction);
router.get("/transactions/:id", authMiddleware, getTransactionStatus);
router.get("/sponsored-pins", authMiddleware, listSponsoredPins);

export default router;
