# Capture Intelligence Sheet: VA Enterprise Imaging
## Procurement Map, Action Windows, and Capture Priorities

**Issue Date:** Friday, May 1, 2026
**Publication:** Mission Meets Tech Premium
**Coverage Period:** Active through Q3 FY2026

---

Friends,

This is the May Capture Intelligence Sheet. Coverage focuses on VA enterprise imaging, the largest concentration of federal health IT procurement activity in active development right now. Twelve sourced signals, every one with a confidence label and an action window.

Free readers see the analytical frame in the public newsletter on LinkedIn the same day. Premium subscribers receive the procurement map below: contract numbers, contracting officers, value bands, action timing, and what to do this week.

---

## What changed in the last 90 days

Three movements reshape VA imaging capture in the same fiscal quarter.

VHA cancelled the NTP NextGen PACS multi-vendor consortium in January 2026 and stayed with the Intelerad incumbent. GE HealthCare closed its $2.3 billion acquisition of Intelerad on March 18, 2026, consolidating the modality OEM, the cancelled-program incumbent, and the VAEC cloud hosting position into a single combined entity. VA deployed Oracle Health Millennium at four Michigan sites on April 11, 2026, restarting EHRM after a three-year operational pause and triggering site-by-site imaging integration demand.

The marquee procurement, the National Enterprise Imaging System (EIS), is in acquisition strategy development between RFI close and RFP release. This is the window when requirements get shaped.

---

## Twelve Signals, With Action Windows

### Signal 1: National Enterprise Imaging System (EIS)

**Solicitation:** 36C10X25Q0015
**Issuing Office:** VA Strategic Acquisition Center - Frederick (SAC-F)
**Confidence:** Verified. RFI published; scope figures sourced directly from RFI Amendment 0003 (December 2024)
**Stage:** RFI closed December 20, 2024; acquisition strategy under development
**Anticipated RFP:** Late FY2026 or early FY2027
**Estimated Value:** Multi-billion (no announced ceiling)

**Verified scope per RFI Amendment 0003:** 25+ million annual exams, ~100 petabyte archive migration covering ~17 billion images from VistA Imaging and CAMM 7, hybrid cloud-based VNA with FedRAMP-certified cloud, dual MPI bridging VistA SSN and Oracle Health EDIPI, universal zero-footprint web viewer, specialty AI across radiology, cardiology, endoscopy, dental, pathology, nuclear medicine, ophthalmology, and wound care, bidirectional VA/DoD and community care imaging exchange, DICOM conformance to Joint VA/DoD Rev 3.3.

**Action window (now through RFP drop):**
- Request capabilities briefing with SAC-F Frederick (Tara.Flores@va.gov; Katie.Hulse@va.gov; 202-306-4240)
- Submit white paper addressing four points: data migration risk mitigation for the 100 PB / 17 billion image archive, operational continuity from existing VistA Imaging and CAMM 7, dual-EHR MPI architecture, and long-term support stability
- Build teaming structure: T4NG2 prime + FedRAMP cloud partner + VNA technology anchor + AI integration capability + SDVOSB or SDVOSB JV

**What the NTP NextGen cancellation tells you about EIS evaluation:** Integration risk and program management continuity will be weighted heavily. Best-of-breed teaming without a coherent integration story is the pattern VHA just declined to continue.

---

### Signal 2: Radiology and Imaging FY2025 IDIQ (Joint VA/DoD)

**Solicitation:** 36H79725R0003
**Joint Program:** VA National Acquisition Center + Defense Logistics Agency Troop Support
**Confidence:** Verified. Solicitation closed March 31, 2026
**Stage:** Awards and first task orders imminent
**Estimated Value:** $6.5 billion ceiling over 10 years
**Contract Type:** Multiple-award IDIQ
**NAICS / PSC:** 334517 / 6525
**Contracting Officer:** LaTonya Whiteside (latonya.whiteside@va.gov)

**Action window (Q3 FY2026):** This vehicle will issue task orders against the 13 EHRM deployment sites in 2026 (Michigan live April 11; Wave 2 Ohio and Kentucky June; Wave 3 Indiana August; Wave 4 Cleveland OH and Alaska October). Each site generates modality refresh and integration task order demand. Firms on the IDIQ activate for site-level capture now. Firms not on the IDIQ identify awardees once posted and pursue teaming agreements before task orders flow.

