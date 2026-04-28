---
title: "The Architecture VA Asks For Is Not the Architecture VA Buys"
date: 2026-05-01
slug: the-architecture-va-asks-for
description: "On April 20, the VA Strategic Acquisition Center certified that only one source qualified to upgrade the National Teleradiology Program PACS. Three months earlier, five qualified sources had been delivering on a competing architecture. The procurement system that wrote one document and signed the other is the same system writing the EIS RFP right now."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "VA"
  - "Enterprise Imaging"
  - "EIS"
  - "NTP"
  - "Procurement"
  - "GE HealthCare"
  - "Intelerad"
agencies:
  - VA
canonical_url: "https://missionmeetstech.com/newsletter/the-architecture-va-asks-for/"
source: claude_newsletter_project
capture_corner_teaser: "Three captures running in parallel. Request capabilities briefing with SAC-F Frederick. Track Radiology and Imaging FY2025 IDIQ task orders against the 13 EHRM deployment sites coming online in 2026 (Michigan Apr 11; Wave 2 Ohio/Kentucky June; Wave 3 Indiana Aug; Wave 4 Cleveland/Alaska Oct). Position for the technical wedge between current HL7 v2/DICOM and FHIR R4/USCDI mandate in the CCN Next Generation procurement."
capture_corner:
  - "Request a capabilities briefing with SAC-F Frederick this month for any firm pursuing EIS. Contracting office: Tara.Flores@va.gov, Katie.Hulse@va.gov, 202-306-4240. Submit a white paper that addresses the four points the NTP cancellation made unavoidable: data migration risk for the 17 billion image archive; operational continuity from VistA Imaging and CAMM 7 through the transition window; dual-EHR MPI architecture covering both SSN and EDIPI; long-term support stability for a contract that will run a decade."
  - "Track Radiology and Imaging FY2025 IDIQ task orders. The IDIQ closed March 31, 2026; task orders are imminent. Each of the 13 EHRM deployment sites in 2026 will generate modality refresh and integration work. Michigan went live April 11. Wave 2 sites in Ohio and Kentucky deploy in June. Wave 3 sites in Indiana deploy in August. Wave 4 brings Cleveland and Alaska online in October. Engagement timelines for site-level capture are now."
  - "CCN Next Generation technical wedge: the gap between the current incumbent's HL7 v2 and DICOM architecture and the FHIR R4 and USCDI mandate the RFP creates. Medical IDIQ ceiling $700B per House Veterans' Affairs Committee testimony, January 22, 2026. The TPAs that win will need imaging exchange capability embedded in network infrastructure. There is no incumbent at the modernized architecture scale."
  - "EIS evaluation criterion (analytical): the proposal that wins has to be a single accountable prime that owns end-to-end integration delivery, with federally proven track record at the 100-petabyte scale, that architects open at the layers where openness matters: cloud control plane, AI orchestration framework, modality conformance interfaces, imaging exchange standards. Single-prime accountability for delivery risk; architecturally open at the interfaces EIS actually requires to be modular for the next decade."
  - "OCI window check: Any firm with advisory or analytical roles in the current GENESIS program should be examining its OCI exposure before the EIS solicitation drops, not after. EIS RFI close to RFP release is when the third-structure teaming gets built. By the time the RFP drops, teaming structures are largely fixed and the only variable is execution."
---

*On April 20, the VA Strategic Acquisition Center certified that only one source qualified to upgrade the National Teleradiology Program PACS. Three months earlier, five qualified sources had been delivering on a competing architecture. The procurement system that wrote one document and signed the other is the same system writing the EIS RFP right now.*

---

Friends,

On April 20, 2026, the VA Strategic Acquisition Center signed a sole-source contract with Intelerad Medical Systems for $11,270,971. The award cited Federal Acquisition Regulation 6.302-1, the procurement statute permitting limited-source competition when only one responsible source qualifies. The specific justification on the SAM.gov notice was OEM proprietary technology. The certification is a formal determination on the federal record. Period of performance: April 20, 2026 through October 20, 2028.

Three months earlier, VHA had cancelled a multi-vendor contract in which five qualified vendors had spent two years delivering Phase 1 of a competing architecture for the same teleradiology program. Frontier Acquisitions held the prime. Mach7 provided the vendor-neutral archive and the eUnity zero-footprint diagnostic viewer. Nuance provided voice recognition. Blackford provided AI integration with access to over 100 best-of-breed AI applications. Microsoft Azure provided the cloud platform. Phase 1 deployed mammography reading and stroke triage. The architecture worked.

