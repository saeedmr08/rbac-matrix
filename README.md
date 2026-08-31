# RBAC Matrix

Interactive **role × action** permission matrix for exploring authorization design. Toggle grants, detect conflicts (including conceptual self-approval), preview Allow/Deny decisions, export policy JSON, and generate test cases.

Portfolio demo by **Saeed Rumaneh**. Synthetic roles only — not a production IAM system.

## How to run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest |
| `npm run typecheck` | TypeScript check |

## Example inputs

1. Open the **Matrix** panel and toggle **Member → Approve** — conflict analysis should flag self-approval.
2. In **Preview**, pick Alex Kim (Member), action Approve, resource owner Alex Kim — expect **Deny** when self-approve blocking is on.
3. **Reset defaults** restores the seeded matrix and writes `data/rbac.json`.

## Persistence

- `GET /api/matrix` — load matrix from `data/rbac.json` (creates defaults on first run)
- `PUT /api/matrix` — body `{ "matrix": { ... } }` saves toggles

The `data/` directory is gitignored.

## Complete product flows

1. In **Matrix**, flip a cell (for example Member → Approve) — the grant persists via `PUT /api/matrix`.
2. Open **Preview**, pick a user/action/owner, and read Allow or Deny.
3. Open **Export** and copy or download the policy JSON. Restart — the matrix is still in `data/rbac.json`.

## Policy engine (`lib/rbac.ts`)

| Function | Purpose |
|---|---|
| `createDefaultMatrix()` | Sensible demo grants |
| `setPermission` / `isAllowed` | Toggle and query cells |
| `evaluateDecision` | Allow/Deny with self-action checks |
| `detectConflicts` | Static risk analysis |
| `generateTestCases` | Flatten matrix → expectations |
| `exportPolicy` | JSON-serializable policy document |

## Demo disclaimer

All users and roles are fictional. See [SECURITY.md](./SECURITY.md).

## License

MIT © 2026 Saeed Rumaneh
