# Open decisions

These choices are unset. The contracts and fixtures do not depend on them.

## Context ranking signals

- Problem: A cross-file defect is invisible if the dependency is left out of the context pack, and an unstable ranking makes a recorded response miss.
- Options: Rank changed symbols, then direct references, then tests, then repository guidance, with path order as the tie break. Or let the model choose files until the budget is gone.
- Test that would settle it: The cross-file fixture selects `src/discount.ts`, and a second run selects the same fragments.

## Token budget accounting

- Problem: An oversized task must fail explicitly, and a repeated run must omit the same fragments.
- Options: Count characters divided by four and reserve model overhead before filling the budget. Or count tokens with one named tokenizer.
- Test that would settle it: An oversized fixture returns insufficient context, and a repeat run reports the same omissions.

## Semantic finding matching

- Problem: Structural validity of a location is a different question from whether a finding matches a labelled defect.
- Options: This repository checks locations against the snapshot. The evaluation platform owns semantic matching when it consumes `review-result/v1`.
- Test that would settle it: A labelled defect fixture is scored by the evaluation platform without labels being sent to the model.