On Mach7's Q2 FY26 earnings call, covered by Defense World on January 31, 2026, CEO Teri Thomas confirmed Mach7 was no longer part of the VHA teleradiology program. She called the outcome "disappointing."

Five other vendors qualified to deliver this architecture three months ago. Today the procurement record formally states that only one source qualifies. Both statements are accurate. Both come from the same procurement system. The gap between them is the issue.

The Enterprise Imaging System RFP, the largest federal imaging procurement in history, is in acquisition strategy development right now. The same procurement system is writing it. Every firm pursuing EIS is positioning into a procurement that will produce the same gap unless someone names it.

---

## The 90-day sequence on the federal record

Three dated events. All on the public record. Together they show how the federal health IT procurement system actually behaves.

January 2026. VHA issued a Partial Stop Work Order on the NTP NextGen PACS multi-vendor consortium. Phase 1 had completed mammography go-live and stroke triage capability. Phase 2, the architectural expansion across additional Veterans Integrated Service Networks, will not proceed. Signify Research's February 2026 imaging informatics market update confirmed: "abandonment of the project will see the VHA remain with its existing solution provided by Intelerad."

March 18, 2026. GE HealthCare closed its $2.3 billion all-cash acquisition of Intelerad. Intelerad's NTP PACS incumbency dates to November 2013. The combined entity now controls the modality OEM relationship at every VA facility, the National Teleradiology Program PACS position that has run on IntelePACS for over twelve years, the cloud hosting position on VA Enterprise Cloud, and an AI portfolio including AIR Recon DL deployed on VA CT systems. The press release described "an end-to-end, cloud-first and AI-enabled enterprise imaging solution."

April 20, 2026. The VA Strategic Acquisition Center awarded Intelerad the sole-source upgrade contract. Solicitation 36C10B26Q0213. Award number 36C10B26C0038. $11,270,971 firm-fixed-price. FAR 6.302-1 sole-source justification. Period of performance through October 20, 2028.

The contract obligates VA to keep NTP on Intelerad through October 2028. The EIS RFP is anticipated to release late FY2026 or early FY2027. The award comes after that. NTP runs on Intelerad through the entire transition window. The acquisition shapes what comes after October 2028.

VHA wrote one architecture in the EIS RFI. VHA executed the opposite architecture at NTP. Both decisions came from the same procurement office. They are the same decision, made twice.

---

## The architecture VA asks for

VHA's RFI Amendment 0003 from December 2024 lays out what EIS is supposed to be. Hybrid cloud-based vendor-neutral archive. FedRAMP-certified cloud across all storage tiers. Dual master patient index bridging VistA's SSN-based identity and Oracle Health's EDIPI-based identity. Universal zero-footprint web viewer. Specialty-specific AI integration across radiology, cardiology, endoscopy, dental, pathology, nuclear medicine, ophthalmology, and wound care. Bidirectional VA/DoD and community care imaging exchange. DICOM conformance to Joint VA/DoD Rev 3.3.

Twenty-five million annual exams. One hundred petabytes. Seventeen billion images.

This is the open architecture, multi-specialty, multi-vendor, FedRAMP-cloud thesis the imaging informatics industry has been building toward for a decade. Best-of-breed at every layer. Open at the integration points. The architecture VA's own RFI describes wanting.

The architecture VA cancelled at NTP three months ago.

---

## The architecture VA buys

The actual procurement record looks different. The April 20 award notice says no other source qualifies. Behind that certification sits a pattern that repeats across VA enterprise IT.

VistA modernization was supposed to happen in 2014. The IaaMS contract from 2021 funds VistA Imaging through 2028. The Cerner contract from 2018 was supposed to replace VistA on a 10-year timeline. Eight years and $13.84 billion of obligations in, 10 of 164 sites are live. The transition runs at a pace that keeps VistA fully operational at the other 154. The NTP NextGen architecture from 2023 was supposed to deploy across additional VISNs through 2028. It was cancelled before Phase 2 to keep the incumbent fully operational at all 125 facilities.

Each procurement told a story about what the operational system would accept. The operational system absorbs architectural transition only at a pace that keeps the incumbent fully operational in parallel.

Defense Health shows the same pattern. The $96 million Oura wearables sole-source collapsed after WHOOP filed two GAO protests, and DHA acknowledged it could not audit the data the architecture required. The Digital Front Door prototype awards from December 2024 to BDR, Bluestaq, Clearstep, and Ernst & Young will not move to production. Budget pressures killed it. Each one promised an architectural transition the operational system could not absorb.

