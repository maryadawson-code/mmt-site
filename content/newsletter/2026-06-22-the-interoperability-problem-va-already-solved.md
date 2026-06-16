---
title: "The Interoperability Problem VA Already Solved"
date: 2026-06-22
slug: the-interoperability-problem-va-already-solved
description: "A veteran's record cannot move between two VA clinics running the same software. The fix everyone is watching is a $37 billion migration to a single system. The fix that already works is a federation layer moving 1.4 billion transactions a month. They solve two different problems, and treating them as one is why this debate keeps going in circles."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "Interoperability"
  - "VistA"
  - "EHR Modernization"
  - "Department of Veterans Affairs"
  - "VDIF-EP"
  - "Federation"
  - "FHIR"
  - "HL7"
  - "Oracle Health"
  - "Health Data Exchange"
  - "Terminology Mapping"
  - "Federal Health IT"
agencies:
  - VA
canonical_url: "https://missionmeetstech.com/newsletter/the-interoperability-problem-va-already-solved/"
source: claude_newsletter_project
capture_corner_teaser: "Premium subscribers get the companion Capture Corner with this issue: the VA EHRM opportunity map sized from the public record, the three lanes that do not compete for the same dollar, the exact standards baseline a response has to speak, the reference architecture to propose, and the inspector-general failures turned into a requirement-to-past-performance bridge."
capture_corner:
  - "The opportunity, sized — the $13.84B obligated, the ~$37B forward envelope, the ~$900M/yr sustainment tail, and the 154 sites still to convert, read so a capture lead can see where the work actually sits."
  - "Two problems, three lanes — the deployment wave, the federation layer, and the VA-DoD seam, and why a team that names its lane and shows validation evidence is selling the work instead of the press release."
  - "The compliance baseline a response has to speak — FHIR R4, US Core STU7, USCDI v3, SMART 2.2.0, Bulk Data v2.0.0, and the conformance gate, with the single most common tell in a weak technical volume."
  - "The reference architecture and risk basis — the four-layer stack, the broker-plus-facade pattern VA already runs, replay-based validation, and every documented OIG failure mapped to the proven remedy it justifies."
  - "Capture windows — what closed with the June wave, what opens in August and October, and what to do this week."
---

# The Interoperability Problem VA Already Solved

*A veteran's record cannot move between two VA clinics running the same software. The fix everyone is watching is a $37 billion migration to a single system. The fix that already works is a federation layer moving 1.4 billion transactions a month. They solve two different problems, and treating them as one is why this debate keeps going in circles.*

