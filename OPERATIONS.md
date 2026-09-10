# Running on Render

## Deploy

Use the Hobby workspace plan (no paid workspace upgrade needed) and the smallest
paid web-service instance: 0.5 CPU / 512 MB, plan ID `0.5c-512mb`. Attach a 1 GB
persistent disk. Current base cost is about $7.25/month ($7 compute + $0.25 disk),
before taxes or usage beyond included allowances. No separate database is needed.

The simplest deployment is **New > Blueprint** in Render. Connect
`CaptrainWalrus/agent-observatory` and use the included `render.yaml`. It sets up
the service and disk and generates `ACCESS_CODE` automatically.

If creating a **Web Service** manually, use these settings:

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/CaptrainWalrus/agent-observatory` |
| Branch | `main` |
| Runtime | Node |
| Instance | Smallest paid instance, 0.5 CPU / 512 MB |
| Build command | `npm ci && npm test` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Persistent disk mount | `/var/data` |
| Persistent disk size | 1 GB |
| Environment: `DATA_DIR` | `/var/data` |
| Environment: `ACCESS_CODE` | A fresh random string, 1-128 characters |

Node is pinned in `.node-version`. Render supplies `PORT`; the server binds to
`0.0.0.0`. SQLite initializes automatically at startup under
`/var/data/observations.sqlite`. Attach the actual disk; setting DATA_DIR alone
cannot make storage persistent. Keep this service at one instance.

The access code is inserted into the page's non-visible `preview-config` JSON.
It is deliberately discoverable in source and does not protect private data.
Do not publish its value in GitHub. The page never calls the unlock API itself.

After deployment, replace the README's pending deployment text with your actual
`onrender.com` URL. No Cloudflare account or configuration is needed.

## Local verification

Use Node 22.13 or later in the 22.x series. Create an ignored `.env` file:

```dotenv
ACCESS_CODE=choose-a-local-test-code
DATA_DIR=./data
PORT=10000
```

```sh
npm ci
npm test
npm start
```

Open http://localhost:10000/ and inspect its source. Submit the `accessCode` from
the `preview-config` block with POST `/api/preview`, Content-Type
`application/json`, and body `{"password":"<discovered code>"}`.

The correct code returns 200 and `{"status":"work in progress"}`. A wrong code
returns 403. Invalid JSON returns 400, bodies over 4096 bytes return 413, and a
non-JSON content type returns 415. Unknown fields are discarded. Other routes
return 404 and unsupported methods return 405. GET/HEAD `/healthz` checks the
database without recording a visit. The health check cannot unlock the API.

All responses use `Cache-Control: no-store`. Writes finish before an unlock
succeeds. A storage failure returns 503. Missing or invalid ACCESS_CODE prevents
server startup. Tests exercise the actual HTTP server and persistence on restart.

## Review observations

In the Render service's **Shell** tab, run:

```sh
npm run observations
```

This prints the latest 100 observations and counts grouped by event and status.
The same command works locally. Records are not served over HTTP. No static-file
server exposes the SQLite file or the application directory.

Stored fields are ID, UTC timestamp, event, method, fixed pathname, response
status, and user-agent (up to 256 characters). The application does not record
submitted codes, bodies, query strings, cookies, authorization headers, or IP
addresses. User-agent is visitor-controlled; treat it as unverified text.
Render's platform-level data handling is separate from the application database.

Finish owner smoke tests before starting organic observation. Privately record
the largest observation ID and UTC start time; exclude rows through that ID.
Record IDs of any later owner tests too. Keep controlled-agent tests separate.
Review weekly for 30 days, counting requests rather than unique agents.

A successful unlock is a candidate for manual review: humans and scripts can
complete the same steps. Codes can be copied or shared. No activity is inconclusive.

At day 30, save an aggregate summary and delete the live observations, or choose
an explicit extension. The following command deletes all observation rows:

```sh
npm run observations -- --clear
```

Provider backups can have separate retention. A disk-backed service has a brief
interruption during deploys; account for downtime when interpreting results.

References:
- https://render.com/pricing
- https://render.com/docs/disks
- https://render.com/docs/blueprint-spec