---

### Signal 3: CIES Next Generation (Bi-Directional Image and Report Exchange)

**Solicitation:** 36C10B26Q0076
**Issuing Office:** VA Strategic Acquisition Center
**Confidence:** Verified. RFI closed December 18, 2025
**Stage:** Anticipated formal solicitation FY2026 to FY2027
**Incumbent:** Medicom Technologies (17 of 18 VA VISNs)
**Contracting Officer:** Laura Startek (Laura.Startek@va.gov)

**Current architecture:** HL7 v2 and DICOM, VAEC-hosted, integrating with VistA Imaging, PACS, and Enterprise Precision Scanning and Indexing. Volume: over 5 million annual studies.

**Why the recompete looks different than the incumbent:** The CCN Next Generation RFP (36C10G26R0003), issued December 2025 with Amendment 002 posted April 25, 2026, explicitly requires EHR interoperability with Oracle Health and direct medical record exchange between community providers and VA. That mandate forces FHIR R4 and USCDI-compliant exchange, which the current Medicom architecture does not natively deliver at scale.

**Action window (now):** Build FHIR R4 / USCDI capability stack. Engage Laura Startek at SAC. Position for the formal solicitation by surfacing the technical gap between current incumbent architecture and the CCN Next Gen interoperability requirement. The incumbent has near-universal VISN penetration; the recompete will turn on architectural modernization, not relationship continuity.

---

### Signal 4: VHA Enterprise Mammography Tracking and Reporting System (MTRS)

**Solicitation:** 36C10B26Q0339
**Issuing Office:** Technology Acquisition Center, Eatontown, NJ
**Confidence:** Verified. Sources Sought closed April 27, 2026
**Stage:** RFP pending
**Estimated Value:** $5 million to $20 million over 5 years (1 base + 4 options)
**Contracting Officer:** Terricia Lloyd (Terricia.Lloyd@va.gov; 512-981-4453)

**Scope:** Enterprise mammography tracking, reporting, and compliance for 88 in-house VA mammography programs across 56 VAMC and Healthcare Systems. Integration required with VistA, Oracle Health Millennium, and existing PACS.

**Action window (now through RFP drop):** Low competition, high specificity. The dual EHR integration requirement is the technical filter. Firms with documented HL7 v2 plus FHIR R4 mammography reporting integration experience pass. Firms without it do not. Follow SAM.gov for RFP release.

---

### Signal 5: HINGE Radiation Oncology Platform (Health Information Gateway and Exchange)

**Program:** VA National Radiation Oncology Program (NROP)
**Confidence:** Verified. Sources Sought issued December 2025
**Stage:** RFP pending
**Estimated Value:** $5 million to $15 million (estimate)

**Scope:** Sustainment and enhancement of HINGE, a DICOM and FHIR data abstraction and aggregation platform for radiation oncology quality surveillance. Interfaces with CPRS/VistA, treatment delivery systems via DICOM, treatment planning systems, and FHIR.

**Action window (now):** Highly specialized vertical. Radiation oncology DICOM expertise plus FHIR aggregation experience is the qualifier. Limited competition.

---

### Signal 6: VistA Imaging Sustainment Re-Compete

**Current Contract:** 36C10B23N10240027
**Confidence:** Verified. Current contract value $24.2 million over 5 years
**Stage:** T4NG expires June 30, 2026; re-compete as T4NG2 task order
**Set-Aside:** SDVOSB
**Incumbent:** Clear Vantage Point Solutions, LLC (SDVOSB JV; T4NG2 awardee)
**Issuing Office:** Technology Acquisition Center, Eatontown, NJ

**Action window (Q3 FY2026):** SDVOSB set-aside means a closed competitive field. Firms with SDVOSB status and VistA Imaging operational experience are the eligible pool. Position immediately for T4NG2 task order release.

---

### Signal 7: IaaMS (Peraton) Future Re-Compete