![A clean side view of two bridges spanning a gap. Above, an unfinished concrete span reaches out from the left bank with exposed rebar and stops short of the far side. Below it, a slender existing connection already spans the gap with a record crossing it. The image frames the article's argument that the handoff, not the unfinished bridge, is what already carries the load.](/images/newsletter/2026-06-22/cover-the-handoff.png)

Friends,

A veteran walks into a VA clinic in one state. Her record lives at a VA facility in another. Both run VistA. Same software, same agency, same mission.

The clinic still cannot read her complete record without a separate tool standing between the two systems.

VA researchers documented exactly that in a peer-reviewed journal in 2019. Complete records across VA's 130-plus VistA sites cannot be reached without a tool to supplement the local instance.[1]

One agency. One platform. Records that do not natively speak to each other.

Everyone calls the answer "the migration." Replace 130 copies of VistA with one Oracle system, and the records finally connect. That story has a hole in it. The records already connect, 1.4 billion times a month, through a system that is not Oracle and is not the migration.[8]

![The interoperability paradox, shown as a flow diagram. VISTA SITE A and VISTA SITE B sit at the top with a red dashed line and X marks between them labeled NO COMPLETE NATIVE RECORD. Both feed into a central VDIF-EP box marked FEDERATE, NORMALIZE, DELIVER, which outputs ONE USABLE PATIENT VIEW. To the right, a figure reads 1.4 BILLION transactions each month. A banner reads: THE SYSTEMS REMAIN SEPARATE. THE RECORD DOES NOT.](/images/newsletter/2026-06-22/the-record-already-crosses.png)

I have spent years inside federal health IT, building the kind of data architecture this debate turns on. The thing the public conversation keeps missing is simple once you see it. Interoperability and migration are two different problems. VA already solved the first one. The second is still a fair question, and it is a question about something else.

## Two problems wearing one name

Start with the words, because the words are doing damage.

Interoperability is whether the data can move. Can a clinician in one place read, exchange, and act on a record created in another. Migration is whether VA runs 130 instances of VistA or one instance of Oracle Millennium. The first is about access. The second is about consolidation.

They get welded together in every headline. The new EHR is sold as the thing that will finally let VA records talk to each other and to the Defense Department.[12] Hear it framed that way often enough and you assume the records cannot talk now.

They already do, every day, at national scale. The mechanism is federation, and VA has run it for years while the migration took the headlines.

That distinction changes the question you are actually asking when you judge this program. Reach interoperability through one door and you do not get to grade the door you did not use as if it were the only way in. If consolidation is the goal, the migration has to be argued on consolidation's terms, which are real and which I will get to. Grading the migration on interoperability credits it for a finish line VA already crossed.

## The translation problem

To see why the records already move, look at what moving them takes.

VistA is roughly 130 versions of one system, running across more than 1,600 facilities.[2] One platform, branched 130 ways. Each version drifted. VA's own 2017 assessment counted, inside a single instance, more than 2,700 files, 64,000 data fields, and 4.7 million lines of code, much of it shaped site by site over four decades.[3]

Much of that code is written in MUMPS, a language few programmers still learn.[4] The dialects calcified because the people who could reconcile them grew fewer every year.

Connecting those 130 dialects is a translation problem. About 95 percent of US healthcare runs on HL7 version 2, a messaging standard first published in 1987.[5] v2 carries a quiet flaw. A field marked required can arrive empty and the message still passes. Two systems can both certify against the same standard and still hand each other data the other cannot use.[5]

Syntactically valid. Semantically incompatible. That gap is the whole problem.

Picture it in an exam room. One site records a glucose value in mg/dL, another in mmol/L. Same test, different number. Without a mapping that converts between them, a result that is normal in one unit reads like a crisis in the other, or worse, a crisis reads as normal.

Or take an allergy. Entered as a coded entry, it fires the drug-interaction alert when a clinician orders the wrong medication. Entered as free text the receiving system cannot parse, the same allergy sits silent, and the alert never fires.

Closing that gap means mapping. A local code at one site has to resolve to a shared national vocabulary so the receiver reads it the way the sender meant it. LOINC for tests. SNOMED for diagnoses. RxNorm for medications. Do that across 130 instances, each with its own variation, and the size of the job comes into focus.

This is not plumbing. When a medication or allergy field crosses a system boundary and the mapping does not hold, the consequence is clinical, not cosmetic.[6] VA's inspector general documented the failure mode at early deployment sites: more than 11,000 orders for care, labs, imaging, and referrals routed to a queue no one was monitoring, with no alert to the clinician who placed them.[20] No error fired. The orders waited to be found. That is the failure a monitored interface is built to catch. Mapping is a patient-safety control wearing a technical name.

We can stream a drone's sensor feed from the far side of the planet to a screen in Nevada without dropping a frame. We still need a piece of software in the middle so one VA clinic can read another VA clinic's chart. Capability was never the constraint. Translation is invisible work, funded last and noticed only when it breaks.

## The engine already running

The migration coverage keeps skipping this part. VA already built the translator, and it is running right now.

It is called VDIF-EP, the Veterans Data Integration and Federation Enterprise Platform. It reaches into VA's 130 VistA instances, federates the data, and normalizes it into standard formats: HL7 messages, C-CDA documents, and FHIR.[7] One platform turning 130 dialects into a shared output.

![How federation works. On the left, LOCAL VISTA VARIATION shows four mismatched inputs: a local lab code, different units, a free-text allergy, and a site-specific field, two of them flagged in red. They feed into a central VDIF-EP box labeled MAP, NORMALIZE, FEDERATE, which emits STANDARD OUTPUT in HL7, C-CDA, and FHIR, resolving into one usable clinical record. Stats on the right: 130+ VistA instances, 700,000 users, 230+ external health systems. A banner reads: TRANSLATION IS THE INTEROPERABILITY LAYER.](/images/newsletter/2026-06-22/130-dialects-one-shared-meaning.png)

The scale is not modest. VDIF-EP moves about 1.4 billion transactions a month and supports 700,000 users.[8] An award figure from 2023 put the volume near 479 million a month. The platform nearly tripled its monthly load since then. That growth curve belongs to load-bearing infrastructure, not a pilot winding down.

It replaced an estate that explains why the old fragmentation hurt. VA is sunsetting the hand-built point-to-point wiring it grew over the years, the interface engines and adaptors that connected systems one pair at a time.[7]

Point-to-point is where complexity goes to breed. Connect 130 systems directly to one another and the math runs to thousands of possible interfaces, every one a thing to build, monitor, and maintain. Route them through a single hub and it is 130 connections. Federation collapses the sprawl into something a team can hold.

The reach runs past VA's own walls. VDIF-EP exchanges records with more than 230 external healthcare systems through the Veteran Health Information Exchange.[8] For a veteran who gets half her care in the community, that exchange decides whether the civilian doctor sees the whole record or half of it.

Federation is also what lets a record follow a person. A reservist who serves at a base in one state, takes a job in another, then walks into a VA facility near home leaves a trail across three or four VistA instances. Query any one of them and you see a slice. Query through the federation layer and the slices assemble into a patient.

This is the difference between a window and a bridge. VA and DoD shared records for years mainly through the Joint Legacy Viewer, a screen that displays another system's data. Read-only. Senate appropriators said as far back as 2016 that it fell short of real interoperability.[10] VDIF-EP does more than display. It translates the data into a form other systems can ingest and act on. A window lets you look. A bridge lets you cross.

VA runs a second piece of the same architecture. The Lighthouse FHIR API is a façade. It puts a modern FHIR interface over VistA data without rewriting VistA underneath.[9] The legacy store stays in place. The standard interface sits in front of it. New applications speak FHIR to Lighthouse, and Lighthouse translates down to VistA.

An integration engineer would recognize the design on sight. A broker that federates across many sources, plus a façade that fronts the legacy system with the current standard, is the textbook pattern for connecting an estate this large without ripping it out. VA did not wait for the migration to finish before reaching interoperability. It built the bridge and ran it. That is real engineering, done while most of the headlines were about what was going wrong.

## So what is the migration for?

If the records already move, the honest question is why spend years and billions replacing the systems underneath them.

The answer is real, and it has little to do with interoperability. It is the cost and the risk of keeping 130 instances alive.

![Two bridges compared. The top one, marked with a red X labeled NEW BRIDGE NOT COMPLETE, reaches out from the left bank but stops short with a red dashed gap to the far side. The bottom one, marked with a teal check labeled EXISTING CONNECTION MOVES THE RECORD, is a slender span already carrying a record across the gap. A closing line reads: BUILD NEW. USE NOW. KEEP CARE CONNECTED.](/images/newsletter/2026-06-22/the-handoff-is.png)

Maintaining VistA ran about $900 million in a single year, FY2022.[11] Every one of those 130 instances needs patching, securing, and staffing. The staffing is the hard part. MUMPS is not taught anymore, and the people who keep it running are retiring out of the workforce.[4][11] Federation does not fix that. It rides on top of it. The translation layer is good work, and it is still translating from 130 systems that grow more expensive and more fragile every year.

Consolidation is the case for the migration. One system instead of 130. One sustainment bill instead of 130. One codebase a current workforce can actually maintain. A single record, written once, instead of a federated view assembled on the fly. Those goals are legitimate, and they carry the program on their own.

There is one interoperability prize the migration buys that federation cannot. The VA-DoD seam. Federation and the Joint Legacy Viewer let a VA clinician read a service member's military record.[10] A shared federal system lets both sides write to the same record instead of reading copies of each other's. For a veteran whose care crosses that line, the gap between reading and sharing is the gap between a snapshot and a continuity. That gain is real, and it belongs in the consolidation column, not the general interoperability one.

VA's resumed rollout runs on that logic. Deployments restarted in April 2026 at four Michigan medical centers, the first VA go-lives in years, with 13 sites planned through the year and full deployment targeted as early as 2031.[12][13] The current cost estimate given to lawmakers runs near $37 billion.[12]

Name the program by what it actually delivers and the debate gets cleaner. The migration's real work is consolidation: ending the federation tax, retiring a language the workforce is aging out of, turning a federated view into one native record. Interoperability already happened, by another route. Judge the program on consolidation and you can tell whether it is succeeding. Judge it on interoperability and you will applaud a race that finished years ago.

## A better scoreboard

The public measure of this program is site go-lives. How many facilities are live, on what schedule, in which state. It is the number that gets counted because it is the number you can see.

It is also the wrong scoreboard.

A go-live is the visible end of a long, invisible process: mapping each site's local terminology into the shared vocabulary, then proving the mapping holds before a clinician opens a chart. A site can go live on schedule with half its terminology still unmapped, and the calendar will look fine right up until a record loads wrong.

![A better scoreboard, shown as a four-step process: 1 MAP, translate source data using the agreed map and business rules; 2 REPLAY, run a representative set of real records through the pipeline; 3 DIFF, compare source and target outputs to find differences in content and meaning; 4 VERIFY, adjudicate and sign off that differences are resolved and safe, checking values, meaning, and clinical safety. A red warning reads A GO-LIVE DATE IS NOT EVIDENCE; a teal check reads REPEATED PROOF IS, continuous validation is the only way to ensure records mean the same thing on the other side.](/images/newsletter/2026-06-22/a-go-live-date-cannot-prove-a-mapping.png)

For anyone watching this program, the question worth asking is how much of the translation is done, tested against real records, and proven to hold. That number is harder to find than a go-live count. It is also the one that predicts whether the next site helps a veteran or sets her back. Judge the bridge by what crosses it, not by how many ribbons get cut.

That mapping work is where AI earns its place. FHIR Release 4 is the federal standard every certified system has to speak.[14] It won by giving up on a bad idea, defining the resources that cover most clinical cases and handling the rest with extensions, where an earlier standard tried to model everything and collapsed under the weight. US Core sets the shared profile every certified US system builds on.[15] The shared language exists. The mapping that feeds it is still mostly done by hand, and that is the bottleneck.

Some of that automation is already real and low-risk. Oracle's Millennium platform supports FHIR bulk export, the operation built to move population-level data from one EHR to another at volume.[16] That is the migration path itself running on the standard, machine to machine, with no clinical judgment in question, because the data being moved is already structured. The judgment problem starts where the mapping does.

Large language models can read clinical text and draft FHIR-structured output. The accuracy tracks the task. One 2025 study put attribute-level mapping with GPT-4o at 67 to 74 percent against a standard clinical dataset.[17] A narrower 2023 task reported over 90 percent exact match.[18]

Useful. Not finished.

Numbers like those make AI a strong assistant for the mapping backlog. Drafting crosswalks between a local code and a national one. Flagging fields that do not line up. Proposing a match while a person confirms it. They do not make AI safe to run a cutover alone. A medication field that maps wrong throws no error. It sends the wrong dose downstream and waits to be found. Seventy percent accuracy reads as impressive in a research paper and unacceptable in a pharmacy.

What makes automated mapping safe is the verification layer around it, not the model itself. Run the old system and the new one against the same stream of records. Diff the outputs. Where they disagree, a person looks before a patient does. Replay ninety days of real traffic through the new mappings and catch the mismatch in a test environment instead of an exam room. That is what lets a team move at machine speed without taking machine risk.

The translation has to be secure as well as accurate. A record exposed through a modern interface has to carry its access controls with it. The same federal standard that defines the data format also defines the authorization around it: app-level authentication, scoped access, an audit trail on who read what.[19] A layer that moves data fast and guards it loosely trades one failure for a worse one.

## The person on the other end

Every one of those 1.4 billion monthly transactions ends at a person. A veteran in an exam room. A clinician reading a chart before writing an order. A pharmacist deciding whether a dose is safe.

The hardest moment in a veteran's record is the day she stops being a service member and becomes a veteran. The data has to cross from one department's system to another's, survive the translation, and arrive whole. When it does, her new clinician sees everything the military knew about her. When it does not, she spends her first appointment rebuilding her own medical history from memory.

She does not care whether that record arrives by federation or by a single consolidated system. She cares that it arrives complete. VA already built the layer that makes that possible across 130 systems that were never designed to talk. The migration's job is to make it permanent without breaking what already works.

The veteran in the chair never sees the engine. She only feels whether it held.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue draws the line between interoperability and migration. Premium subscribers get the companion Capture Corner: how to read VA's EHRM scoreboard the way an evaluator does, the mapping-and-validation questions to put to any vendor before a go-live, how to position around the federation-versus-consolidation distinction instead of the press-release version, and what the $37 billion estimate and the 2031 horizon mean for capture windows over the next three deployment waves.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.
**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] Herout J et al., "Visual analysis of the complete VA medical record," *BMJ Health & Care Informatics*, 2019 (PMC7062314). Complete records across 130+ VistA sites not accessible without a supplemental tool. https://pmc.ncbi.nlm.nih.gov/articles/PMC7062314/

