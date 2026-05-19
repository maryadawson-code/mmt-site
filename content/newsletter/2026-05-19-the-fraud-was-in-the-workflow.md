---
title: "The Fraud Was in the Workflow"
date: 2026-05-19
slug: the-fraud-was-in-the-workflow
description: "The strongest detail in the HealthSplash case is a physical-exam test, documented as performed, on a patient the clinician had never met. The workflow was the fraud. How American healthcare keeps designing the same disaster, and the procurement language that closes the gap."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "Program Integrity"
  - "Healthcare Fraud"
  - "Telehealth"
  - "DMEPOS"
  - "Hospice"
  - "Home Health"
  - "CMS"
  - "DOJ"
  - "HHS-OIG"
  - "Medicare"
  - "Federal Health IT"
  - "Workflow Assurance"
agencies:
  - CMS
  - HHS
  - DOJ
canonical_url: "https://missionmeetstech.com/newsletter/the-fraud-was-in-the-workflow/"
source: claude_newsletter_project
capture_corner_teaser: "The companion Capture Corner translates the architecture argument into the program-integrity buying market. Six capture lanes (encounter and order provenance, identity and ownership integrity, graph analytics and entity resolution, medical-review workflow modernization, explainable AI and model governance, enforcement-support analytics) mapped against the May 13 nationwide HHA/Hospice enrollment moratorium, the WISeR pilot, the SMRC recompete window, DOJ's West Coast Strike Force and FOCUS initiative, and the six states named for heightened oversight. Buyer map across CMS CPI, CMMI/WISeR, MACs, UPICs, SMRC, HHS-OIG/DOJ/FBI/DEA, DHA/VA/TRICARE, and state Medicaid program-integrity units. Action windows for the next 30, 60, and 90 days plus the URLs Founding Members should be checking this week."
capture_corner:
  - "May 13, 2026 nationwide HHA + Hospice enrollment moratorium translated into six concurrent procurement and demonstration surfaces: identity proofing, site verification, fingerprinting workflow, pre- and post-claim review tooling, ownership graphing, hospice scoring."
  - "Six capture lanes mapped against the workflow-assurance spine, with named federal customers, teaming targets, and a one-page action item per lane."
  - "WISeR participant intelligence: Cohere Health (Texas), Genzeon (New Jersey), Humata Health (Oklahoma), Innovaccer (Ohio), Virtix Health (Washington), Zyter (Arizona); the eight high-risk service categories the pilot covers; SDVOSB and 8(a) subcontract entry points on the documentation, clinical-criteria mapping, and rationale-generation components."
  - "SMRC follow-on solicitation: RFI-CMS-SMRC-2026-001 closed April 23, 2026. Current SMRC is Noridian Healthcare Solutions. Where capture teams should be watching now and the projected solicitation drop window (late June through early August 2026, MMT analytical projection only)."
  - "DOJ buying signal: National Fraud Enforcement Division, West Coast Strike Force in Arizona, Nevada, and Northern California (named targets include digital health technology fraud, Medicaid fraud, sober home fraud, wound care, controlled-substance diversion, and TRICARE-related billing), and the FOCUS initiative as a market signal for qui tam relator support tools."
  - "Buyer map across CMS Center for Program Integrity, CMMI/WISeR, MACs, UPICs, SMRC, HHS-OIG, DOJ, FBI, DEA, DHA, VA, TRICARE program offices, and state Medicaid program-integrity units, with the capture angle for each."
  - "Language guidance: the four sentences a capture team should be using in every program-integrity briefing this year, and the four phrases that read to a senior buyer like a 2018 vendor pitch."
  - "Action windows: build the workflow-assurance reference architecture in the next 30 days; map teaming targets and prepare three use case briefs (DME, hospice/home health, telehealth prescribing) in the next 60; package an end-to-end demo that starts with a suspicious order in the next 90."
  - "Eight capture questions designed to surface the gap between what the federal program-integrity buyer is buying today and what the buyer actually needs, including the one almost no vendor is asking and almost no buyer has answered."
  - "URLs to monitor this week: CMS fraud page, CMS provider enrollment moratoria page, CMS WISeR model page, Federal Register (next moratorium decision point approximately November 13, 2026), SAM.gov, DOJ Office of Public Affairs, HHS-OIG news, and the canonical CMS Hospice and Home Health Moratorium FAQ."
