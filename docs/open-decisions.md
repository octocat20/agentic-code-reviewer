# Open decisions

Ranking and token accounting are settled in ADR-002 and ADR-003.

## Semantic finding matching

- Problem: Structural validity of a location is a different question from whether a finding matches a labelled defect.
- Options: This repository checks locations against the snapshot. The evaluation platform owns semantic matching when it consumes `review-result/v1`.
- Test that would settle it: A labelled defect fixture is scored by the evaluation platform without labels being sent to the model.