The architecture document and the operational document never meet.

---

## Take the strongest version of the case

The procurement officers who certified the Intelerad sole-source were doing their job correctly. The work they certified is real work. The systems they are buying continuity for run 24/7 teleradiology coverage for 125 facilities across all 18 VISNs, between 1.0 and 1.5 million studies annually. Stroke triage. Mammography. Acute reads where minutes change outcomes. The operational tolerance for transition disruption at that scale is genuinely low.

VA OIG report 25-01255-242, published December 4, 2025, documents the continuity requirements in the kind of detail that makes the procurement decision look defensible on its own terms. The August 13, 2024 memorandum from the Assistant Under Secretary for Health for Clinical Services on NTP support changes is in the public record. The reasons for keeping the system stable are not invented.

The DOGE contract environment of early 2025 pushed the calculation toward conservatism. VA cancelled approximately $1.8 billion in contracts in early 2025. Among the contracts initially canceled were the annual technical inspection contracts for radiation-producing medical equipment, the inspections legally required under NRC and Agreement State regulations before VA staff can operate CT scanners, MRI machines, and dental X-ray units. The reversal came after VA employees and external contractors pushed back. CNBC's reporting captured the operational reality plainly: a hospital cannot lack a radiology department. NTP NextGen's Phase 2 was a deployment expansion in that environment. A procurement officer choosing operational continuity over architectural advancement in early 2026 is not making an unreasonable choice.

That is the strongest version of the case for what VHA did. A serious defender of the decision would make exactly this argument.

The case is real. The cumulative pattern is the issue.

Applied consistently across federal health IT procurement, this defense produces a system that cannot accept the architecture it asks for. Every individual procurement decision is defensible on continuity grounds. The cumulative pattern is a procurement system that writes one document for the public record and signs another. The defense for any single instance does not defend the system the instances aggregate into.

---

## What this means for EIS

EIS asks for what NTP NextGen asked for, at twenty-five times the scale. The 100 petabytes that EIS must absorb are largely the petabytes IaaMS holds today. The 17 billion images come from VistA Imaging and CAMM 7. The dual MPI bridges the same VistA SSN and Oracle Health EDIPI architectures the EHRM transition is still working through. The specialty AI integration spans eight clinical domains. The bidirectional exchange has to function across VA, DoD, and community care simultaneously.

The market is positioning around EIS the way it positioned around NTP NextGen. Industry briefings describe teaming structures with a vendor-neutral archive partner, a viewer partner, an AI orchestration partner, a cloud partner, and a small-business partner. Best-of-breed at every layer. Open architecture. Multi-vendor.

That structure just lost at NTP.

The architecture lost on procurement system fit. Five vendors could not deliver parallel incumbent operation through Phase 2 deployment at NTP scale. Whatever scored that risk at NTP will score it again at EIS, at twenty-five times the magnitude and across a longer transition window. The combined GE HealthCare and Intelerad enters the EIS evaluation as the only firm that has just demonstrated to the federal record that it qualifies as a single responsible source for VA enterprise imaging at scale.

Best in KLAS 2026 helps with technical positioning, not procurement system fit. Agfa HealthCare won three best-in-segment awards in 2026: XERO Viewer for Universal Viewer (third consecutive year, 92.1%), VNA (second consecutive year, 89.8%), and PACS small/under 300k studies (93.2%). The only non-GE-Intelerad vendor with simultaneous best-in-class for VNA, Universal Viewer, and PACS. Sectra has held the number one PACS customer satisfaction position in North America for thirteen consecutive years. Visage 7 is already deployed across multiple VISN 23 sites and is expanding on VAEC.

The challenger pool has the technical credentials the EIS RFI describes wanting. What it does not have is a documented track record at federal scale that lets a procurement officer write the FAR justification for selecting it without exposing the file to protest. A capture team that arrives at EIS with a five-vendor wiring diagram and KLAS rankings is answering the question VHA already answered against the same architecture.

A team that arrives at EIS with a coherent integration story, a defensible plan for migrating 100 petabytes off VistA Imaging and CAMM 7 without operational disruption, and an explicit position on how the proposal handles the program management risk that just produced the NTP cancellation is answering a different question. That is the question the EIS evaluation is going to be asked, whether or not the RFI says so.

---

## What the proposal that wins has to be

