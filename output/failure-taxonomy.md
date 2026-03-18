# Failure Taxonomy

Six classes for ops_events.failure_class:
- MODEL_FAILURE: AI hallucinated/refused
- HARNESS_FAILURE: Our code broke
- CONFIG_FAILURE: Wrong env var
- INFRA_FAILURE: Provider down
- DATA_FAILURE: Wrong/stale data
- OPERATOR_FAILURE: Human error

Migration 011 adds the column. ops-ledger.js accepts optional failure_class param.