[2] VA EHRM FAQ (digital.va.gov); GAO-23-106685, Statement of Carol C. Harris, Mar 15 2023. ~130 versions; ~170 applications; 1,600+ facilities. https://digital.va.gov/ehr-modernization/frequently-asked-question/

[3] VA VistA Cloud RFI, summarized FedTech, Apr 2017. Per-instance: 2,700+ files, 64,000 data fields, 4.7M lines of code. https://fedtechmagazine.com/article/2017/04/will-va-go-cloud-its-vista-health-records-system

[4] GAO-18-208, Jan 2018. MUMPS developer scarcity; four prior VistA modernization efforts since 2001. https://digirepo.nlm.nih.gov/master/borndig/101765737/689472.pdf

[5] HL7 V2 Product Suite, HL7 International. ~95% US healthcare adoption; required-field optionality / semantic incompatibility. https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185

[6] VA OIG Report No. 23-01450-114, Mar 21 2024. Pharmacy-related patient-safety issues and incorrect data at the legacy-to-new-EHR boundary. https://www.vaoig.gov/sites/default/files/reports/2024-03/vaoig-23-01450-114.pdf

[7] VA VDIF-EP FY2025 Privacy Impact Assessment. Federation across 130 instances; HL7 / C-CDA / FHIR normalization; legacy interface sunset (VIE, eHX, eMI). https://department.va.gov/privacy/wp-content/uploads/sites/5/2024/11/FY25VeteransDataIntegrationandFederationEnterprisePlatformPIA.pdf

