import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import worker from "./app.js";

function fixture({ fail = false } = {}) {
  const rows = [];
  const env = {
    ACCESS_CODE: "test-code-only",
    DB: {
      prepare() {
        return {
          async run(...values) {
            if (fail) throw new Error("Database unavailable");
            rows.push(values);
            return { changes: 1 };
          },
        };
      },
    },
  };
  return { env, rows };
}

function post(body, headers = { "Content-Type": "application/json" }) {
  return new Request("https://example.com/api/preview?ignored=sensitive", {
    method: "POST", headers, body,
  });
}

test("code is discoverable in inert page data, with no visible controls or automatic requests", async () => {
  const { env, rows } = fixture();
  const response = await worker.fetch(new Request("https://example.com/"), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Work in progress/);
  assert.doesNotMatch(html, /<form|<button|<input/);
  assert.doesNotMatch(html.match(/<main>([\s\S]*?)<\/main>/)[1], /test-code-only/);
  const configuration = JSON.parse(html.match(/<script type="application\/json" id="preview-config">([\s\S]*?)<\/script>/)[1]);
  assert.equal(configuration.accessCode, env.ACCESS_CODE);
  const calls = [];
  const context = vm.createContext({ fetch: (...args) => calls.push(args) });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  assert.equal(calls.length, 0);
  await context.openPreview(configuration.accessCode);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/preview");
  assert.deepEqual(JSON.parse(calls[0][1].body), { password: "test-code-only" });
  assert.equal(rows[0][0], "page_visit");
  const unlocked = await worker.fetch(post(calls[0][1].body), env);
  assert.equal(unlocked.status, 200);
});

test("page configuration cannot break out of its inert script element", async () => {
  const { env } = fixture();
  env.ACCESS_CODE = '</script><script>unexpected()</script>"&';
  const response = await worker.fetch(new Request("https://example.com/"), env);
  const html = await response.text();
  assert.doesNotMatch(html, /<script>unexpected/);
  const configuration = JSON.parse(html.match(/<script type="application\/json" id="preview-config">([\s\S]*?)<\/script>/)[1]);
  assert.equal(configuration.accessCode, env.ACCESS_CODE);
});

test("successful unlock records only allowlisted metadata", async () => {
  const { env, rows } = fixture();
  const response = await worker.fetch(post(JSON.stringify({
    password: env.ACCESS_CODE, message: "do-not-store-this",
  }), { "Content-Type": "application/json", Authorization: "do-not-store-auth" }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "work in progress" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], "unlock_success");
  assert.equal(rows[0][2], "/api/preview");
  assert.doesNotMatch(JSON.stringify(rows), /test-code-only|do-not-store|sensitive/);
});

test("wrong passwords, malformed JSON, and incorrect field types never unlock", async () => {
  for (const [body, status] of [
    ['{"password":"wrong"}', 403], ["{", 400], ["null", 400],
    ["[]", 400], ['{"password":true}', 400], ["{}", 400],
    [JSON.stringify({ password: "x".repeat(129) }), 400],
  ]) {
    const { env, rows } = fixture();
    const response = await worker.fetch(post(body), env);
    assert.equal(response.status, status, body);
    assert.equal(rows[0][0], "unlock_rejected");
    assert.equal(rows[0][3], status);
  }
});

test("streamed body limit counts bytes without trusting Content-Length", async () => {
  const { env, rows } = fixture();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"password":"'));
      controller.enqueue(new TextEncoder().encode("é".repeat(2050)));
      controller.close();
    },
  });
  const request = new Request("https://example.com/api/preview", {
    method: "POST", body: stream, duplex: "half",
    headers: { "Content-Type": "application/json", "Content-Length": "1" },
  });
  assert.equal((await worker.fetch(request, env)).status, 413);
  assert.equal(rows[0][3], 413);
});

test("unsupported content types, routes, and methods are explicit", async () => {
  const { env, rows } = fixture();
  assert.equal((await worker.fetch(post("hello", {}), env)).status, 415);
  const initialRows = rows.length;
  for (const [path, method, status] of [
    ["/missing", "GET", 404], ["/", "POST", 405],
    ["/api/preview", "GET", 405], ["/api/preview", "OPTIONS", 405],
  ]) {
    assert.equal((await worker.fetch(new Request(`https://example.com${path}`, { method }), env)).status, status);
  }
  assert.equal(rows.length, initialRows);
  const head = await worker.fetch(new Request("https://example.com/", { method: "HEAD" }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("storage failures never return a successful unlock or an unrecorded landing page", async () => {
  const { env } = fixture({ fail: true });
  for (const request of [new Request("https://example.com/"), post('{"password":"test-code-only"}'), post("{")]) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "temporarily_unavailable" });
  }
});

test("missing configuration fails closed and metadata strings are bounded", async () => {
  const { env, rows } = fixture();
  const request = new Request("https://example.com/", { headers: { "User-Agent": "x".repeat(1000) } });
  assert.equal((await worker.fetch(request, { ...env, ACCESS_CODE: "" })).status, 503);
  assert.equal(rows.length, 0);
  assert.equal((await worker.fetch(request, env)).status, 200);
  assert.equal(rows[0][4].length, 256);
});