---

# The Fraud Was in the Workflow
## How American Healthcare Keeps Designing the Same Disaster

*The strongest detail in the HealthSplash case is a physical-exam test, documented as performed, on a patient the clinician had never met. The workflow was the fraud.*
![A clinical postcard bearing a knee anatomy illustration suspended between two empty exam rooms. The documented exam that never physically took place.](/images/newsletter/2026-05-19/cover-exam-never-happened.png)


Friends,

I had just started at a new company when my CEO sent me to a customer site to figure out what was happening. I reported directly to him. The customer was complaining about slow networks, and he wanted his own eyes on it. I went out to look.

The technical problem was real. The bigger problem was the building. The floor felt like a timeshare sales room wrapped in medical language. Salespeople pushed expensive body scans to people who had walked in for what they thought was preventive care. The IT environment was so sloppy that unrelated network traffic was degrading the radiology workflow.

I went home and told my CEO what I had seen. He severed the contract.

The customer was Heart Check America. The Illinois Attorney General sued the operation in 2011 for unfair and deceptive practices, alleging high-pressure sales of scans without doctors' orders, ten-year contracts costing up to $7,000, and the use of non-medically-trained sales staff. Colorado regulators later fined the company and its principals $3.2 million. [1] [2]

Nobody at Heart Check America was sitting at a keyboard designing the workflow to defraud anyone. The workflow itself made the abuse possible. Sales pressure, weak clinical governance, expensive equipment, a billing surface. The pieces had been arranged so that abuse was easy and oversight was hard.

The lesson stayed with me. The first sign of trouble is usually technical. The disease underneath is almost always the business model. And the right call at the top of a software company, made on the strength of what a technologist saw on the ground, is the call that rarely gets made and almost always should.

Carry this through the rest of the piece. **Fraud does not begin at the claim. It begins where lead generation, documentation, clinician identity, templates, and payment rules meet.** If you take only one thing from this issue, take that sentence.

One distinction before going further. Telemedicine is not the problem in any of this. Telemedicine is foundational. Rural communities depend on it. Operational medicine depends on it. Behavioral health access depends on it. The Veterans Health Administration runs one of the largest telehealth programs in the world for a reason. The cases below are about bad actors who exploited a legitimate care modality. The fraud was in the workflow, not in the tool. The redesign has to protect access alongside integrity or we will lose both.

## The Pivot Shift Test

The Justice Department announced in May that Brett Blackman, the founder and CEO of HealthSplash, had been convicted for operating a platform that generated false doctors' orders and defrauded Medicare of more than $1 billion. The conduct involved more than $1 billion billed to federal healthcare programs and more than $450 million paid by Medicare and other insurers. Foreign call centers and spam mailers targeted hundreds of thousands of beneficiaries. Vulnerable and elderly people were pushed into accepting medically unnecessary orthotic braces. Doctors signed orders without meaningful patient interaction or any interaction at all. [3]

HealthSplash was the parent of a platform called DMERx, acquired in September 2017. DMERx moved beneficiary information from suppliers and call centers to telemedicine companies, generated doctors' orders, and routed the signed paperwork back into the claims ecosystem. On the surface that reads as ordinary health-tech infrastructure. The indictment described something else.

The original indictment alleged that one defendant directed a change in template wording. The phrase "Based on my conversation with…" was replaced with "Based on my examination and assessment of…" The change made phone consults look like physical examinations. [4]

The indictment alleged that the "Telemed encounter preference" field was omitted from final orders to avoid raising red flags for auditors at the Centers for Medicare and Medicaid Services (CMS). [4]

The superseding indictment alleged that templates included physical-test language. The Pivot Shift test. The One-legged Stand test. For patients the practitioner had never met in person. [5]

A Pivot Shift test is an in-person knee exam. A One-legged Stand test requires watching the patient stand. These are not phrases that belong in a remote order template unless the encounter actually supported them. They were appearing, by the thousands, in documentation for patients who had never been in the same room as the person who signed the order. An audit reviewer reading the order months later would see a clinician documenting hands-on tests for ligament integrity and balance. The reviewer would have no metadata, no audit trail, and no flag showing those tests did not actually occur.

