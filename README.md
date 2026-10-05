# agentic-code-reviewer

A read-only reviewer for a TypeScript snapshot and a diff. The plan is `Kevin Wang/Projects/agentic-code-reviewer.md` in the CV workspace.

## Status

Implemented: `review-task/v1`, `review-result/v1`, five fixtures with independent expected findings, diff routing, a trusted ESLint adapter, and context selection. `make verify` checks the contracts, repeatable routes, and the context budget. No credentials are required.

Planned: a recorded model loop, reports, a fresh-checkout demo, and later an isolated patch runner. Repair is unavailable.

## Verify

```sh
npm install
make verify
```

Routing keeps every changed path. TypeScript sources and tests go to ESLint through `prescan/eslint.config.js`. A config file inside the snapshot is not loaded. Generated, configuration, and unsupported files stay in the route list. A path that leaves the snapshot, including through a symlink, is excluded and not linted.

## Fixtures

| Fixture | Oracle |
| --- | --- |
| `clean` | A complete review with no finding |
| `local-defect` | A finding on the changed line in `src/cart.ts` |
| `cross-file` | A finding in `src/order.ts` that depends on unchanged `src/discount.ts` |
| `renamed-file` | A finding on `src/tax.ts`, never on the deleted `src/old-tax.ts` as a head path |
| `malformed-input` | Task validation fails and no finding file is produced |

Expected findings are the oracle. They are not a model run. Schema examples in `contracts/examples/` show the result shape, including an empty complete review, a partial timeout, and a rejected location.

The accepted encoding is `docs/decisions/ADR-001-review-contracts.md`. Open choices for ranking, token accounting, and semantic matching are in `docs/open-decisions.md`.
