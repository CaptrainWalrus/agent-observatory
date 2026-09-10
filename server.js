import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import app from "./app.js";
import { openDatabase } from "./database.js";

// Retain at most one byte beyond the API limit, including for chunked uploads.
// Drain any remainder so rejecting an oversized request does not destroy its response socket.
function boundedBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let length = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveBody(Buffer.concat(chunks, length));
    };
    request.on("data", (chunk) => {
      if (settled) return;
      const retained = chunk.subarray(0, 4097 - length);
      chunks.push(retained);
      length += retained.length;
      if (length === 4097) finish();
    });
    request.on("end", finish);
    request.on("error", reject);
    request.on("aborted", () => reject(new Error("Request aborted")));
  });
}

export function createObservatoryServer({ database, accessCode }) {
  if (typeof accessCode !== "string" || accessCode.length === 0 || accessCode.length > 128) {
    throw new Error("Set ACCESS_CODE to a non-empty string of at most 128 characters.");
  }
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, "http://localhost");
      if (url.pathname === "/healthz") {
        incoming.resume();
        if (!["GET", "HEAD"].includes(incoming.method)) {
          outgoing.writeHead(405, { "Content-Type": "application/json", "Cache-Control": "no-store", Allow: "GET, HEAD" });
          outgoing.end('{"error":"method_not_allowed"}');
          return;
        }
        database.prepare("SELECT 1").get();
        outgoing.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        outgoing.end(incoming.method === "HEAD" ? undefined : '{"ok":true}');
        return;
      }
      let body;
      if (incoming.method === "POST" && ["/api/preview", "/api/identify", "/api/objective", "/api/place"].includes(url.pathname)) {
        body = await boundedBody(incoming);
      } else {
        incoming.resume();
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const request = new Request(url, { method: incoming.method, headers, body });
      const response = await app.fetch(request, { DB: database, ACCESS_CODE: accessCode });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) {
        outgoing.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      }
      outgoing.end('{"error":"temporarily_unavailable"}');
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.timeout = 15000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.RENDER === "true" && process.env.DATA_DIR !== "/var/data") {
    throw new Error("Render requires DATA_DIR=/var/data and a persistent disk mounted there.");
  }
  const database = openDatabase(process.env.DATA_DIR || "./data");
  const server = createObservatoryServer({ database, accessCode: process.env.ACCESS_CODE });
  const port = Number(process.env.PORT || 10000);
  server.listen(port, "0.0.0.0", () => console.log(`Agent Observatory listening on port ${port}`));
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      server.close(() => {
        database.close();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
}
