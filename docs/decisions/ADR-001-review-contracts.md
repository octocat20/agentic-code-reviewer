# ADR-001: review-task/v1 and review-result/v1

## Problem

The plan names the task and result fields in prose. Fixtures and later stages need one encoding, or a digest and a finding location cannot be checked.

## Choice

`contracts/review-task.schema.json` and `contracts/review-result.schema.json` are the v1 encoding. A complete run may contain an empty finding list. A timeout is `partial` or `failed`, not `complete`. Locations are relative snapshot paths. Expected findings live beside each fixture and are not a model result.

## Rejected alternatives

- One combined schema for the task and the result: the evaluator needs to read a result without accepting a task.
- Protobuf for the first contract: the plan's boundary is versioned JSON, and a CLI can cross it later.

## Tests

- `tests/test_contracts.py`

## Reopen when

A second consumer needs another encoding, or a field in the plan cannot be represented without breaking these fixtures.