[8] InterSystems VDIF / Future VA page; J2 Interactive HIMSS24. 1.4B transactions/month; 700,000 users; ~479M earlier baseline; 230+ external systems via VHIE. https://www.intersystems.com/futureva/

[9] VA Lighthouse FHIR API PIA FY2025. FHIR R4 / US Core façade over VistA, the model in use during the migration window. https://department.va.gov/privacy/wp-content/uploads/sites/5/2025/02/FY25LighthouseFastHealthcareInteroperabilityResourcesAPIPIA.pdf

[10] Open Health News, Jul 2016, citing Senate Appropriations hearing. JLV is a read-only viewer; appropriators said it falls short of true interoperability. https://www.openhealthnews.com/news-clipping/2016-07-14/lawmakers-dispute-dod-va%E2%80%99s-claims-health-record-interoperability

[11] Military Times, Mar 2023, citing House VA hearing testimony (Daniel McCune, VA). ~$900M FY2022 VistA maintenance; MUMPS not taught. https://www.militarytimes.com/veterans/2023/03/07/vet-agency-asks-why-fix-outdated-but-outgoing-record-system/

[12] Nextgov/FCW, Apr 2026. Deployments resumed; total cost estimate to lawmakers ~$37B; full deployment targeted as early as 2031. https://www.nextgov.com/modernization/2026/04/va-resumes-ehr-rollouts-four-michigan-medical-sites/412807/