**Current Contract:** Fixed-price, $497 million, 7 years, awarded August 2021
**Confidence:** Verified. Primary contract value sourced from VA OIT and federal procurement records
**Incumbent:** Peraton (Chantilly, VA)
**Stage:** Anticipated re-compete approximately FY2028
**Scope:** VistA Imaging storage at up to 300 VA sites; 28+ petabytes active; integrates on-premises and VAEC cloud

**Why this matters more than the timing suggests:** The IaaMS re-compete intersects with EIS. The Government must decide whether to extend IaaMS as a storage utility layer beneath a new EIS VNA or subsume IaaMS functions into the EIS contract. That sequencing decision has not been made publicly. Firms that build an EIS-IaaMS transition narrative now have a differentiated story when the EIS RFP drops.

**Action window (now through FY2027):** Position for both EIS and IaaMS as a unified narrative. Required credentials: VAEC and AWS storage architecture, large-scale federal data migration, multi-site deployment track record at the 300-site scale.

---

### Signal 8: EHRM Site-by-Site Imaging Integration

**Stage:** Active task-order pipeline through early 2030s
**Confidence:** Verified. Deployment schedule confirmed through VA EHRM published cadence
**Live Sites as of April 27, 2026:** 10 (5 original West/Midwest, North Chicago/Lovell joint VA-DoD, plus 4 Michigan sites live April 11, 2026)
**2026 Wave 2 (June):** Chillicothe OH, Cincinnati OH, Cincinnati-Fort Thomas KY, Dayton OH (4 sites)
**2026 Wave 3 (August):** Fort Wayne IN, Marion IN, Indianapolis Roudebush IN (3 sites)
**2026 Wave 4 (October):** Louis Stokes Cleveland OH, Alaska VA Healthcare System (2 sites)
**Total 2026 deployments:** 13 sites
**Remaining:** ~145 sites (164 total VAMCs minus 19 live by end of 2026 per VA FY2027 Budget in Brief); VA targets 26 additional sites in 2027 and 28 more in 2028

**Repeatable per-site service package:**
- CAMM Appliance installation and configuration
- Skyvue Diagnostic Image Viewer deployment
- CCIA (Cerner CVIX Integration Adaptor) installation
- HL7 interface reconfiguration from VistA v2 to Oracle Health v2/FHIR R4
- PACS HL7 interface re-validation
- VIX service configuration update
- DICOM conformance re-testing for connected modalities
- User training for radiologists, technologists, and PACS administrators

**Action window (site-by-site):** Engage Michigan site program managers now. Wave 2 sites (June) need integration kick-off in May. Wave 3 sites (August) need kick-off in July. Wave 4 sites (October) need kick-off in August. Vehicle: T4NG2 or Oracle Health partner ecosystem. Revenue model is task order per deployment wave with predictable scope.

---

### Signal 9: CCN Next Generation Imaging Exchange Requirement

**RFP Released:** December 2025 (36C10G26R0003); Amendment 002 posted April 25, 2026
**Confidence:** Verified. RFP and program structure confirmed via House Veterans' Affairs Committee testimony, January 22, 2026
**Structure:** Two regions: CCN Next Gen East (29 states + DC, VI, PR) and CCN Next Gen West (21 states + Pacific territories)
**Value:** $700 billion medical IDIQ ceiling for the medical vehicle (36C10G26R0003); combined service categories including dental and ancillary vehicles approach $1 trillion combined ceiling
**Current Contracts Expiring:** TriWest (2 regions) and Optum Serve (3 regions) contracts expire 2026

**The imaging implication:** The RFP requires direct medical record sharing between community providers and VA, plus interoperability with Oracle Health and TRICARE. VA is investing $300 million to modernize EHR system infrastructure specifically for CCN Next Gen interoperability. For imaging, this means community radiology imaging exchange must use FHIR R4 and USCDI-compliant exchange. This is more sophisticated than the current HL7 v2 / DICOM CIES architecture. The TPAs selected for CCN Next Gen will need imaging exchange capability embedded in network infrastructure, creating subcontracting opportunity.

**Action window (through FY2026):** Subcontracting positioning with the eventual CCN Next Gen TPAs. The medical IDIQ ceiling is the headline; the imaging exchange subcomponent is a structurally mandated technical requirement with no incumbent at scale.

