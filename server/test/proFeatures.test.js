import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";

const { pool } = await import("../db/pool.js");
const {
  createFlashSale,
  getSyndicWall,
} = await import("../controllers/proFeatureController.js");

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

test("flash sale creation rejects invalid data before database access", async () => {
  const originalQuery = pool.query;
  pool.query = async () => {
    throw new Error("Invalid flash sale input must not reach the database.");
  };
  const response = createResponse();
  try {
    await createFlashSale(
      {
        body: {
          title: "Promotion",
          discount_percent: 0,
          latitude: 6.3,
          longitude: 2.4,
        },
        auth: { userId: "user-1" },
      },
      response,
      (error) => { throw error; },
    );
    assert.equal(response.statusCode, 400);
  } finally {
    pool.query = originalQuery;
  }
});

test("Syndic wall is inaccessible without an administered residence membership", async () => {
  const originalQuery = pool.query;
  let queryCount = 0;
  pool.query = async (sql, params) => {
    queryCount += 1;
    assert.match(sql, /JOIN residence_members/);
    assert.deepEqual(params, ["user-1", null]);
    return { rows: [], rowCount: 0 };
  };
  const response = createResponse();
  try {
    await getSyndicWall(
      { auth: { userId: "user-1" }, query: {} },
      response,
      (error) => { throw error; },
    );
    assert.equal(response.statusCode, 403);
    assert.equal(queryCount, 1);
  } finally {
    pool.query = originalQuery;
  }
});