[13] VA News press room, Apr 2026. Federal EHR live Apr 11 2026 at four Michigan sites; first of 13 planned 2026 deployments. https://news.va.gov/press-room/va-health-record-system-back-on-track-with-michigan-deployments/

[14] ONC 21st Century Cures Act Final Rule, May 1 2020. FHIR Release 4.0.1 adopted as the federal API standard. https://www.federalregister.gov/documents/2020/05/01/2020-07419/

[15] HL7 FHIR Overview. 80/20 resource design; US Core as the US-realm profile. https://www.hl7.org/fhir/overview.html

[16] Oracle Health Millennium Bulk Data Access; FHIR Bulk Data Access v2.0.0. $export for EHR-to-EHR migration. https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfbda/bulk_data_access.html

[17] Riquelme Tornel et al., arXiv 2507.03067, 2025. GPT-4o attribute-level FHIR mapping 67–74% (MIMIC-IV). https://arxiv.org/pdf/2507.03067.pdf

[18] Li et al., arXiv 2310.12989, 2023. Clinical text to FHIR >90% exact match on a narrower task. https://arxiv.org/abs/2310.12989

[19] SMART App Launch 2.2.0 (HL7); ONC §170.315(g)(10) certification criteria. OAuth 2.0 app authentication, scoped access, audit. https://hl7.org/fhir/smart-app-launch/

[20] VA OIG Report No. 22-01137-204, Jul 14 2022. The new EHR's "unknown queue": more than 11,000 orders undelivered with no clinician alert (Oct 2020–Jun 2021); ranked among the highest patient-safety-risk concerns identified. https://www.vaoig.gov/sites/default/files/reports/2022-07/VAOIG-22-01137-204.pdf