Two failure patterns are now visible on the federal record. The pure best-of-breed multi-vendor wiring diagram lost at NTP because the procurement system that scored it could not accept the integration risk at clinical scale. The pure incumbent continuity proposal cannot win EIS because EIS, on the RFI's own terms, requires real architectural transition: dual MPI bridging, a 100-petabyte archive migration, FHIR R4 community care imaging exchange, and specialty AI integration across eight clinical domains. The first proposal is the one VHA just rejected at smaller scale. The second proposal is the one the EIS RFI itself rejects in writing.

The proposal that wins EIS has to be a third structure. A single accountable prime that owns end-to-end integration delivery, with federally proven track record at the 100-petabyte scale, that architects open at the layers where openness matters: the cloud control plane, the AI orchestration framework, the modality conformance interfaces, the imaging exchange standards. Single-prime accountability for delivery risk. Architecturally open at the interfaces that EIS actually requires to be modular for the next decade.

A FAR justification has to be writable for whichever proposal wins. The procurement officer who selects the EIS prime will need to defend that selection on the federal record the same way the NTP sole-source was defended on April 20. The proposal that lets the procurement officer write that justification cleanly is the proposal positioned to win. Justification means demonstrated past performance at federal data migration scale. It means production deployment of multi-EHR integration in operational settings. It means FedRAMP-authorized cloud architecture combined with KLAS-validated clinical merit at the layers VA cares about. The justification gets written from the procurement officer's perspective, not the proposer's.

No firm in the current VA enterprise imaging capture market combines all of these. The combined GE HealthCare and Intelerad has procurement system fit, federal scale, and KLAS-validated technical credentials, but it approaches EIS from incumbent continuity. Incumbent continuity is the position the EIS RFI itself rejects in writing. The KLAS-validated challengers (Agfa, Sectra, Visage) hold the architectural credentials and the clinical satisfaction track records. They lack the federal delivery track record at 100-petabyte scale that lets a procurement officer write the FAR justification cleanly. The federal systems integrators (Peraton, GDIT, Accenture Federal Services) hold operational scale at VA. Peraton specifically holds the IaaMS contract and runs VistA Imaging storage at scale. IaaMS is a storage-and-bridging position. None of the SI primes have demonstrated end-to-end clinical imaging architectural depth across the eight specialty AI domains EIS requires.

The acquisition strategy window between the EIS RFI close and the RFP release is when the third structure gets built. By the time the RFP drops, the teaming structures are largely fixed and the only variable is execution. Capture teams building the integration story now are positioning into the question the evaluation will actually ask. Everyone else is positioning into a question the procurement system has already answered.

---

## Three captures running in parallel

For BD and capture teams pursuing EIS, request a capabilities briefing with SAC-F Frederick this month. The contracting office is at Tara.Flores@va.gov, Katie.Hulse@va.gov, 202-306-4240. Submit a white paper that addresses the four points the NTP cancellation made unavoidable. Data migration risk for the 17 billion image archive. Operational continuity from VistA Imaging and CAMM 7 through the transition window. Dual-EHR MPI architecture covering both SSN and EDIPI. Long-term support stability for a contract that will run a decade. The white paper that lands is the one that names the procurement system pattern directly and offers a credible plan for not repeating it.

For firms positioned for the Radiology and Imaging FY2025 IDIQ that closed March 31, 2026, task orders are imminent. Each of the 13 EHRM deployment sites in 2026 will generate modality refresh and integration work. The Michigan sites went live April 11. Wave 2 sites in Ohio and Kentucky deploy in June. Wave 3 sites in Indiana deploy in August. Wave 4 brings Cleveland and Alaska online in October. Engagement timelines for site-level capture are now.

For firms tracking the CIES recompete, the technical wedge is the gap between the current incumbent's HL7 v2 and DICOM architecture and the FHIR R4 and USCDI mandate the CCN Next Generation RFP creates. The CCN Next Gen medical IDIQ has a $700 billion ceiling per House Veterans' Affairs Committee testimony from January 22, 2026. The TPAs that win will need imaging exchange capability embedded in network infrastructure. There is no incumbent at the modernized architecture scale.

---

## The teleradiologist and the room in Frederick

Somewhere in the National Teleradiology Program, a radiologist is reading a stroke CT at 2:47 a.m. The patient is in a small VA medical center with no overnight radiology coverage. The image has traveled from the modality through the local PACS, into the VistA Imaging Exchange, across to the central exchange in VA Enterprise Cloud, and onto her workstation. She returns the read in under twelve minutes. The neurology team at the originating site decides on tPA.

She reads on Intelerad's IntelePACS, the platform NTP has run since November 2013. Phase 1 of the cancelled NextGen PACS upgrade improved her viewer, her worklist, and her AI triage layer for stroke and mammography. Those improvements are deployed. Phase 2 was the architectural step that would have rolled the next-generation environment further across the VA enterprise. Phase 2 is gone.

