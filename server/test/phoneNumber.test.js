import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePhoneNumberE164 } from "../services/phoneNumber.js";

test("normalizes international phone numbers to E.164", () => {
  assert.equal(normalizePhoneNumberE164("+226 56 11 95 67"), "+22656119567");
  assert.equal(normalizePhoneNumberE164("0022656119567"), "+22656119567");
});

test("rejects numbers without an international country calling code", () => {
  assert.equal(normalizePhoneNumberE164("56 11 95 67"), null);
  assert.equal(normalizePhoneNumberE164("+999123456789"), null);
});