Somewhere, that language became a product decision. Once it did, the false record could scale. By the time CMS audited a claim, the documentation looked like real medicine had happened. The fraud was in the workflow, and the workflow was designed.
![The Order Factory. A six-station assembly line showing how a false clinical order is manufactured before the claim: lead, call center intake, telemed routing, template configuration with language substitution, clinician signature, and claim-ready order.](/images/newsletter/2026-05-19/order-factory.png)


This is the version of the architecture that does not require AI. A few engineers and a workflow tool can already do this much harm. What comes next has the entire toolkit of generative AI behind it.

## The Pattern Holds

The HealthSplash architecture has been visible across federal healthcare fraud enforcement for more than a decade. DOJ's 2019 Operation Brace Yourself charged twenty-four defendants and took action against 130 durable medical equipment (DME) companies, with alleged losses over $1.2 billion. The 2022 telemedicine takedown charged thirty-six defendants across thirteen districts in schemes involving more than $1.2 billion in alleged claims. LabSolutions owner Minal Patel was sentenced to twenty-seven years in prison for a $463 million genetic-testing scheme that routed through telemedicine doctors who signed prescriptions without examining beneficiaries. In April of this year DOJ announced a hospice fraud takedown in California, and on May 13 CMS implemented a six-month nationwide moratorium on new Medicare enrollment for hospices and home health agencies, citing operators shifting across state lines and ownership changes used to obscure control. Kaiser Permanente affiliates agreed to pay $556 million and Aetna agreed to pay $117.7 million to resolve Medicare Advantage coding allegations involving invalid diagnosis codes. [6] [7] [8] [9] [10] [11] [12]

Different products. Different tools. The seam moves. The architecture does not.
![Same Disaster, New Surface. The five-step fraud architecture (acquire, legitimize, document, bill, evade) repeating across DME braces, genetic testing, and hospice product surfaces.](/images/newsletter/2026-05-19/same-disaster-new-surface.png)
 Acquire vulnerable people. Wrap the transaction in medical legitimacy. Generate the documentation. Route the money. Stay ahead of the auditor.

## An Older Warning

Purdue Pharma is the older warning across industries. Misleading OxyContin marketing reshaped what physicians believed about an opioid before they ever wrote the first prescription. That history deserves its own MMT deep-dive in the weeks ahead. For today, what matters is that the architecture is older than software and bigger than Medicare. The same pattern, the same incentives, the same exploitation of trust between provider and patient, shows up wherever the workflow design rewards documentation over evidence. The Pivot Shift test is what it looks like when that pattern moves into federal healthcare technology.

## Why the Next Version Is Worse

Federal healthcare program integrity is built around the claim. Run the claim. Score it for anomalies. Recoup the overpayment. Audit the provider. That regime is necessary. It is also too late.

By the time a fraudulent claim is paid, the documentation has been generated, the doctor's signature has been routed, the patient's identifier has been exploited, and the money has moved. Recovery is a different problem than prevention. The pattern across every case above is that the fraud was designed into the workflow before the first claim was ever submitted.

The federal response is starting to catch up. DOJ stood up a new National Fraud Enforcement Division in April. The Civil Division announced a FOCUS initiative to strengthen its working relationship with qui tam data-miners, the outside investigators who file whistleblower complaints under the False Claims Act. On April 30 DOJ launched a West Coast Health Care Fraud Strike Force in Arizona, Nevada, and Northern California, with digital health technology fraud, technology-driven schemes, and billing tied to TRICARE, the military health system's insurance program, among its named targets. [13] [14] [15]

CMS reports $41.9 billion in Medicare program-integrity savings in FY2025, up from $26.3 billion the year before, with a return on investment of $22.3 to $1. The agency runs roughly 250 AI models against four to five million daily claims and has launched the WISeR prior-authorization pilot in six states with human-clinician review required before any denial of service. The May 13 enrollment moratorium named six states for heightened oversight of new hospice providers: Arizona, California, Georgia, Ohio, Nevada, and Texas. Enhanced enrollment screening for high-risk home health agencies now includes site verification and fingerprinting-based background checks. [16] [17] [18]

