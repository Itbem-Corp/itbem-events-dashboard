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

## Boundaries

- Keep dashboard-only components, routes and interaction state in this repo.
- Keep language-neutral product identity and request headers in
  `itbem-product-contract` and update the pinned projection deliberately.
- Keep authorization and event domain rules in `itbem-events-backend`.

See [the workspace workflow](../DEVELOPER_WORKFLOW.md) for the full
cross-repository validation and release model.
