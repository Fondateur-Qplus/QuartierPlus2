import assert from "node:assert/strict";
import { test } from "node:test";
import { isOtpTestPhone } from "../config/otp.js";

const configuration = {
  nodeEnv: "development",
  otpTestMode: true,
  otpTestAllowlist: ["+22670000000", "+33612345678"],
};

test("fixed OTP is enabled only for an allowlisted phone in non-production", () => {
  assert.equal(isOtpTestPhone("+22670000000", configuration), true);
  assert.equal(isOtpTestPhone("+2250700000000", configuration), false);
  assert.equal(
    isOtpTestPhone("+22670000000", { ...configuration, nodeEnv: "production" }),
    false,
  );
  assert.equal(
    isOtpTestPhone("+22670000000", { ...configuration, otpTestMode: false }),
    false,
  );
});