The contract that runs her workstation is locked in until October 20, 2028. The procurement that determines what platform replaces it after that date is being shaped right now, in an acquisition strategy room in Frederick, Maryland, by the same contracting office that just signed the FAR 6.302-1 certification. The room has the EIS RFI on one screen. The room has the OIG NTP review on another. The room knows what it just did at NTP. The room is being asked to shape the acquisition strategy for a procurement that, by the same logic the room just applied at NTP, cannot select the architecture the requirements describe.

The reads continue.

Whether EIS produces what its RFI describes depends on someone in that room naming the gap. The window closes when the RFP drops.

Let's roll.

— Mary

Mission Meets Tech

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

Today's free issue covers the analytical frame. Premium subscribers received the May Capture Intelligence Sheet this morning: the full procurement map, contracting officer contacts, action windows, and capture priorities across twelve signals in VA enterprise imaging.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.
**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

Sources verified as of April 27, 2026. NTP NextGen PACS cancellation confirmed by Mach7 Technologies Q2 FY26 earnings call coverage in Defense World, January 31, 2026, in which CEO Teri Thomas confirmed Mach7 was no longer part of the VHA teleradiology program. Thomas called the outcome "disappointing." Cancellation corroborated by Signify Research Imaging Informatics Market Update, February 2026, which confirmed the project's "abandonment" and that "the VHA will remain with its existing solution provided by Intelerad." Sole-source upgrade contract 36C10B26C0038 awarded to Intelerad Medical Systems, Inc. (UEI D7K7H9E4MZV9) on April 20, 2026 under solicitation 36C10B26Q0213 confirmed via SAM.gov award notice; total value $11,270,971; firm-fixed-price; FAR 6.302-1 sole-source justification (only one responsible source, OEM proprietary); period of performance April 20, 2026 through October 20, 2028; awarding office VA Strategic Acquisition Center. Original NTP NextGen PACS consortium award structure (Frontier Acquisitions prime; Mach7 VNA and eUnity Diagnostic Viewer; Nuance voice recognition; Blackford AI; Microsoft Azure cloud) sourced from PRNewswire, September 6, 2023. Intelerad NTP PACS incumbency since November 2013 sourced from BusinessWire, November 12, 2013. GE HealthCare completion of $2.3 billion Intelerad acquisition on March 18, 2026, base purchase price, $270 million first-year revenue estimate with approximately 90% recurring, sourced from GE HealthCare press release distributed via BusinessWire and Yahoo Finance March 18, 2026; corroborated by Radiology Business, MassDevice, MPO, AuntMinnie, and Healthcare IT News (March 18-19, 2026). EIS scope figures (100 petabytes, 17 billion images, 25 million annual exams, dual MPI requirement) sourced directly from VHA RFI 36C10X25Q0015 Amendment 0003, December 2024. NTP scale (125 facilities across all 18 VISNs, 24/7 service) and August 13, 2024 NTP support reduction memorandum confirmed in VA OIG 25-01255-242, "Review of Veterans Health Administration's National Teleradiology Program," December 4, 2025. EHRM lifecycle facts (Cerner contract 2018, $13.84 billion obligations through Q2 FY2025, 10 of 164 sites live as of April 2026) sourced from VA FY2027 Congressional Budget Justification, GAO-26-108812, and prior MMT analysis. Peraton IaaMS contract value $497 million over 7 years awarded August 2021, scope of up to 300 VA sites and 28+ petabytes, sourced from VA OIT and federal procurement records. Oura wearables $96 million sole-source collapse after WHOOP GAO protests sourced from prior MMT analysis (MHS Triad coverage); Digital Front Door prototype award structure (BDR, Bluestaq, Clearstep, Ernst & Young; December 2024) and termination sourced from same. DOGE contract environment context (approximately $1.8 billion in VA contracts cancelled and partially reversed in early 2025, including radiation-producing equipment inspection contracts) sourced from CNBC and ABC News reporting February-March 2025. KLAS 2026 awards (Agfa best-in-class for XERO Viewer 92.1%, VNA 89.8%, PACS small 93.2%; Sectra #1 customer satisfaction 13 consecutive years; Visage active VAEC deployment in VISN 23) sourced from KLAS Research 2026 Best in KLAS reports. CCN Next Generation $700 billion medical IDIQ ceiling sourced from House Veterans' Affairs Committee hearing testimony, January 22, 2026.
