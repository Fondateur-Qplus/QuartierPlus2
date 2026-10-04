import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export const createTicketSignature = (ticketId, userId) =>
  createHmac("sha256", env.ticketQrSecret)
    .update(`${ticketId}${userId}`)
    .digest("hex");

export const isValidTicketSignature = (ticketId, userId, suppliedSignature) => {
  if (
    typeof suppliedSignature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(suppliedSignature)
  ) {
    return false;
  }
  const expected = Buffer.from(createTicketSignature(ticketId, userId), "hex");
  const supplied = Buffer.from(suppliedSignature, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
};

export const issueTicket = async (connection, eventId, userId) => {
  const event = await connection.query(
    `UPDATE events
     SET tickets_sold = tickets_sold + 1
     WHERE id = $1 AND tickets_sold < total_capacity
     RETURNING id`,
    [eventId],
  );
  if (!event.rowCount) {
    throw new Error("La capacité de cet événement est atteinte.");
  }

  const ticketId = randomUUID();
  const signature = createTicketSignature(ticketId, userId);
  const ticket = await connection.query(
    `INSERT INTO tickets (id, event_id, user_id, qr_code_signature)
     VALUES ($1, $2, $3, $4)
     RETURNING id, event_id, user_id, qr_code_signature, status, purchased_at`,
    [ticketId, eventId, userId, signature],
  );
  return ticket.rows[0];
};
