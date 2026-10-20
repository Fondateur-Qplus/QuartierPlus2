import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = resolve(serverRoot, "../mobile/src");
const serverEntry = await readFile(join(serverRoot, "index.js"), "utf8");

const filesBelow = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const descendants = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? filesBelow(path)
        : [path];
    }),
  );
  return descendants.flat();
};

const routeImports = new Map(
  [...serverEntry.matchAll(/import\s+(\w+)\s+from\s+["']\.\/routes\/([^"']+)\.js["']/g)]
    .map(([, name, file]) => [name, `${file}.js`]),
);

const routes = [];
for (const match of serverEntry.matchAll(
  /app\.(get|post|put|patch|delete)\(\s*(\[[\s\S]*?\]|["'][^"']+["'])/g,
)) {
  const [, method, paths] = match;
  for (const path of paths.matchAll(/["']([^"']+)["']/g)) {
    routes.push({ method: method.toUpperCase(), path: path[1] });
  }
}
for (const match of serverEntry.matchAll(
  /app\.use\(\s*(\[[\s\S]*?\]|["'][^"']+["'])\s*,\s*(\w+)\s*\)/g,
)) {
  const [, prefixes, importedRouter] = match;
  const routeFile = routeImports.get(importedRouter);
  if (!routeFile) continue;
  const source = await readFile(join(serverRoot, "routes", routeFile), "utf8");
  const basePaths = [...prefixes.matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
  for (const route of source.matchAll(
    /router\.(get|post|put|patch|delete)\(\s*(\[[\s\S]*?\]|["'`][^"'`]+["'`])/g,
  )) {
    const [, method, routePaths] = route;
    for (const path of routePaths.matchAll(/["'`]([^"'`]+)["'`]/g)) {
      for (const prefix of basePaths) {
        routes.push({
          method: method.toUpperCase(),
          path: `${prefix}${path[1] === "/" ? "" : path[1]}`,
        });
      }
    }
  }
}

const mobileFiles = await filesBelow(mobileRoot);
const mobilePaths = new Set();
for (const file of mobileFiles.filter((path) => /\.(ts|tsx|js|jsx)$/.test(path))) {
  const source = (await readFile(file, "utf8")).replace(/\$\{[^{}]*\}/g, ":id");
  for (const match of source.matchAll(/\/(?:api\/)?v1\/[A-Za-z0-9_:/.-]*/g)) {
    const path = match[0].replace(/\/+$/, "") || "/";
    if (path) mobilePaths.add(path);
  }
}

const routePatternMatches = (routePath, requestedPath) => {
  const routeParts = routePath.split("/").filter(Boolean);
  const requestedParts = requestedPath.split("/").filter(Boolean);
  return (
    routeParts.length === requestedParts.length &&
    routeParts.every(
      (part, index) =>
        part.startsWith(":") || part === requestedParts[index],
    )
  );
};

test("every versioned endpoint referenced by mobile is mounted by the server", () => {
  const missing = [...mobilePaths].filter(
    (path) => !routes.some((route) => routePatternMatches(route.path, path)),
  );
  assert.deepEqual(
    missing.sort(),
    [],
    `Mobile endpoints absent from server routes:\n${missing
      .sort()
      .map((path) => `- ${path}`)
      .join("\n")}`,
  );
});

test("mobile endpoint inventory includes the reviewed surfaces", () => {
  const expected = [
    "/v1/feed",
    "/v1/sos/alerts",
    "/v1/public/marketplace",
    "/v1/channels/:id/messages",
    "/v1/conversations",
    "/v1/map/markers",
  ];
  for (const path of expected) {
    assert.ok(
      [...mobilePaths].some((mobilePath) => routePatternMatches(path, mobilePath)),
      `Expected mobile path missing from scan: ${path}`,
    );
  }
});

test("the public FedaPay webhook route is mounted under the API prefix", () => {
  assert.ok(
    routes.some(
      (route) =>
        route.method === "POST" &&
        route.path === "/api/v1/payments/fedapay-webhook",
    ),
  );
});