---

### Signal 10: NTP PACS Continuity (Intelerad / GE HealthCare)

**Confidence:** Verified to primary source. Sole-source contract 36C10B26C0038 awarded to Intelerad Medical Systems, Inc. (UEI D7K7H9E4MZV9) on April 20, 2026 under solicitation 36C10B26Q0213, total value $11,270,971, firm-fixed-price, FAR 6.302-1 sole-source justification (only one responsible source, OEM proprietary), period of performance April 20, 2026 through October 20, 2028. Sourced from SAM.gov award notice. Intelerad's NTP PACS incumbency since November 2013 sourced from BusinessWire, November 12, 2013. NextGen PACS cancellation confirmed by Mach7 Q2 FY26 earnings call (January 31, 2026, Defense World) and Signify Research (February 2026). GE/Intelerad acquisition closed March 18, 2026 per GE HealthCare press release on BusinessWire.
**Platform:** IntelePACS v5.7, hosted on VA Enterprise Cloud (VAEC/AWS)
**Scope:** 125 VA facilities across all 18 VISNs, 24/7 teleradiology reads
**System Owner:** Jennifer Gersten (Jennifer.Gersten@va.gov; 319-430-3592), VHA 11DIAG National Radiology Program
**ISSO:** Erick Davis (Erick.Davis@va.gov; 512-326-6178)
**Contracting officials on award:** Created by sean.mcavoy1@va.gov; approved by kathryn.pantages@va.gov

**The combined entity's VA asset map:** GE HealthCare modalities at all VA facilities, GE Centricity PACS and Centricity Cardiology Enterprise on the VA-approved HL7 interface list, GE AIR Recon DL deployed for VA CT image enhancement, and Intelerad IntelePACS on VAEC for NTP under contract 36C10B26C0038 through October 2028. End-to-end stack across modality, PACS, AI, and cloud.

**The procurement signal:** FAR 6.302-1 is the statute reserved for procurements where only one responsible source can perform the work, typically because of OEM proprietary technology. The contracting officer's certification on the SAM.gov award notice is a formal determination, not a preference. The period of performance through October 20, 2028 means VA is buying continuity through the EIS RFP release window (anticipated late FY2026 to early FY2027) and well past the expected EIS award date.

**Antitrust and OCI consideration:** Combined modality OEM plus NTP PACS incumbent plus established VAEC cloud position could trigger competitive concerns in the EIS procurement. FAR organizational conflict of interest rules may require firewalls between modality sales activities and EIS proposal activities.

---

### Signal 11: Speech and Reporting (Nuance / Microsoft)

**Contract:** Dragon Medical One Enterprise-Wide Speech Recognition SaaS
**Award ID:** 36C10B25F0110
**Confidence:** Verified. Contract distributed via NASA SEWP V (NNG15SC27B) through Carahsoft
**Value:** $49,335,481.52
**Period:** June 1, 2025 to May 31, 2028
**Authorization:** FedRAMP Moderate; compatible with VA CPRS and Oracle Health Cerner Millennium

**Position:** Nuance/Microsoft is the entrenched enterprise speech and reporting vendor for VHA. PowerScribe One is the AI-powered radiology reporting platform. This is essentially sole-source territory through May 2028.

---

### Signal 12: VA AI Infrastructure Spend

**Confidence:** Verified. Figures sourced from FY2027 VA Congressional Budget Justification
**FY2027 request:** $47.8 million for Decision Intelligence and Automation, a $4.7 million (10.9%) increase over FY2026 enacted
**Driver:** AI Infrastructure solution for piloting and scaling clinical AI tools across clinical domains
**Scale:** VA's 2025 AI Use Case Inventory (released January 2026) documents 367 AI use cases department-wide, up from 227 in 2024 net. 72 use cases were retired during the same cycle, so gross new additions exceed the net 62% figure. 253 of 367 are in VHA healthcare contexts. Approximately 100,000 VA employees use generative AI tools.

**Action window (FY2027 markup, now through summer 2026):** AI infrastructure investment is the next major task-order layer. Firms with FedRAMP-authorized clinical AI inference platforms, model evaluation tooling, and DICOM-compatible AI orchestration are positioned for the standardized inference layer VA is funding.

