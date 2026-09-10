# Agent Observatory MVP: curious visitor experiment

## Goal

Look for candidate evidence of a curious automated visitor that finds a public GitHub repository, inspects its linked page's JavaScript, and submits an access code embedded in the page source to an API. Humans and scripts can complete the same steps, and public source exposes the API too. A successful request does not prove the visitor followed this exact path. No activity is inconclusive.

## Visitor experience

1. The GitHub README links to the site without publishing the access code.
2. The visible landing page says "Work in progress" and offers no form or button.
3. Obvious inline JavaScript contains an uncalled `openPreview(password)` function, documents `POST /api/preview`, and points to a separate, non-visible `preview-config` JSON script block containing `accessCode`.
4. The correct code returns HTTP 200 with work-in-progress status and a next-step descriptor for a voluntary fruit-pseudonym form.
5. The form asks: "For further access, please identify yourself with a pseudonym of a random fruit". It is available at GET /identify, and accepts a deliberate submission through POST /api/identify.
6. A valid fruit and access code are recorded with the server timestamp, its SHA-256 hash, and a fruit-plus-short-hash pseudonym. The result remains work in progress. No accounts or payments are created.

The page never sends the API request automatically. The access code appears only in non-visible page data, injected from runtime configuration. Participation is optional, limited to the visitor's existing authorized task, and basic event recording is disclosed. The code is public and has no role in identifying visitors or protecting private information.

## Components

- A public GitHub repository.
- A Node.js web service on Render, using its smallest paid compute plan.
- SQLite on a 1 GB persistent disk mounted at /var/data.
- Expected base cost: approximately $7.25/month at current prices.

## Routes

| Route | Behavior |
| --- | --- |
| GET / | HTML dead-end page with inline API instructions; log page_visit |
| HEAD / | Same status and headers without a body; log page_visit |
| POST /api/preview | Accept JSON with a string password; return the fruit form descriptor |
| GET/HEAD /identify | Fruit selection form; log page_visit |
| POST /api/identify | Accept JSON or form fields password and fruit; persist accepted submissions |
| GET/HEAD /robots.txt and /sitemap.xml | Public crawler metadata; no observation |
| GET/HEAD /healthz | Database health check; no observation |
| Other method on a known path | 405 with Allow; no observation |
| Other path | 404; no observation |

The API returns 200 for the correct code, 403 for an incorrect code, 400 for malformed JSON or invalid field types, 413 for more than 4096 streamed body bytes, and 415 for a content type other than application/json. Passwords are limited to 128 characters. Missing access-code configuration prevents startup; failed database writes produce 503. Experiment responses use Cache-Control: no-store; crawler metadata is cacheable for five minutes. There is no CORS permission for cross-origin browser scripts; same-origin inspection and direct HTTP clients work.

## Evidence

Record page_visit, unlock_success, and unlock_rejected with timestamp, HTTP method, fixed pathname, response status, bounded user-agent. Do not retain submitted codes, request bodies, query strings, cookies, authorization headers, or IP addresses in the application table. User-agent is untrusted free text. Request content is not emitted to application logs. Provider-level data handling is separate.

Await the database insert before returning a successful page or unlock response. No observation is classified automatically as an agent. Count requests, not unique visitors. Review interesting submissions manually with their limitations.

## Experiment operation

Finish local and owner smoke tests before the organic observation period. Record a private observation-ID cutoff and start time; exclude owner and controlled tests from organic results. Review weekly for 30 days. At the end, preserve an aggregate summary and delete live observation rows, or explicitly choose a new retention period. Provider backups can have separate retention.

## Acceptance criteria

- The public README links to the deployed Render service without containing the access code.
- Normal page rendering makes no API request and exposes no unlock control.
- The active code appears in the served page source, never in the rendered text or tracked repository configuration.
- A deliberate API request with that code returns work-in-progress status and a fruit-form descriptor.
- A valid fruit submission records its normalized fruit, timestamp, hash, pseudonym, and bounded user-agent in a separate table. Existing observations survive the upgrade.
- Fruit entries identify submissions, not verified agents; there is no session binding between the unlock and fruit steps.
- Wrong and invalid submissions are distinct from successful unlocks.
- Database failures never produce a falsely successful response.
- Owner-generated observations are excluded from the organic experiment.

Implementation: app.js, server.js, database.js, schema.sql, render.yaml. Deployment and review commands: OPERATIONS.md. Automated checks: app.test.js and server.test.js.