The fraud side is moving too. And the fraud side has AI now. Two years ago, that was a forecast. Six months ago, it was a working assumption. Today it is a documented operational reality across multiple federal investigations.

Language models can generate unique clinical narratives that defeat template-based detection. Voice cloning can produce the patient-confirmation call. Deepfake video can produce the telehealth encounter an auditor would have no way to challenge. Synthetic identities can populate the beneficiary side. Spoofed clinician signatures can populate the provider side. Feedback loops can learn which phrasings clear audit flags and which ones do not. The FBI has warned about AI-generated voice impersonation. FinCEN has warned about deepfake media bypassing identity verification. The American Medical Association has issued a deepfake-doctor policy on clinician likeness and voice. [19] [20] [21]

The HealthSplash indictment described what a few engineers and a workflow tool could do with static templates. The next version writes the templates itself, and the exam findings on the next AI-generated order will read as plausible to any after-the-fact reviewer. The auditor will not see it. The patient will not see it. The clinician whose name is on the document may not see it. The investigator will see it months later, in the data exhaust, when the money is already gone.

The same AI that can scale fraud can also scale legitimate access. A rural clinician seeing twice the patients without burning out. An operational medic capturing an assessment in the field. A primary care physician in a frontier county managing a chronic-disease panel that would otherwise require a specialist hours away. The work is to design the layer so the access scales and the fraud does not.

## What That Looks Like

This is solvable. Fraud-resistance is an engineering discipline. Most of what follows already exists somewhere in federal practice. It just has not been written into procurement language for the federal health technology layer.

Every recommendation below can be written into a Statement of Work, a clinical-systems acquisition contract, or a vendor agreement today. The legal authority exists. The technical capability exists. The federal acquisition workforce has the experience to write these requirements. What is missing is the policy decision to require them.

Every reimbursable order should carry structured provenance: beneficiary identity proof, clinician identity proof, encounter modality, encounter duration, clinical basis, lead source, marketing involvement, AI assistance, template version, and submission path. The field exists on the claim. It can exist on the order.
![Provenance Before Payment. A verification gate where ten required provenance elements (clinician identity, beneficiary identity, encounter modality, encounter duration, clinical basis, lead source, marketing involvement, AI assistance, submission path, template version) gate every reimbursable order before it reaches payment.](/images/newsletter/2026-05-19/provenance-before-payment.png)


Telehealth platforms generating reimbursable orders should be designed to NIST identity-proofing standards rather than to the lowest available level. NIST IAL2 and IAL3 are documented federal standards already in production use. [22]

Clinical templates should be versioned, reviewable, and tied to encounter type. AI-generated content should be labeled and preserved in audit logs. A template-governance regime catches the DMERx change at the configuration layer rather than at the courtroom. The "Telemed encounter preference" field that was omitted from final orders is exactly the kind of artifact a template-governance regime is designed to surface.

Fraud-detection AI procurement should require explainability of the kind CMS named when it selected Milliman's glass-box tool, on the documentation side as well as the detection side. Black-box models on either side produce appeals problems for legitimate providers and accountability gaps for everyone. [23]

Graph analytics should connect beneficiary brokers, call centers, telemedicine fronts, labs, suppliers, hospices, billing companies, and clinicians across relationships, ownership, and geography. Order factories are networks. Detection that does not see the network sees only the symptom.

Clinician identity should be protected under the AMA's deepfake-doctor framework. Legitimate clinicians are the first victims when their signatures and likenesses get cloned into a fraud platform.

Federal healthcare technology procurement should require safe-reporting channels with retaliation protections for the network engineer who notices unusual traffic, the support analyst who sees strange ticket patterns, and the implementation lead who finds the integration that does not make clinical sense. The person closest to a fraud scheme is rarely the auditor. It is usually a technologist on a customer site, the way I was on the day I walked into Heart Check America. The reporting channel matters. So does the leader on the other end of it who is willing to act on what the technologist saw.