---

## Competitive Hierarchy at a Glance

| Tier | Vendor(s) | VA Position | Watch For |
|---|---|---|---|
| Combined Incumbent | GE HealthCare + Intelerad | NTP PACS, modality OEM at all VA facilities, AIR Recon DL, VAEC hosting | Antitrust/OCI exposure on EIS; KLAS satisfaction historically below average |
| Established Challengers | Agfa, Sectra, Visage | Agfa best-in-KLAS 2026 across VNA, Universal Viewer, and PACS small; Sectra #1 PACS 13 consecutive years; Visage active VAEC deployment in VISN 23 | Limited federal contracting infrastructure; clinical satisfaction is the strength |
| Component Specialists | Philips, Siemens, Fujifilm, Carestream | Approved PACS interfaces; specialty cardiology depth | Not positioned as enterprise VNA prime competitors |
| Speech/Reporting | Nuance/Microsoft | Sole-source position through May 2028 | Recompete cycle pressure starting late 2027 |
| Community Exchange | Medicom Technologies | 17 of 18 VISNs | Architecture mismatch with CCN Next Gen FHIR R4 mandate |
| Storage Infrastructure | Peraton | $497M IaaMS, 28+ PB, 300 sites | Re-compete intersects EIS in FY2028 |

**Agfa is the most underestimated EIS competitor.** Best in KLAS 2026 across XERO Viewer (Universal Viewer, third consecutive year, 92.1% score), VNA (second consecutive year, 89.8% score), and PACS small/under 300k studies (93.2% score). Recent enterprise wins include Tampa General Hospital/University of South Florida and a major teleradiology group selecting Agfa's Enterprise Imaging Cloud SaaS. The only non-GE/Intelerad vendor with simultaneous Best in KLAS recognition for VNA, Universal Viewer, and PACS.

---

## Three Things Most Capture Teams Are Missing

**One.** The NTP NextGen cancellation is a procurement signal, not a data point. VHA cancelled a multi-vendor best-of-breed consortium and stayed with the incumbent in the same quarter as the broader DOGE contract environment. This tells EIS proposers that integration risk, program management continuity, and transition complexity will be weighted heavily, possibly heavier than technical superiority of any individual component. A best-of-breed team without a coherent integration story is the loss pattern VHA just demonstrated.

**Two.** IaaMS and EIS will intersect, and the boundary is not yet decided. The $497 million Peraton IaaMS contract expires approximately August 2028. The EIS archive must migrate from or subsume IaaMS storage. Whether IaaMS becomes a storage utility layer beneath EIS, or is folded into the EIS contract, is a sequencing question the Government has not answered publicly. Firms that build the EIS-IaaMS transition story have a differentiated narrative.

**Three.** The CCN Next Generation RFP creates a new imaging exchange interoperability mandate. The medical IDIQ has a $700 billion ceiling. The FHIR R4 / USCDI requirement directly obsoletes the current CIES HL7 v2 / DICOM architecture. The TPAs that win CCN Next Gen need imaging exchange capability embedded in their network infrastructure. There is no incumbent at scale for the modernized architecture.

---

## What to Do This Week

If your firm is building toward EIS:

- Send a capabilities briefing request to SAC-F Frederick this week. The acquisition strategy window closes when the RFP drops.
- Map your team to four required capability layers: T4NG2 prime (required for task order flow), FedRAMP cloud partner, VNA technology anchor (Agfa, Sectra, or Visage if you are not GE/Intelerad), AI integration capability, and an SDVOSB or SDVOSB JV partner.
- Draft a four-point white paper covering data migration risk for the 100 PB / 17 billion image archive, operational continuity from VistA Imaging and CAMM 7, dual-EHR MPI architecture, and long-term support stability. Submit to SAC-F.

If your firm is building toward EHRM imaging integration:

- Engage Michigan site program managers now. The four sites that went live April 11 are still in stabilization.
- Pre-position for Wave 2 (June). Chillicothe, Cincinnati, Cincinnati-Fort Thomas KY, Dayton. Integration kick-off needs to start in May. Wave 3 (August) covers Fort Wayne, Marion, Indianapolis. Wave 4 (October) covers Cleveland and Alaska.
- Vehicle access: T4NG2 prime team or Oracle Health partner ecosystem.

