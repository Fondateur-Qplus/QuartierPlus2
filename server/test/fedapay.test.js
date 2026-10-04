import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";
process.env.FEDAPAY_SECRET_KEY = "sk_test_fedapay";
process.env.FEDAPAY_ENVIRONMENT = "sandbox";
process.env.FEDAPAY_WEBHOOK_SECRET = "webhook-test-secret";

const { pool } = await import("../db/pool.js");
const { createFedaPayTransaction } = await import("../services/fedapay.js");
const {
  createTransaction,
  handleFedaPayWebhook,
} = await import("../controllers/paymentController.js");

test("FedaPay creates an XOF transaction and returns its hosted payment URL", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const payload =
      requests.length === 1
        ? { "v1/transaction": { id: 12345, status: "pending" } }
        : { token: "fedapay-token", url: "https://checkout.fedapay.test/payment-token" };
    return { ok: true, async json() { return payload; } };
  };
  try {
    const result = await createFedaPayTransaction({
      amount: 5000,
      description: "Alliance Pro - 30 jours",
      customer: { firstname: "Awa", lastname: "Diallo" },
    });
    assert.equal(result.transaction.id, 12345);
    assert.equal(result.paymentUrl, "https://checkout.fedapay.test/payment-token");
    assert.equal(requests[0].url, "https://sandbox-api.fedapay.com/v1/transactions");
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      description: "Alliance Pro - 30 jours",
      amount: 5000,
      currency: { iso: "XOF" },
      customer: { firstname: "Awa", lastname: "Diallo" },
    });
    assert.match(requests[1].url, /\/v1\/transactions\/12345\/token$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transaction creation rejects unsupported offer types before database access", async () => {
  const response = {
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
  };
  await createTransaction(
    { body: { payment_type: "UNSUPPORTED" }, auth: { userId: "user-1" } },
    response,
    (error) => { throw error; },
  );
  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.error, "Offre de paiement invalide.");
});

test("FedaPay checkout accepts every Pro plan at its server-defined price", async () => {
  const originalFetch = globalThis.fetch;
  const originalQuery = pool.query;
  const fedapayBodies = [];
  const storedPayments = [];
  let transactionId = 100;
  pool.query = async (sql, values) => {
    if (sql.includes("FROM users u")) {
      return {
        rows: [{
          full_name: "Awa Diallo",
          email: "awa@example.test",
          phone_number: "97000000",
          country_code: "BJ",
          phone_prefix: "229",
        }],
      };
    }
    if (sql.includes("INSERT INTO transactions")) {
      storedPayments.push(values);
      return { rows: [{ id: `local-${values[3]}`, status: "PENDING" }] };
    }
    throw new Error(`Unexpected query in checkout test: ${sql}`);
  };
  globalThis.fetch = async (url, options) => {
    if (!url.endsWith("/token")) {
      fedapayBodies.push(JSON.parse(options.body));
      transactionId += 1;
      return {
        ok: true,
        async json() {
          return { "v1/transaction": { id: transactionId, status: "pending" } };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { token: { url: "https://checkout.fedapay.test/payment-token" } };
      },
    };
  };

  const plans = [
    ["ALLIANCE_PRO", 5000],
    ["SYNDIC", 2500],
    ["TOWN_HALL", 75000],
    ["SECURITY_AGENT", 50000],
  ];
  try {
    for (const [paymentType, amount] of plans) {
      const response = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.payload = payload;
          return this;
        },
      };
      await createTransaction(
        { body: { payment_type: paymentType }, auth: { userId: "user-1" } },
        response,
        (error) => { throw error; },
      );
      assert.equal(response.statusCode, 201);
    }
    assert.deepEqual(
      fedapayBodies.map(({ amount }) => amount),
      plans.map(([, amount]) => amount),
    );
    assert.deepEqual(
      storedPayments.map((values) => [values[2], values[3]]),
      plans.map(([type, amount]) => [amount, type]),
    );
  } finally {
    globalThis.fetch = originalFetch;
    pool.query = originalQuery;
  }
});

test("webhook rejects requests without the configured FedaPay custom header", async () => {
  const response = {
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
  };
  await handleFedaPayWebhook(
    {
      get() {
        return "wrong-secret";
      },
      body: { name: "transaction.approved", entity: { id: 123 } },
    },
    response,
    (error) => { throw error; },
  );
  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.error, "Webhook FedaPay non autorisé.");
});

test("approved Alliance Pro webhook activates the subscription and badge once", async () => {
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
            id: "local-transaction",
            user_id: "user-1",
            amount: 5000,
            currency: "XOF",
            status: paymentStatus,
            payment_type: "ALLIANCE_PRO",
            metadata: {},
          }],
        };
      }
      if (sql.includes("UPDATE transactions SET status = 'APPROVED'")) {
        paymentStatus = "APPROVED";
      }
      return { rows: [] };
    },
    release() {},
  };
  pool.connect = async () => connection;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        id: 123,
        status: "approved",
        amount: 5000,
        currency: { iso: "XOF" },
      };
    },
  });
  const response = {
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
  };

  try {
    const request = {
      get(name) {
        return name === "x-fedapay-webhook-secret"
          ? process.env.FEDAPAY_WEBHOOK_SECRET
          : undefined;
      },
      body: { name: "transaction.approved", entity: { id: 123 } },
    };
    await handleFedaPayWebhook(request, response, (error) => { throw error; });
    await handleFedaPayWebhook(request, response, (error) => { throw error; });
    assert.equal(response.statusCode, 200);
    assert.equal(
      statements.filter((sql) => sql.includes("INSERT INTO subscriptions")).length,
      1,
    );
    assert.equal(
      statements.filter((sql) => sql.includes("UPDATE users SET badge")).length,
      1,
    );
    assert.equal(statements.at(-1), "COMMIT");
  } finally {
    globalThis.fetch = originalFetch;
    pool.connect = originalConnect;
  }
});
