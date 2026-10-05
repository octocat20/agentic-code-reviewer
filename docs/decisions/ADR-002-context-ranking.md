# ADR-002: context ranking

## Problem

A cross-file defect stays hidden when the imported file is left out, and a recorded review misses if two runs select different files.

## Choice

Rank fragments in this order: changed source, then direct relative imports, then tests that import a changed file, then `REVIEW.md` at the snapshot root. Break ties by path, then start line. The same input selects the same fragments.

Guidance is task data. It cannot add tools or widen the snapshot.

## Rejected alternatives

- Let the model choose files until the budget is gone: a replay would depend on the model, and a missing recording could not be explained from the snapshot.

## Tests

- `tests/context.test.ts`

## Reopen when

A second agent needs a different ranking, or a fixture shows that symbol-sized fragments are required because whole imported files crowd out the changed code.
