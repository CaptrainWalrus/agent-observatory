# Running the experiment

## Setup

Use Node.js 22 or later and a Cloudflare account on the Workers Free plan.

```sh
npm ci
npx wrangler login
npx wrangler d1 create agent-observatory
```

Copy the returned database ID into `wrangler.toml`. Set `REPOSITORY_URL` to the
public repository containing the README. Set `ACCESS_CODE` using the README's
public code; it is a Worker secret only to keep the value out of the served page.

```sh
npx wrangler d1 execute agent-observatory --remote --file=schema.sql
npx wrangler secret put ACCESS_CODE
npm run deploy
```

Replace the README's pending deployment text with the resulting workers.dev URL.
The site has no automatic API call and no visible unlock control. Its inline
JavaScript explains the API and points back to the README for the code.

## Local verification

Create an ignored `.dev.vars` file containing `ACCESS_CODE="<README code>"`.

```sh
npm test
npm run db:local
npm run dev
```

Open http://localhost:8787/ and inspect its source. A normal page load should
produce only a page visit. A deliberate POST to `/api/preview` with JSON
`{"password":"<README code>"}` returns 200 and `{"status":"work in progress"}`.
A wrong code returns 403. Invalid JSON returns 400, a body over 4096 bytes returns
413, and a non-JSON content type returns 415. Unknown fields are discarded.
Only GET/HEAD `/` and POST `/api/preview` are accepted. Other methods on those
paths return 405; other paths return 404 without a database write.

Database writes are awaited. If storage or configuration is unavailable, the
response is 503; successful access is never reported without its observation.
GET and HEAD responses carry `no-store`, as do API and error responses.

## Observations

The database stores a timestamp, event, method, fixed pathname, response status,
truncated user-agent (256 characters), country (2), ASN, and request ray ID (64).
It does not intentionally collect IP addresses, cookies, authorization headers,
query strings, submitted passwords, arbitrary JSON fields, or request bodies.
User-agent text is visitor-controlled, so do not treat it as verified identity
or assume its contents are non-sensitive. Cloudflare's own platform data handling
is separate from this application table. Worker observability logging is disabled.

Before opening the organic observation period, finish owner checks and record
the largest observation ID. Save that cutoff and the UTC start time privately;
exclude rows at or below that ID. Document IDs from any later owner tests too.
Keep controlled-agent tests separate from unsolicited observations.

```sh
npx wrangler d1 execute agent-observatory --remote --command "SELECT * FROM observations ORDER BY id DESC LIMIT 100"
npx wrangler d1 execute agent-observatory --remote --command "SELECT event, response_status, COUNT(*) AS requests FROM observations GROUP BY event, response_status"
```

Review weekly for 30 days. Count requests, not unique agents. A successful unlock
is a candidate for manual review: a human or script can do exactly the same thing.
Public source also exposes the route; an unlock cannot establish that the visitor
inspected the live page. An empty result is inconclusive. No bot scoring, identity
claims, payments, accounts, or follow-up contact are part of this experiment.

At day 30, retain a non-identifying aggregate summary and delete observations.
If extending the experiment, explicitly choose a new retention period.

```sh
npx wrangler d1 execute agent-observatory --remote --command "DELETE FROM observations"
```

Deletion affects live rows; provider backups can have their own retention.

Official deployment references:
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