Federal acquisition workflows should include technical audits of vendor platforms before contract award. The current model awards first and audits later. For platforms that will generate reimbursable orders, the model has to invert: audit the workflow architecture before the contract obligates federal dollars to it.

None of that is technically hard. All of it is procurement language we are not writing yet.

## The People Downstream

The retiree who answers the call about a free knee brace.

The chronic-pain patient whose physician spent a career being told a sustained-release pill was less addictive than morphine.

The rural patient who finally has a behavioral health provider because telehealth exists, and who loses access every time bad actors push policymakers toward restriction instead of redesign.

The operational medic whose telemedicine consult with a specialist hours away is the difference between evacuation and treatment in place.

The clinician whose signature gets routed through a platform he never agreed to.

The technologist who sees the pattern early and has nowhere to take it.

All of them live downstream of the same question. Was the workflow designed to deliver care, or designed to clear a payer?

HealthSplash answered that question for Medicare. The Pivot Shift test was the answer in plain English on a federal document. The next platform will write the templates itself.

The American people are paying for design failures we have known how to fix for a decade. The procurement decision being made on the next federal healthcare technology contract is the answer for whatever comes after HealthSplash.

**No reimbursable order should be easier to fake than to verify.**
![The Fraud Loop. Five-step diagnosis (acquire, legitimize, document, bill, evade) paired with five-step doctrine (verify who, validate why, prove what, control payment, detect and act). Fraud thrives in gaps. Integrity thrives in design.](/images/newsletter/2026-05-19/fraud-loop.png)


That is the procurement requirement. That is the engineering requirement. That is the readiness requirement.

Mission Meets Tech exists to make this kind of design failure visible before the next conviction lands. If you build federal healthcare technology, refuse to ship the workflow that makes the Pivot Shift test possible. If you buy it, refuse to procure it without provenance. If you sign documentation, refuse to sign what you did not do. If you lead a software company and a technologist on your team comes back from a customer site with what I came back with, make the call my CEO made. Sever the contract.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

**Want the capture intelligence behind this analysis?**

MMT Premium subscribers receive the companion Capture Corner with this issue: the program-integrity market mapped to six capture lanes, the May 13 enrollment moratorium translated into procurement action windows, the WISeR participant intelligence, the SMRC recompete monitoring brief, and the specific URLs Founding Members should be watching this week.

**Founding Member rate: $199/year** (locked permanently for the first 100 subscribers)
**Standard rate: $249/year or $29/month**

Plus: 48-hour early access, deep-dive solicitation analysis when major RFPs drop, direct Q&A access, and tool discounts.

