import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";
process.env.IS_PROMO_FREE_ACCESS = "true";

const { pool } = await import("../db/pool.js");
const { proRoleGuard } = await import("../middlewares/proRoleGuard.js");
const { getMySubscription } = await import("../controllers/proController.js");

test("promo mode grants each Pro dashboard without querying subscriptions", async () => {
  const originalQuery = pool.query;
  pool.query = async () => {
    throw new Error("Promo access should not require a subscription query.");
  };
  try {
    for (const plan of ["ALLIANCE_PRO", "SYNDIC", "TOWN_HALL", "SECURITY_AGENT"]) {
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
      const request = { auth: { userId: "citizen-1" } };
      let nextCalled = false;
      await proRoleGuard(plan)(
        request,
        response,
        () => {
          nextCalled = true;
        },
      );
      assert.equal(nextCalled, true);
      assert.equal(response.statusCode, 200);
      assert.equal(request.proSubscription.plan_type, plan);
    }
  } finally {
    pool.query = originalQuery;
  }
});

test("promo subscription endpoint returns an Alliance Pro preview and flag", async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [], rowCount: 0 });
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
  try {
    await getMySubscription(
      { auth: { userId: "citizen-1" } },
      response,
      (error) => { throw error; },
    );
    assert.equal(response.payload.promo_free_access, true);
    assert.equal(response.payload.subscription.plan_type, "ALLIANCE_PRO");
    assert.equal(response.payload.subscription.status, "ACTIVE");
  } finally {
    pool.query = originalQuery;
  }
});
