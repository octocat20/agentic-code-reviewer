# ADR-003: token budget accounting

## Problem

An oversized task must fail in the open, and two runs must omit the same fragments.

## Choice

A token is four characters, rounded up. Reserve 256 tokens for model overhead before adding fragments. Changed fragments are required: if one does not fit, the outcome is `insufficient-context`. Supporting fragments that do not fit are omitted, in rank order, and named in the omission list. A fragment is included whole or not at all.

## Rejected alternatives

- A named tokenizer: the fixtures are small, and a tokenizer dependency would make the budget harder to recompute by hand.
- Truncating a required fragment: a partial changed hunk can hide the line under review.

## Tests

- `tests/context.test.ts`

## Reopen when

A measured run shows that character/4 diverges enough from the model tokenizer to change which fragments fit.
