import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtempSync, unlinkSync, existsSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.js";
import { createObservatoryServer } from "./server.js";

test("real HTTP and SQLite preserve observations across restart without health-check noise", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "observatory-test-"));
  let database = openDatabase(directory);
  let server;
  const closeServer = async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
  };
  t.after(async () => {
    await closeServer();
    database.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = join(directory, `observations.sqlite${suffix}`);
      if (existsSync(file)) unlinkSync(file);
    }
    rmdirSync(directory);
  });
  async function start() {
    server = createObservatoryServer({ database, accessCode: "integration-only" });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/healthz`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${base}/data/observations.sqlite`)).status, 404);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM observations").get().count, 0);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  const { accessCode } = JSON.parse(html.match(/id="preview-config">([\s\S]*?)<\/script>/)[1]);
  const unlock = await fetch(`${base}/api/preview?ignored=do-not-store`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: accessCode, extra: "do-not-store" }),
  });
  assert.equal(unlock.status, 200);
  assert.deepEqual(await unlock.json(), { status: "work in progress" });

  const oversized = await new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/api/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" },
    }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, text }));
    });
    request.on("error", reject);
    request.write('{"password":"');
    request.end("x".repeat(5000));
  });
  assert.equal(oversized.status, 413);
  assert.equal(JSON.parse(oversized.text).error, "body_too_large");
  const rows = database.prepare("SELECT * FROM observations ORDER BY id").all();
  assert.deepEqual(rows.map((row) => row.event), ["page_visit", "unlock_success", "unlock_rejected"]);
  assert.doesNotMatch(JSON.stringify(rows), /integration-only|do-not-store/);

  await closeServer();
  database.close();
  database = openDatabase(directory);
  base = await start();
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.deepEqual(database.prepare("SELECT * FROM observations ORDER BY id").all(), rows);
});
