# EventiApp Dashboard

Authenticated dashboard for organizers, agencies, venues and platform admins.
It owns dashboard UX, session integration and its projection of the shared
product contract; the Go API remains the canonical source of domain state.

## Local development

From the workspace root, prefer the shared Node.js toolchain and orchestration:

```powershell
.\eventiapp.ps1 doctor
.\eventiapp.ps1 check -Target products -Fast
.\eventiapp.ps1 up
```

For standalone dashboard work:

```bash
npm ci
npm run dev
npm run contract:check
npm run lint
npm run typecheck
npm run test:unit -- --maxWorkers=1
npm run build
```

The local dashboard is available at `http://localhost:3000`; tenant hostnames
are documented in the workspace local-development guide. Copy `.env.example`
to `.env.local` and provide the required Cognito and backend values before
starting standalone development.

Authenticated destructive E2E has a separate, cost-free path for the isolated
loopback control plane. Supply its short-lived signed token to the Playwright
process as `E2E_ID_TOKEN`, with both `PLAYWRIGHT_BASE_URL` and
`E2E_BACKEND_URL` pointing at the disposable loopback dashboard/API. The auth
fixture rejects remote targets and stores only the temporary HttpOnly session
in Playwright state. Teardown removes that state and screenshot/trace/video
recording is disabled for this mode. Never place that token in `.env.local`, Vault, logs,
CI artifacts, or a deployed environment. Cognito remains the only production
identity provider; see `docs/qa-agent.md` for the qualification workflow.

## Boundaries

- Keep dashboard-only components, routes and interaction state in this repo.
- Keep language-neutral product identity and request headers in
  `itbem-product-contract` and update the pinned projection deliberately.
- Keep authorization and event domain rules in `itbem-events-backend`.

See [the workspace workflow](../DEVELOPER_WORKFLOW.md) for the full
cross-repository validation and release model.