If your firm is building toward CIES or CCN Next Gen imaging exchange:

- Build the FHIR R4 / USCDI capability stack. The architectural gap is the wedge.
- Engage Laura Startek at SAC for the CIES recompete cycle.
- Identify likely CCN Next Gen TPA awardees and pursue subcontracting positioning for embedded imaging exchange capability.

---

## What to Watch Next

- EIS RFP release window: late FY2026 to early FY2027. SAM.gov 36C10X25Q0015.
- Radiology and Imaging IDIQ award notices: expected Q3 FY2026.
- CIES Next Generation formal solicitation: anticipated FY2026 to FY2027.
- MTRS RFP release: following Sources Sought close (April 27, 2026).
- HINGE NROP RFP: following Sources Sought (December 2025).
- VA Wave 2 EHRM go-live: June 2026 (Ohio, Kentucky). Wave 3 August 2026 (Indiana). Wave 4 October 2026 (Cleveland OH, Alaska).
- T4NG expiration: June 30, 2026.
- IaaMS re-compete pre-solicitation: approximately FY2027 to FY2028.
- VHA RISE reorganization milestones: 18 VISNs to 5 regions over 18-24 months from early 2026.

---

Let's roll.

— Mary

Mission Meets Tech

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## Premium Subscriber Notice

This Capture Intelligence Sheet is part of your Mission Meets Tech Premium subscription. Free readers receive the analytical frame in the public newsletter the same day; the procurement map, contract numbers, contracting officer contacts, and action windows above are the premium layer.

Questions on a specific signal? Reply directly to this issue. Selected questions are answered in the next Capture Intelligence Sheet.

Tools at your subscriber rate: ProposalPulse $14.99 per assessment (vs. $19.99 standard) and MarketPulse $35 per brief (vs. $50 standard). missionmeetstech.com.

---

## Sources

*Sources verified as of April 27, 2026.*

EIS scope figures (100 petabytes, 17 billion images, 25 million annual exams, dual MPI requirement) sourced directly from VHA RFI 36C10X25Q0015 Amendment 0003, December 2024.

NTP NextGen PACS cancellation confirmed by Mach7 Technologies Q2 FY26 earnings call covered by Defense World on January 31, 2026, in which CEO Teri Thomas confirmed Mach7 was no longer part of the VHA teleradiology program. Thomas called the outcome "disappointing." Corroborated by Signify Research Imaging Informatics Market Update, February 2026, which confirmed VHA "abandonment of the project will see the VHA remain with its existing solution provided by Intelerad" and that the cancellation impacts Mach7 Technologies, Nuance, Blackford, and Microsoft.

Intelerad sole-source upgrade contract 36C10B26C0038 verified to SAM.gov award notice published April 20, 2026 (19:00:39 UTC), notice type code "a" (Award Notice). Solicitation 36C10B26Q0213. Awardee Intelerad Medical Systems, Inc., 800 De Maisonneuve Blvd East, 14th Floor, Montreal, Quebec; UEI D7K7H9E4MZV9. Total value $11,270,971; potential $11.3M. Firm-fixed-price; FAR 6.302-1 sole-source justification (only one responsible source, OEM proprietary). Period of performance April 20, 2026 through October 20, 2028 (2 years, 6 months). Awarding office VA Strategic Acquisition Center. Created by sean.mcavoy1@va.gov; approved by kathryn.pantages@va.gov. Status open as of April 27, 2026; 1.0% complete; $3.7M obligated; $7.6M backlog.

Original NTP NextGen PACS consortium award structure (Frontier Acquisitions prime; Mach7 VNA and eUnity Diagnostic Viewer; Nuance voice recognition; Blackford AI; Microsoft Azure cloud) sourced from PRNewswire, September 6, 2023, and Mach7 ASX disclosure structure (Phase I A$11.7M with potential expansion to A$59.6M total).

Intelerad NTP PACS incumbency since November 2013 sourced from BusinessWire, November 12, 2013.

