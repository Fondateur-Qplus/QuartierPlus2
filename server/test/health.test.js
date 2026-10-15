import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { API_CONTRACT_VERSION, getHealthPayload, handleHealth } from "../health.js";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("health payload exposes the deployed commit and mobile contract version", async () => {
  process.env.RENDER_GIT_COMMIT = "test-commit";
  assert.deepEqual(getHealthPayload(), {
    status: "ok",
    commit: "test-commit",
    contractVersion: API_CONTRACT_VERSION,
  });

  const mobileContract = await readFile(
    join(serverRoot, "../mobile/src/services/serverContract.ts"),
    "utf8",
  );
  assert.match(
    mobileContract,
    new RegExp(`EXPECTED_API_CONTRACT_VERSION = ${API_CONTRACT_VERSION}`),
  );
});

test("health handler returns before relying on database readiness", () => {
  const response = {
    code: 0,
    payload: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  handleHealth({}, response);
  assert.equal(response.code, 200);
  assert.equal(response.payload.status, "ok");
});
