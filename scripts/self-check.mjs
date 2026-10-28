import assert from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 3055;
const BASE_URL = `http://localhost:${PORT}`;

console.log("🚀 Starting Next.js test server...");
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    ADMIN_PASSKEY: "test_secret_passkey",
    DEPLOY_MODE: "github",
    PORT: String(PORT),
  },
  stdio: "pipe",
});

let serverStarted = false;
server.stdout.on("data", (data) => {
  const msg = data.toString();
  if (msg.includes("Ready") || msg.includes("http://")) {
    serverStarted = true;
  }
});
server.stderr.on("data", (data) => {
  // console.error(data.toString());
});

async function waitForServer(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/list`);
      if (res.status === 401 || res.status === 200) return true;
    } catch {
      // waiting
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Server failed to start in time");
}

async function runTests() {
  try {
    await waitForServer();
    console.log(" Server is ready. Running checks...");

    // Check 1: Unauthorized access without passkey
    console.log("Check 1: Unauthorized request handling...");
    const unauthRes = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      body: new FormData(),
    });
    assert.strictEqual(unauthRes.status, 401, "Expected 401 Unauthorized without passkey");
    console.log(" Passed (401 on missing passkey)");

    // Check 2: Invalid slug validation
    console.log("Check 2: Slug validation...");
    const formBadSlug = new FormData();
    formBadSlug.append("passkey", "test_secret_passkey");
    formBadSlug.append("slug", "../malicious/path");
    formBadSlug.append("file", new Blob(["<h1>Hi</h1>"], { type: "text/html" }), "index.html");

    const badSlugRes = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      body: formBadSlug,
    });
    assert.strictEqual(badSlugRes.status, 400, "Expected 400 Bad Request on invalid slug");
    console.log(" Passed (400 on malicious slug)");

    // Check 3: Invalid file format
    console.log("Check 3: File type validation...");
    const formBadFile = new FormData();
    formBadFile.append("passkey", "test_secret_passkey");
    formBadFile.append("slug", "valid-slug");
    formBadFile.append("file", new Blob(["console.log(1)"], { type: "text/javascript" }), "script.js");

    const badFileRes = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      body: formBadFile,
    });
    assert.strictEqual(badFileRes.status, 400, "Expected 400 Bad Request on non-html file");
    console.log(" Passed (400 on non-HTML file)");

    // Check 4: Valid Upload & Local File Persistence
    console.log("Check 4: Valid static HTML publication...");
    const testHtml = "<!DOCTYPE html><html><body><h1>Diwali Sale 2026</h1></body></html>";
    const formValid = new FormData();
    formValid.append("passkey", "test_secret_passkey");
    formValid.append("slug", "diwali-sale-2026");
    formValid.append("file", new Blob([testHtml], { type: "text/html" }), "index.html");

    const validRes = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      body: formValid,
    });
    const validData = await validRes.json();
    assert.strictEqual(validRes.status, 200, `Expected 200 OK, got: ${JSON.stringify(validData)}`);
    assert.strictEqual(validData.success, true);
    assert.strictEqual(validData.slug, "diwali-sale-2026");
    console.log(" Passed (200 OK, site created)");

    // Check 5: List API returns published site
    console.log("Check 5: List published pages...");
    const listRes = await fetch(`${BASE_URL}/api/list`, {
      headers: { "x-admin-passkey": "test_secret_passkey" },
    });
    const listData = await listRes.json();
    assert.strictEqual(listRes.status, 200);
    assert.ok(listData.sites.some((s) => s.slug === "diwali-sale-2026"), "Published slug should appear in site list");
    console.log(" Passed (Site listed in /api/list)");

    // Check 6: Clean Top-Level Route serving (/:slug)
    console.log("Check 6: Clean top-level route serving (/:slug)...");
    const cleanUrlRes = await fetch(`${BASE_URL}/diwali-sale-2026`);
    assert.strictEqual(cleanUrlRes.status, 200, "Expected 200 OK on top-level slug");
    const cleanHtml = await cleanUrlRes.text();
    assert.ok(cleanHtml.includes("Diwali Sale 2026"), "Top-level route serves uploaded HTML");
    console.log(" Passed (Top-level /:slug serves correct HTML)");

    // Check 7: Subpath Route serving (/sites/:slug)
    console.log("Check 7: Subpath route serving (/sites/:slug)...");
    const subpathRes = await fetch(`${BASE_URL}/sites/diwali-sale-2026`);
    assert.strictEqual(subpathRes.status, 200, "Expected 200 OK on subpath slug");
    const subpathHtml = await subpathRes.text();
    assert.ok(subpathHtml.includes("Diwali Sale 2026"), "Subpath route serves uploaded HTML");
    console.log(" Passed (Subpath /sites/:slug serves correct HTML)");

    console.log("\n ALL 7 VERIFICATION CHECKS PASSED!");
  } finally {
    server.kill("SIGTERM");
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  server.kill("SIGKILL");
  process.exit(1);
});
