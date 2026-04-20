# SAM.gov Watchlist Spec — IDIQ Tracker Automation

For each entry, your scraper should hit SAM.gov Opportunities API daily and post matches to the Pursuit Calendar with the associated `vehicle_id`.

| watch_id | vehicle_id | query (SAM.gov) | match condition | post to |
|---|---|---|---|---|
| W001 | peo-dhms-deployment | noticeId=HT003826RE001 OR title~"Deployment Solutions" AGENCY=DHA | any new amendment or status change | Pursuit Calendar + alert |
| W002 | dha-omnibus-iv | title~"OMNIBUS IV" AND setAside=8(a) | any new notice | Pursuit Calendar |
| W003 | va-t4ng2 | agency=VA AND parentIDV~"T4NG2" | any new TO notice | Pursuit Calendar |
| W004 | va-t4ng2-ecms | agency=VA AND title~"ECMS Wave 3" | any new notice | Pursuit Calendar + alert |
| W005 | cms-sparc-next | agency=CMS AND (title~"SPARC" OR title~"Strategic Partners") AND postedFrom=today-7 | any new notice | Pursuit Calendar |
| W006 | nitaac-cio-sp4 | issuingOffice="NITAAC" AND title~"CIO-SP4" | awards/amendments | Pursuit Calendar |
| W007 | nitaac-ecs-iv | issuingOffice="NITAAC" AND title~"ECS" AND (IV OR 4) | any new notice | Pursuit Calendar |
| W008 | cdc-tass | agency=CDC AND title~"Technical Applications Support" | any new notice | Pursuit Calendar |
| W009 | ihs-path-ehr | agency=IHS AND title~"PATH" | any new TO | Pursuit Calendar |
| W010 | dla-mspv-gen-vi | noticeId=SPE2DV25R0001 | award or amendment | Pursuit Calendar + alert |
| W011 | usace-mobile-dha-west | noticeId=W9127826RA017 | any new amendment | Pursuit Calendar |
| W012 | gsa-alliant-3 | agency=GSA AND title~"Alliant 3" | awards | Pursuit Calendar + alert |
| W013 | fda-ead-replacement | agency=FDA AND title~"Enterprise IT Application Development" | any new RFI/RFP | Pursuit Calendar |
| W014 | barda-idiqs | agency=ASPR AND (naics=541715) | any new IDIQ notice | Pursuit Calendar |
| W015 | arpah-ops-idiq | agency=ARPA-H AND (title~"operations" OR title~"support") | any new RFP/OTA | Pursuit Calendar |

## Automation contract
- Poll interval: 06:00 ET daily
- Dedupe: by noticeId
- Hash content; alert only on diff
- Retry: 3 attempts, exponential backoff
- Output: POST JSON to `/api/newswire/ingest` with `{watch_id, vehicle_id, notice_id, url, summary, posted_at}`
