import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";
process.env.FEDAPAY_SECRET_KEY = "sk_test_fedapay";
process.env.FEDAPAY_ENVIRONMENT = "sandbox";
process.env.FEDAPAY_WEBHOOK_SECRET = "webhook-test-secret";
process.env.TICKET_QR_SECRET =
  "ticket-signing-secret-for-events-tests-at-least-32";

const { pool } = await import("../db/pool.js");
const {
  createEvent,
  scanTicket,
} = await import("../controllers/eventsController.js");
const {
  createTicketSignature,
  isValidTicketSignature,
} = await import("../services/tickets.service.js");
const { handleFedaPayWebhook } = await import("../controllers/paymentController.js");

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

test("ticket QR signatures are unique to ticket and user and reject tampering", () => {
  const signature = createTicketSignature(
    "18e33442-289d-42f1-b8af-e9bdf1e3ee5a",
    "8ad35c27-1508-4a1c-9560-f45e0a18c64c",
  );
  assert.equal(signature.length, 64);
  assert.equal(
    isValidTicketSignature(
      "18e33442-289d-42f1-b8af-e9bdf1e3ee5a",
      "8ad35c27-1508-4a1c-9560-f45e0a18c64c",
      signature,
    ),
    true,
  );
  assert.equal(
    isValidTicketSignature(
      "18e33442-289d-42f1-b8af-e9bdf1e3ee5a",
      "different-user",
      signature,
    ),
    false,
  );
  assert.equal(
    isValidTicketSignature(
      "18e33442-289d-42f1-b8af-e9bdf1e3ee5a",
      "8ad35c27-1508-4a1c-9560-f45e0a18c64c",
      `${signature.slice(0, -1)}0`,
    ),
    false,
  );
});

test("ticket scanner rejects malformed QR payloads without database access", async () => {
  const originalConnect = pool.connect;
  pool.connect = async () => {
    throw new Error("Malformed QR payload must not access the database.");
  };
  const response = createResponse();
  try {
    await scanTicket(
      {
        body: { qr_payload: "not-a-ticket" },
        auth: { userId: "organizer-1" },
      },
      response,
      (error) => { throw error; },
    );
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, { status: "INVALID_TICKET" });
  } finally {
    pool.connect = originalConnect;
  }
});

test("event creation rejects invalid capacity or date before writing", async () => {
  const originalQuery = pool.query;
  pool.query = async () => {
    throw new Error("Invalid event input must not reach the database.");
  };
  const response = createResponse();
  try {
    await createEvent(
      {
        auth: { userId: "organizer-1" },
        body: {
          title: "Community day",
          location_name: "Main square",
          event_date: "2020-01-01T10:00:00.000Z",
          ticket_price: 0,
          total_capacity: 20,
        },
      },
      response,
      (error) => { throw error; },
    );
    assert.equal(response.statusCode, 400);
  } finally {
    pool.query = originalQuery;
  }
});

test("ticket scan consumes a valid organizer-owned ticket once", async () => {
  const originalConnect = pool.connect;
  const ticketId = "18e33442-289d-42f1-b8af-e9bdf1e3ee5a";
  const eventId = "953b2d12-0638-48d2-98ec-4b8921c5dc3d";
  const userId = "8ad35c27-1508-4a1c-9560-f45e0a18c64c";
  const signature = createTicketSignature(ticketId, userId);
  let status = "VALID";
  let entryCount = 0;
  const statements = [];
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("SELECT t.id, t.event_id")) {
        return {
          rows: [{
            id: ticketId,
            event_id: eventId,
            user_id: userId,
            status,
            qr_code_signature: signature,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE tickets SET status = 'USED'")) {
        status = "USED";
        entryCount += 1;
        return { rows: [{ id: ticketId, scanned_at: "2026-10-04T00:00:00.000Z" }], rowCount: 1 };
      }
      if (sql.includes("SELECT COUNT(*)::int AS checked_in_count")) {
        return {
          rows: [{ checked_in_count: entryCount, total_capacity: 50, title: "Event" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  pool.connect = async () => connection;
  try {
    const response = createResponse();
    const request = {
      auth: { userId: "organizer-1" },
      body: { event_id: eventId, qr_payload: `${ticketId}.${signature}` },
    };
    await scanTicket(request, response, (error) => { throw error; });
    assert.equal(response.payload.status, "SUCCESS");
    assert.equal(response.payload.checked_in_count, 1);

    status = "USED";
    await scanTicket(request, response, (error) => { throw error; });
    assert.equal(response.payload.status, "ALREADY_USED");
    assert.equal(entryCount, 1);
  } finally {
    pool.connect = originalConnect;
  }
});

test("paid ticket webhook issues one ticket only after verified payment", async () => {
  const originalFetch = globalThis.fetch;
  const originalConnect = pool.connect;
  const statements = [];
  let paymentStatus = "PENDING";
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("FROM transactions WHERE fedapay_tx_id")) {
        return {
          rows: [{
            id: "local-ticket-transaction",
            user_id: "8ad35c27-1508-4a1c-9560-f45e0a18c64c",
            amount: 2500,
            currency: "XOF",
            status: paymentStatus,
            payment_type: "TICKET",
            metadata: {
              event_id: "18e33442-289d-42f1-b8af-e9bdf1e3ee5a",
              reservation_id: "953b2d12-0638-48d2-98ec-4b8921c5dc3d",
            },
          }],
        };
      }
      if (sql.includes("FROM event_ticket_reservations")) {
        return {
          rows: [{ id: "reservation-1", status: "PENDING" }],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE events")) {
        return { rows: [{ id: "event-1" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO tickets")) {
        return { rows: [{ id: "ticket-1" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE transactions SET status = 'APPROVED'")) {
        paymentStatus = "APPROVED";
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  pool.connect = async () => connection;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        id: 456,
        status: "approved",
        amount: 2500,
        currency: { iso: "XOF" },
      };
    },
  });
  const response = createResponse();
  const body = { name: "transaction.approved", entity: { id: 456 } };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = createHmac("sha256", process.env.FEDAPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const request = {
    body,
    rawBody,
    get(name) {
      return name === "x-fedapay-signature"
        ? `sha256=${signature}`
        : undefined;
    },
  };
  try {
    await handleFedaPayWebhook(request, response, (error) => { throw error; });
    assert.equal(response.statusCode, 200);
    assert.equal(
      statements.filter((sql) => sql.includes("INSERT INTO tickets")).length,
      1,
    );
    assert.equal(
      statements.filter((sql) => sql.includes("UPDATE events")).length,
      1,
    );
    assert.ok(statements.some((sql) => sql.includes("UPDATE event_ticket_reservations")));
    const statementCount = statements.length;
    await handleFedaPayWebhook(request, response, (error) => { throw error; });
    assert.equal(
      statements.filter((sql) => sql.includes("INSERT INTO tickets")).length,
      1,
    );
    assert.ok(statements.length > statementCount);
  } finally {
    globalThis.fetch = originalFetch;
    pool.connect = originalConnect;
  }
});
