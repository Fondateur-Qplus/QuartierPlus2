import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://localhost/quartierplus_test";
process.env.JWT_SECRET ??=
  "unit-test-secret-that-is-longer-than-thirty-two-characters";

const { emergencyTypeForPayload, radiusForLevel } = await import(
  "../sockets/sosHandler.js"
);

test("SOS escalation levels map to the required PostGIS broadcast radii", () => {
  assert.equal(radiusForLevel(1), 3);
  assert.equal(radiusForLevel(2), 10);
  assert.equal(radiusForLevel(3), 30);
  assert.equal(radiusForLevel(0), null);
  assert.equal(radiusForLevel(4), null);
});

test("SOS emergency type is validated while legacy events remain compatible", () => {
  assert.equal(emergencyTypeForPayload("MEDICAL"), "MEDICAL");
  assert.equal(emergencyTypeForPayload("SECURITY"), "SECURITY");
  assert.equal(emergencyTypeForPayload("FIRE"), "FIRE");
  assert.equal(emergencyTypeForPayload(undefined), "OTHER");
  assert.equal(emergencyTypeForPayload("SOS"), null);
  assert.equal(emergencyTypeForPayload("medical"), null);
});
