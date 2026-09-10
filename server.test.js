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
  const preview = await unlock.json();
  assert.equal(preview.status, "work in progress");
  assert.equal(preview.next_step.form_url, "/identify");
  const form = await fetch(`${base}${preview.next_step.form_url}`);
  assert.equal(form.status, 200);
  assert.match(await form.text(), /name="fruit"/);
  const identification = await fetch(`${base}/api/identify`, {
    method: "POST",
    body: new URLSearchParams({ password: accessCode, fruit: "banana" }),
  });
  assert.equal(identification.status, 200);
  const identified = await identification.json();
  assert.match(identified.pseudonym, /^banana-[0-9a-f]{12}$/);
  const submit = (path, value) => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
  });
  const objectiveToken = identified.next_step.fields.token;
  assert.equal((await submit('/api/place', { token: objectiveToken, place: 'Mars' })).status, 403);
  assert.equal((await submit('/api/objective', { token: objectiveToken, objective: ' ' })).status, 400);
  assert.equal((await submit('/api/objective', { token: '0'.repeat(64), objective: 'Explore' })).status, 403);
  const objective = await submit('/api/objective', { token: objectiveToken, objective: 'Find NYC temperature' });
  assert.equal(objective.status, 200);
  const placeToken = (await objective.json()).next_step.fields.token;
  assert.equal((await submit('/api/objective', { token: objectiveToken, objective: 'Replay' })).status, 403);
  assert.equal((await submit('/api/place', { token: placeToken, place: 'x'.repeat(201) })).status, 400);
  const completed = await submit('/api/place', { token: placeToken, place: 'Olympus Mons, Mars' });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).message, 'Work in progress!');
  assert.equal((await submit('/api/place', { token: placeToken, place: 'Replay' })).status, 403);
  const journeys = database.prepare('SELECT * FROM access_journeys').all();
  assert.equal(journeys.length, 1);
  assert.equal(journeys[0].objective, 'Find NYC temperature');
  assert.equal(journeys[0].place, 'Olympus Mons, Mars');
  assert.doesNotMatch(JSON.stringify(journeys), new RegExp(objectiveToken + '|' + placeToken));
  const submissions = database.prepare("SELECT * FROM fruit_submissions").all();
  assert.equal(submissions.length, 1);

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
  assert.deepEqual(rows.map((row) => row.event), ["page_visit", "unlock_success", "page_visit", "unlock_rejected"]);
  assert.doesNotMatch(JSON.stringify(rows), /integration-only|do-not-store/);

  await closeServer();
  database.close();
  database = openDatabase(directory);
  base = await start();
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.deepEqual(database.prepare("SELECT * FROM observations ORDER BY id").all(), rows);
  assert.deepEqual(database.prepare("SELECT * FROM fruit_submissions").all(), submissions);
  assert.deepEqual(database.prepare("SELECT * FROM access_journeys").all(), journeys);
});

test("existing observation rows survive adding the fruit table", () => {
  const directory = mkdtempSync(join(tmpdir(), "observatory-upgrade-"));
  let database = openDatabase(directory);
  try {
    database.exec("DROP TABLE fruit_submissions");
    database.exec("INSERT INTO observations (event, method, path, response_status) VALUES ('unlock_success', 'POST', '/api/preview', 200)");
    database.close();
    database = openDatabase(directory);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM observations").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM fruit_submissions").get().count, 0);
  } finally {
    database.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = join(directory, `observations.sqlite${suffix}`);
      if (existsSync(file)) unlinkSync(file);
    }
    rmdirSync(directory);
  }
});
