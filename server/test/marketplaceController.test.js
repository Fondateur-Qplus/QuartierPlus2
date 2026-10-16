import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-for-jwt";
process.env.CLOUDINARY_CLOUD_NAME = "quartierplus-test";
process.env.CLOUDINARY_API_KEY = "test-api-key";
process.env.CLOUDINARY_API_SECRET = "test-api-secret";
process.env.DOTENV_CONFIG_PATH = "/dev/null";

const { createMarketplaceItem } = await import(
  "../controllers/marketplaceController.js"
);
const { pool } = await import("../db/pool.js");

const USER_ID = "1b490a29-02dd-44ad-8c9f-81d9cadc0001";

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

test("marketplace validation reports each invalid field in the mobile contract", async (context) => {
  context.mock.method(pool, "query", async () => {
    throw new Error("Invalid listings must not be inserted.");
  });
  const response = createResponse();

  await createMarketplaceItem(
    {
      auth: { userId: USER_ID },
      body: {
        title: "",
        description: "Chez wilo",
        category: "Vêtements",
        item_type: "listing",
        is_free: false,
        price: 0,
        currency: "FCFA",
        location: { latitude: 91, longitude: -1 },
      },
    },
    response,
    (error) => {
      throw error;
    },
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.code, "VALIDATION_ERROR");
  assert.deepEqual(
    response.payload.errors.map(({ field }) => field),
    ["title", "price", "location.latitude"],
  );
  assert.ok(response.payload.errors.every(({ message }) => message.length > 0));
});

test("marketplace accepts a free WebP listing with a French category and description", async (context) => {
  context.mock.method(pool, "query", async (statement, values) => {
    assert.match(statement, /INSERT INTO marketplace_items/);
    assert.deepEqual(values.slice(1, 8), [
      "Manteau",
      "Chez wilo",
      0,
      "Vêtements",
      "listing",
      "https://res.cloudinary.com/quartierplus-test/image/upload/photo.webp",
      12.345,
    ]);
    return {
      rowCount: 1,
      rows: [
        {
          id: "2b490a29-02dd-44ad-8c9f-81d9cadc0002",
          title: "Manteau",
          description: "Chez wilo",
          price: 0,
          is_free: true,
          category: "Vêtements",
          item_type: "listing",
          image_url:
            "https://res.cloudinary.com/quartierplus-test/image/upload/photo.webp",
          seller_name: "Voisin",
          seller_phone: "",
        },
      ],
    };
  });
  context.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        public_id: `${USER_ID}_photo`,
        secure_url:
          "https://res.cloudinary.com/quartierplus-test/image/upload/photo.webp",
        format: "webp",
        bytes: 120_000,
      };
    },
  }));
  const response = createResponse();

  await createMarketplaceItem(
    {
      auth: { userId: USER_ID },
      body: {
        title: "Manteau",
        description: "Chez wilo",
        category: "Vêtements",
        item_type: "listing",
        is_free: true,
        price: 0,
        currency: "FCFA",
        location: { latitude: 12.345, longitude: -1.234 },
        media_public_id: `${USER_ID}_photo`,
      },
    },
    response,
    (error) => {
      throw error;
    },
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.item.is_free, true);
});

test("Made in publication requires and stores its country of origin", async (context) => {
  let receivedValues;
  context.mock.method(pool, "query", async (statement, values) => {
    assert.match(statement, /country_of_origin/);
    receivedValues = values;
    return {
      rowCount: 1,
      rows: [{
        id: "2b490a29-02dd-44ad-8c9f-81d9cadc0003",
        title: "Panier local",
        description: "Fabriqué ici",
        price: 0,
        is_free: true,
        category: "Alimentation",
        item_type: "local",
        country_of_origin: "BF",
      }],
    };
  });
  const response = createResponse();
  await createMarketplaceItem(
    {
      auth: { userId: USER_ID },
      body: {
        title: "Panier local",
        description: "Fabriqué ici",
        category: "Alimentation",
        item_type: "local",
        is_free: true,
        price: 0,
        currency: "FCFA",
        country_code: "BF",
        country_of_origin: "bf",
        location: { latitude: 12.345, longitude: -1.234 },
      },
    },
    response,
    (error) => {
      throw error;
    },
  );
  assert.equal(response.statusCode, 201);
  assert.equal(receivedValues[10], "BF");
});