**[Subscribe at missionmeetstech.com/pricing](https://missionmeetstech.com/pricing)**

---

## Sources

[1] ProPublica, "Illinois Regulators Sue Heart Scan Company Alleging Deceptive Practices," https://www.propublica.org/article/illinois-regulators-sue-heart-scan-company-alleging-deceptive-practices.

[2] ProPublica, "Colorado Hits Body Imaging Chain With a Hefty Fine," https://www.propublica.org/article/colorado-hits-body-imaging-chain-with-a-hefty-fine.

[3] U.S. Department of Justice, "Owner of Health Care Software Company Convicted in $1 Billion Medicare Fraud Conspiracy," May 2026, https://www.justice.gov/opa/pr/owner-health-care-software-company-convicted-1-billion-dollar-medicare-fraud-conspiracy.

[4] U.S. Department of Justice, original indictment in *United States v. Brett Blackman, Gary Cox, and Gregory Schreck*, Case No. 23-20271-CR-BLOOM/OTAZO-REYES, Southern District of Florida, https://www.justice.gov/criminal/criminal-fraud/file/1588826/dl?inline=.

[5] U.S. Department of Justice, superseding indictment in *United States v. Brett Blackman, Gary Cox, and Gregory Schreck*, https://www.justice.gov/criminal/media/1374716/dl.

[6] U.S. Department of Justice, "Federal Indictments and Law Enforcement Actions in One of the Largest Health Care Fraud Schemes" (Operation Brace Yourself), 2019, https://www.justice.gov/archives/opa/pr/federal-indictments-and-law-enforcement-actions-one-largest-health-care-fraud-schemes.

[7] U.S. Department of Justice, "Justice Department Charges Dozens in $1.2 Billion Health Care Fraud," 2022, https://www.justice.gov/archives/opa/pr/justice-department-charges-dozens-12-billion-health-care-fraud.

[8] U.S. Department of Justice, "Lab Owner Sentenced for $463M Genetic Testing Scheme," https://www.justice.gov/archives/opa/pr/lab-owner-sentenced-463m-genetic-testing-scheme.

[9] U.S. Attorney's Office, Central District of California, "8 Arrested in Health Care Fraud Takedown Including Owners of Hospices Billed Taxpayers," April 2026, https://www.justice.gov/usao-cdca/pr/8-arrested-health-care-fraud-takedown-including-owners-hospices-billed-taxpayers.

[10] Centers for Medicare and Medicaid Services, "CMS Announces Aggressive Nationwide Crackdown on Fraud with Six-Month Hospice and Home Health Agency Enrollment Moratoria," May 13, 2026, https://www.cms.gov/newsroom/press-releases/cms-announces-aggressive-nationwide-crackdown-fraud-six-month-hospice-home-health-agency-enrollment.

[11] U.S. Department of Justice, "Kaiser Permanente Affiliates to Pay $556M to Resolve False Claims Act Allegations," https://www.justice.gov/opa/pr/kaiser-permanente-affiliates-pay-556m-resolve-false-claims-act-allegations.

[12] U.S. Department of Justice, "Aetna Agrees to Pay $117.7 Million to Resolve False Claims Act Allegations," https://www.justice.gov/opa/pr/aetna-agrees-pay-1177-million-resolve-false-claims-act-allegations.

[13] U.S. Department of Justice, "Acting Attorney General Todd Blanche Issues Memorandum on Creation of National Fraud Enforcement Division," April 2026, https://www.justice.gov/opa/pr/acting-attorney-general-todd-blanche-issues-memorandum-creation-national-fraud-enforcement.

[14] U.S. Department of Justice, "Civil Division Announces FOCUS Initiative for Data Miners Filing Qui Tam Complaints," https://www.justice.gov/opa/pr/civil-division-announces-focus-initiative-data-miners-filing-qui-tam-complaints.

[15] U.S. Department of Justice, "Fraud Division Launches West Coast Strike Force to Target Health Care Fraud Schemes Across Arizona, Nevada, and Northern California," April 30, 2026, https://www.justice.gov/opa/pr/fraud-division-launches-west-coast-strike-force-target-health-care-fraud-schemes-across.

[16] Centers for Medicare and Medicaid Services, "Medicare Fraud and Abuse," https://www.cms.gov/fraud.

[17] FedScoop, "CMS Uses AI for Fraud Detection in Medicare and Medicaid Programs," https://fedscoop.com/cms-ai-fraud-detection-medicare-medicaid-programs/.

[18] Centers for Medicare and Medicaid Services, "Wasteful and Inappropriate Service Reduction (WISeR) Model," https://www.cms.gov/priorities/innovation/innovation-models/wiser.

[19] FBI Internet Crime Complaint Center, "Senior U.S. Officials Impersonated in Malicious Messaging Campaign," May 2025, https://www.ic3.gov/PSA/2025/PSA250515.

[20] Financial Crimes Enforcement Network, "FinCEN Issues Alert on Fraud Schemes Involving Deepfake Media Targeting Financial Institutions," https://www.fincen.gov/news/news-releases/fincen-issues-alert-fraud-schemes-involving-deepfake-media-targeting-financial.

[21] American Medical Association, "Deepfake Doctors Are a Problem. Here Are 7 Keys to Stopping Them," https://www.ama-assn.org/practice-management/digital-health/deepfake-doctors-are-problem-here-are-7-keys-stopping-them.

[22] National Institute of Standards and Technology, "SP 800-63A: Identity Assurance Level Requirements," https://pages.nist.gov/800-63-4/sp800-63a/ial/.

[23] GovCIO Media, "CMS Uses Explainable AI to Strengthen Medicare Fraud Detection," https://govciomedia.com/cms-uses-explainable-ai-to-strengthen-medicare-fraud-detection/.
