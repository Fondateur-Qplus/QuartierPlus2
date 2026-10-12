import express from "express";
import { env } from "./config/env.js";
import { getMonetizationConfig } from "./controllers/eventsController.js";
import { pool } from "./db/pool.js";
import authRoutes from "./routes/authRoutes.js";
import eventsRoutes from "./routes/eventsRoutes.js";
import livekitRoutes from "./routes/livekitRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import postsRoutes from "./routes/postsRoutes.js";
import proRoutes from "./routes/proRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import sosRoutes from "./routes/sosRoutes.js";
import ticketsRoutes from "./routes/ticketsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { createServer } from "node:http";
import { attachSocketServer } from "./sockets/index.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.get("/health", async (_request, response, next) => {
  try {
    await pool.query("SELECT 1");
    return response.status(200).json({ status: "ok" });
  } catch (error) {
    return next(error);
  }
});
app.get(
  ["/api/v1/monetization/config", "/v1/monetization/config"],
  getMonetizationConfig,
);
app.use(["/api/v1/public", "/v1/public"], publicRoutes);
app.use(["/api/v1", "/v1"], postsRoutes);
app.use(["/api/v1/sos", "/v1/sos"], sosRoutes);
app.use(["/api/v1/auth", "/v1/auth"], authRoutes);
app.use(["/api/v1/events", "/v1/events"], eventsRoutes);
app.use(["/api/v1/livekit", "/v1/livekit"], livekitRoutes);
app.use(["/api/v1/payments", "/v1/payments"], paymentRoutes);
app.use(["/api/v1/pro", "/v1/pro"], proRoutes);
app.use(["/api/v1/tickets", "/v1/tickets"], ticketsRoutes);
app.use(["/api/v1/users", "/v1/users"], userRoutes);
app.use((error, _request, response, _next) => {
  console.error("Unhandled API error:", error);
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  return response.status(status).json({
    error:
      status === 500
        ? "Une erreur interne est survenue."
        : error.message,
  });
});

const server = createServer(app);
const io = attachSocketServer(server);

server.listen(env.port, () => {
  console.log(`QuartierPlus API listening on port ${env.port}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received; closing API server.`);
  io.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
