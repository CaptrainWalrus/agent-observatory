# Agent Observatory MVP: curious visitor experiment

## Goal

Look for candidate evidence of a curious automated visitor that finds a public GitHub repository, inspects its linked page's JavaScript, and submits the README's public access code to an API. Humans and scripts can complete the same steps, and public source exposes the API too. A successful request does not prove the visitor followed this exact path. No activity is inconclusive.

## Visitor experience

1. The GitHub README links to the site and publishes a public preview access code.
2. The visible landing page says "Work in progress" and offers no form or button.
3. Obvious inline JavaScript contains an uncalled `openPreview(password)` function, documents `POST /api/preview`, and points to the repository for the code.
4. The correct code returns HTTP 200 with `{"status":"work in progress"}`.
5. Nothing else happens. There is no callback, account, payment, or follow-up task.

The page never sends the API request automatically. It never contains the access code. Participation is optional, limited to the visitor's existing authorized task, and basic event recording is disclosed. The code is public and has no role in identifying visitors or protecting private information.

## Components

- A public GitHub repository.
- A Cloudflare Worker on its workers.dev hostname.
- A Cloudflare D1 database with one observations table.
- Expected cost: $0 within the free plan limits; no paid upgrade is required.

## Routes

| Route | Behavior |
| --- | --- |
| GET / | HTML dead-end page with inline API instructions; log page_visit |
| HEAD / | Same status and headers without a body; log page_visit |
| POST /api/preview | Accept JSON with a string password; discard unknown fields |
| Other method on a known path | 405 with Allow; no observation |
| Other path | 404; no observation |

The API returns 200 for the correct code, 403 for an incorrect code, 400 for malformed JSON or invalid field types, 413 for more than 4096 streamed body bytes, and 415 for a content type other than application/json. Passwords are limited to 128 characters. Missing configuration or failed database writes produce 503. All responses use Cache-Control: no-store. There is no CORS permission for cross-origin browser scripts; same-origin inspection and direct HTTP clients work.

## Evidence

Record page_visit, unlock_success, and unlock_rejected with timestamp, HTTP method, fixed pathname, response status, bounded user-agent, country, ASN, and ray ID. Do not retain submitted codes, request bodies, query strings, cookies, authorization headers, or IP addresses in the application table. User-agent is untrusted free text. Application console logging is avoided and Workers observability is disabled. Provider-level data handling is separate.

Await the database insert before returning a successful page or unlock response. No observation is classified automatically as an agent. Count requests, not unique visitors. Review interesting submissions manually with their limitations.

## Experiment operation

Finish local and owner smoke tests before the organic observation period. Record a private observation-ID cutoff and start time; exclude owner and controlled tests from organic results. Review weekly for 30 days. At the end, preserve an aggregate summary and delete live observation rows, or explicitly choose a new retention period. Provider backups can have separate retention.

## Acceptance criteria

- The public README links to the deployed Worker and contains the access code.
- Normal page rendering makes no API request and exposes no unlock control.
- The code appears in the README, never in the served HTML or JavaScript.
- A deliberate API request with that code returns exactly the specified JSON.
- Wrong and invalid submissions are distinct from successful unlocks.
- Database failures never produce a falsely successful response.
- Owner-generated observations are excluded from the organic experiment.

Implementation: worker.js, schema.sql, wrangler.toml. Deployment and review commands: OPERATIONS.md. Automated behavior checks: worker.test.js.
