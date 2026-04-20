# IDIQ Tracker — Field Schema & CMS Mapping

**Purpose:** Defines every field used in the tracker so your agent can map CSV → CMS (WordPress/custom schema) without ambiguity.

## Primary fields (facts — must be primary-source verified)

| Field | Type | Required | Notes |
|---|---|---|---|
| vehicle_id | slug | yes | kebab-case unique ID; used for page URL |
| name | string | yes | Full vehicle name |
| agency | enum | yes | DoD / VA / HHS / GSA / Other |
| sub_agency | string | yes | e.g., DHA / PEO DHMS, CMS, NIH NITAAC |
| contract_number | string | no | Official contract/RFP number when public |
| ceiling_usd | integer | no | Full ceiling in USD; blank if not public |
| pop_start | date | no | YYYY-MM-DD |
| pop_end | date | no | YYYY-MM-DD |
| pop_years | integer | no | Total years incl. options |
| naics_primary | string | no | 6-digit |
| naics_secondary | string | no | 6-digit |
| psc | string | no | Product Service Code |
| set_aside | enum | yes | Unrestricted / SB / 8(a) / SDVOSB / WOSB / Multi-tier / Single Award / TBD |
| vehicle_type | enum | yes | IDIQ / MA IDIQ / GWAC / BPA / MATOC / OTA / BAA |
| award_type | string | no | FFP, T&M, CPFF, etc. |
| primes_count | string | no | Integer or text (e.g., "32" or "9 SB") |
| status | enum | yes | Active / Active Solicitation / In Source Selection / Pending Award / Winding Down / Cancelled / Expired / Recompete Watch |
| obligated_estimate_usd | integer | no | MMT estimate if not public |

## MMT-layer fields (analyst judgment — always label "MMT")

| Field | Type | Values |
|---|---|---|
| burn_status | enum | Saturating (≥80%) / Healthy (30–79%) / Underburning (<30%) / New |
| incumbent_vulnerability_score | integer 1–5 | 1=locked / 3=open-rotation / 5=wide open |
| forecast_event | string | Next expected milestone |
| forecast_window | daterange | YYYY-MM-DD to YYYY-MM-DD |
| forecast_confidence_pct | integer 0–100 | MMT probability-weighted call |

## Page-metadata fields (set per page, not in CSV)

- seo_title — ≤60 chars
- seo_description — ≤155 chars
- last_verified_date — YYYY-MM-DD
- primary_source_url — canonical source
- mmt_note — 1-2 sentence analyst takeaway

## Display conventions

- Render ceiling as `$X.XB` or `$XXXM`; blank → "Not disclosed"
- Render POP as `Jun 2026 – May 2031`
- IVS rendered as colored pill: 1=red (locked), 3=amber, 5=green
- Burn status rendered as 3-bar indicator
- Forecast confidence rendered as horizontal meter + numeric
- Always mark MMT fields with an "MMT" badge

## Card ordering (default)

1. MMT forecast (lead with the call)
2. Ceiling + POP + set-aside
3. Primes
4. Scope
5. MMT flow intel & IVS
6. Primary source link