GE HealthCare completion of $2.3 billion Intelerad acquisition on March 18, 2026 sourced from GE HealthCare press release distributed via BusinessWire and Yahoo Finance March 18, 2026; corroborated by Radiology Business, MassDevice, MPO, and Healthcare IT News (March 18-19, 2026). Intelerad first-year revenue estimate of approximately $270 million with approximately 90% recurring sourced from same release.

CCN Next Generation $700 billion medical IDIQ ceiling sourced from House Veterans' Affairs Committee hearing testimony, January 22, 2026. CCN Next Gen RFP (36C10G26R0003) issued December 2025 with original responses due March 16, 2026, Amendment 002 posted April 25, 2026, East/West two-region structure and EHR interoperability requirements (Oracle Health, TRICARE), sourced from VA SAM.gov publication and HigherGov contract record. $300 million VA EHR infrastructure modernization investment supporting CCN Next Gen interoperability sourced from VA OIT FY2027 Congressional Budget Justification.

VA OIG 25-01255-242, "Review of Veterans Health Administration's National Teleradiology Program," December 4, 2025, confirms NTP scale (125 facilities, all 18 VISNs, 24/7 teleradiology service) and references the August 13, 2024 Assistant Under Secretary for Health for Clinical Services memorandum on NTP support reduction.

VA EHRM deployment status as of April 27, 2026: 10 sites live (5 original West/Midwest sites, North Chicago/Lovell, plus 4 Michigan sites live April 11, 2026). Wave 2 (June 2026) covers Chillicothe OH, Cincinnati OH, Cincinnati-Fort Thomas KY, Dayton OH (4 sites). Wave 3 (August 2026) covers Fort Wayne IN, Marion IN, Indianapolis Roudebush IN (3 sites). Wave 4 (October 2026) covers Louis Stokes Cleveland OH and Alaska VA Healthcare System (2 sites). Sourced from VA EHRM program documentation, VA FY2027 Budget in Brief, and Oracle Health deployment announcements.

VA OIG status of 32 open EHRM recommendations as of FY2027 Congressional Budget Justification (Section III, January 2026) reflects ongoing closure activity from 27 open recommendations as of FY2026 IT Budget Submission (May 2025). VA OIG does not publish a single cumulative outage count; third-party figures ranging from 340 to 400 should be treated as directional only.

Joint VA/DoD DICOM Modality Conformance Requirements Rev 3.3 (December 2024) governs all VA imaging modality acquisitions. VA-Approved DICOM Modality Interfaces and VA-Approved PACS HL7 Interface lists current as of April 2026.

KLAS 2026 awards: Agfa HealthCare best in KLAS for XERO Viewer (Universal Viewer, third consecutive year, 92.1%), VNA (second consecutive year, 89.8%), and PACS small/under 300k studies (93.2%); Sectra PACS #1 in customer satisfaction in North America 13 consecutive years; Visage Imaging #2 momentum, most net-new enterprise selections; GE HealthCare (Global Viewer) recovering from historically low scores, up 6+ points in 2025.

Nuance Dragon Medical One contract value $49,335,481.52, distributed via NASA SEWP V contract NNG15SC27B through Carahsoft Technology Corporation, Award ID 36C10B25F0110, period June 1, 2025 to May 31, 2028, sourced from federal procurement records.

Peraton IaaMS contract value $497 million over 7 years awarded August 2021, scope of up to 300 VA sites and 28+ petabytes, sourced from VA OIT and federal procurement records.

VA AI Use Case Inventory January 2026 (web compliance update April 2026): 367 use cases department-wide (up from 227 in 2024 net), 72 use cases retired during the same cycle. 253 of 367 in VHA healthcare contexts. FY2027 AI budget of $47.8 million for Decision Intelligence and Automation sourced from VA FY2027 Congressional Budget Justification.

DOGE contract environment context (approximately $1.8 billion in VA contracts cancelled and partially reversed in early 2025, including initially-targeted radiation-producing equipment inspection contracts) sourced from CNBC and ABC News reporting February-March 2025; reversal of inspection contracts confirmed in same coverage.

VHA RISE reorganization announcement (December 14, 2025) and structure (18 VISNs to 5 regions over 18-24 months) sourced from VA announcements and Congressional testimony, December 2025 to February 2026.
