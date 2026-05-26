---
title: "A Researcher Talked a Clinical AI Out of Its Own Rules. DHA Is Fielding the Same Design."
date: 2026-05-26
slug: a-researcher-talked-a-clinical-ai-out-of-its-own-rules
description: "No code. No exploit kit. Plain English. A security researcher pulled 60 pages of hidden instructions out of an AI doctor, rewrote them, made it triple a drug dose. The Defense Health Agency is fielding the same architecture in military exam rooms right now."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "Clinical AI"
  - "DHA"
  - "Prompt Injection"
  - "Ambient AI Scribe"
  - "MHS GENESIS"
  - "Patient Safety"
  - "Federal Health IT"
  - "FDA"
  - "Doctronic"
  - "Mindgard"
  - "CDAO"
  - "Autonomous Coding"
  - "Improper Payments"
  - "TRICARE"
  - "PCCP"
agencies:
  - DHA
  - VA
  - HHS
  - FDA
  - CMS
  - DoD
canonical_url: "https://missionmeetstech.com/newsletter/a-researcher-talked-a-clinical-ai-out-of-its-own-rules/"
source: claude_newsletter_project
capture_corner_teaser: "The companion Capture Corner translates the patient-safety argument into procurement specifics: the four DHA offices where the money sits (CIO/PEO MS, Program Integrity, CDAO AI Rapid Capabilities Cell, J-6), the contract language to put in front of a contracting officer before the next clinical AI buy, eight questions that separate a real AI security posture from a slide about one, and the SAM.gov keywords and vehicles to watch before the requirement is written."
capture_corner:
  - "Play 1 — The four DHA offices where the money sits. DHA CIO / PEO Medical Systems (Pat Flanders, dual-hat) is the center; the December 2025 Ask Sage IL-5 enterprise agreement was a CIO action. DHA Program Integrity owns 14 consecutive years of OIG findings on unreliable improper-payment estimates. CDAO and the AI Rapid Capabilities Cell ran the CAIRT medical-LLM red team — the benchmark datasets become the evaluation criteria. DHA J-6 shapes the requirement before the money moves."
  - "Play 2 — Six contract clauses to push before the next clinical AI buy. Adversarial testing (prompt injection, SOAP-note persistence, safety-filter bypass, fabricated-document injection — pre-deployment and quarterly). Session integrity audit trail (verifiable inputs, model version, external content; logs retained 7 years). IL-5 PHI certification (FedRAMP High equivalency, ATOs inside 90 days). FDA CDS transparency (algorithm, training data, validation method, known limits). Improper-payment anomaly detection (AI coding tools flag deviations before claims go out). Coordinated disclosure (24-hour notification of credible vulnerability reports affecting documentation, coding, or decision support)."
  - "Play 3 — Eight questions for incumbents and AI vendors. SOAP-note persistence testing. Fake regulatory bulletin discrimination. Day-1-to-Day-30 vulnerability disclosure walkthrough. Catch point for a manipulated dose reaching the coding engine. IL-5 PHI authorization status. CDAO red-team history and remediation. FDA January 2026 transparency compliance. CMS RADV-grade audit documentation per assigned code."
  - "Play 4 — Teaming partners and the moat. Ask Sage holds the first IL-5 PHI authorization at DHA (December 2025); sub to them on the PHI layer or prime with them as your IL-5 path. Humane Intelligence ran the CDAO CAIRT medical pilot. Mindgard demonstrated the clinical-AI attack now driving the conversation. Rise8 / Thoughtworks Federal are scaling the VA ambient scribe from a 10-site pilot toward 130-plus medical centers. Nuance / Microsoft Dragon Copilot is the dominant commercial scribe with EHR integration paths."
  - "Play 5 — Federal market beyond DHA. VA scaling ambient scribes from 10-site pilot toward 130-plus medical centers (largest integrated health system in the country, T4NG2 the vehicle). CMS scaling Medicare Advantage audits from roughly 60 plans toward 550 (tens of billions in estimated annual overpayments). FDA Digital Health Center of Excellence owns the decision-support guidance that created the compliance question. HHS OIG audits the improper payments and has flagged AI-assisted coding as a near-term target. A capability built for the DHA problem is a capability with a federal market behind it."
  - "SAM.gov and RFI keywords to watch: ambient listening, ambient scribe, clinical note summarization, AI red teaming, CAIRT, payment integrity, PIIA compliance, IL-5 PHI, clinical decision support software, autonomous medical coding, prompt injection, adversarial AI testing, MHS GENESIS integration, AI assurance, SOAP note integrity."
  - "Vehicles to track: CIO-SP3 (and CIO-SP4 once the protest clears) where Task Area 7 covers AI security; PEO DHMS task orders for any EHR-adjacent AI overlay; CDAO AI Rapid Capabilities Cell contracts; VA T4NG for the scribe scale-out; SEWP V for off-the-shelf AI security tools; TRICARE managed-care support recompetes for payment-integrity scope."
  - "Editorial discipline note. The issue makes a patient-safety argument. The Capture Corner is that same fact read from the buy side. A documented vulnerability with no requirement attached is a procurement category still forming. The question is who is standing there when it hardens into a line item — and a clinical AI contract that names a security-disclosure timeline and an authorized red-team channel is the assurance worth selling."
---

# A Researcher Talked a Clinical AI Out of Its Own Rules. DHA Is Fielding the Same Design.
## No code. No exploit kit. Plain English. The system that drafts your troops' medical notes runs on instructions that can be argued with.

![A dark close-up of a single tan clinical-note form lying on a high-tech surface. A thin red signal line traces out of one corner of the page and flows into a network of black circuit pathways stitched across the dark floor, suggesting that one sentence on the page is propagating into every downstream system. Sparse light from above isolates the page; the rest of the frame is shadowed. The cover image for the issue.](/images/newsletter/2026-05-26/cover-attack-surface.png)

Friends,

This spring a security researcher broke a clinical AI that gives patients medical advice. He used no code and no exploit kit. He typed plain English until the system handed over the sixty pages of hidden instructions it runs on. Then he rewrote them.

With the rules rewritten, he made the AI triple a drug dose and forge a public-health notice.

The Defense Health Agency is fielding the same kind of system right now, listening in exam rooms and drafting the medical record of the troops it sees.

One disclosure before we begin. Before Mission Meets Tech, I worked on the federal strategy that brought ambient listening into military medicine. I helped build the road this issue is about. I am writing it because I know where it leads.

## Start With the Money

Start with the money. The money is the part everyone agrees on.

Anthropic raised in February at a valuation of 380 billion dollars. By the middle of May it was reported to be raising again, with talks pointing past 900 billion. Medical AI is moving the same direction. OpenEvidence reached 12 billion dollars in January. Abridge crossed 5 billion last summer and has kept climbing since.

In February, Claude reached number one on the Apple App Store. Anthropic says its daily signups have tripled since November.

Cathie Wood, who runs ARK Invest, compared the moment to the arrival of the personal computer. The whole office gathering around one desk to watch what the machine could do.

That is how you talk about infrastructure. Something permanent, load-bearing, assumed. The valuations have decided clinical AI is a settled thing.

The same season those numbers climbed, a patient-safety organization called ECRI ranked the misuse of AI chatbots in healthcare the number one health technology hazard for 2026. The investors and the safety reviewers are looking at the same technology and seeing opposite things.

## What a Researcher Found Inside the AI Doctor

Now set those valuations against Doctronic.

Doctronic is an AI health assistant. It talks to patients and drafts their clinical notes. In March, a security firm called Mindgard published what happened when its researcher Jim Nightingale sat down to test it.

Nightingale did not write code. He did not use an exploit kit. He typed a sentence telling the system the conversation had not started yet, that it was speaking with the system itself and not a patient.

The model believed him. It handed over its hidden instructions.

He pulled nine separate sets of them. Doctronic runs a coordinator model and eight specialist sub-models, each with its own hidden system prompt, routed by codes the patient never sees. Nightingale extracted all of it: the clinical pathways, the dosage rules, the interaction flows, and one instruction, in capital letters, ordering the system never to reveal any of this.

The instruction telling Doctronic to keep its instructions secret was itself just text. He talked past it in a single message.

Doctronic is one product. The weakness is not unique to it. Researchers publishing in Nature Medicine last year showed the same fragility from another direction. Corrupting one part in a hundred thousand of a medical model's training data raised its rate of harmful answers, and the change was too small for a standard benchmark to catch. One attack arrives in the conversation. The other arrives in the training data. Clinical AI, as it is built today, trusts text it cannot verify.

![The Attack Surface Is Language. A dark editorial composition with a clinical SOAP note in the center of a desk, lit from above. Labeled lines fan in from the left side — referral letter, patient portal message, free-text field, scanned document, prior note — each one feeding into the note. A red highlighted block on the PLAN section of the note carries a glowing red trace into a small neural-network icon labeled Ambient AI Scribe, which then outputs to a Structured Clinical Note. The caption reads: The instruction survives the transformation. Three icons at the bottom label the takeaways: It's not a hack — it enters through normal clinical communication. It's not blocked — it looks like context. It becomes truth — every downstream system treats it as part of the record. The frame includes a coffee mug with a medical caduceus, a black flag patch, and a small notepad showing the EHR-to-CDS-to-coding-to-claims-to-payment feedback loop.](/images/newsletter/2026-05-26/attack-surface-is-language.png)

## What Reaches the Clinician

With the instructions in hand, the manipulation was simple.

The researchers walked Doctronic into tripling a baseline OxyContin dose. They had it generate a fake public-health notice retracting vaccine guidance, dressed in an official-sounding name and a date.

Then they wrote the manipulated content into the SOAP note the system generates for a licensed physician.

A SOAP note is the structured clinical record. Subjective, objective, assessment, plan. It is the artifact a busy clinician reads to get up to speed on a patient fast. Doctronic's own marketing claims its notes match board-certified clinicians more than 99 percent of the time.

The design depends on the clinician trusting that note, because the clinician does not have time to rebuild it. Poison that note and the false record reaches the one place it does real damage. The desk of the person who signs the orders.

Mindgard reported the flaw to Doctronic in January. The company closed the ticket twice without fixing the problem. As of early March, Mindgard's chief product officer said that, as far as the firm knew, the system was still vulnerable.

## This Is Already a DHA Story

Doctronic operates in a Utah regulatory sandbox, far from any military treatment facility. The architecture it runs on does not stay in Utah.

In December, the Defense Health Agency signed an enterprise agreement for a generative AI platform cleared at Impact Level 5, the authorization tier for protected health information. It is the first such platform approved to handle PHI across DHA.

Ambient AI scribes are already running. These are tools that listen to the visit and draft the clinical note while the provider talks to the patient. DHA ran a limited fielding at four military treatment facilities last winter. The phased rollout across the Military Health System began in February, Walter Reed among the first sites.

The pattern is the one Mindgard broke. A clinical AI produces a structured note. A time-pressured clinician trusts it. The note flows into the record.

DHA does not need Mindgard to know this. More than a year before the first ambient scribe went live, the Pentagon's Chief Digital and Artificial Intelligence Office ran a red-team pilot, with DHA and the MHS GENESIS program office, on AI models built for clinical note summarization. That is the same job an ambient scribe does. The pilot found more than 800 potential vulnerabilities and biases.

DHA has spent the last year reframing itself as a combat support agency, telling its workforce to prepare for a fight. Clinical AI fielded under that banner is wartime infrastructure, and it inherits a wartime threat model.

Prompt injection does not require access to the AI vendor. It requires text.

![The Sentence That Enters the Chain. A clean line-drawing schematic on a soft cream background showing five separate document icons on the left — referral letter, portal message, free-text field, scanned document, prior note — each connecting by a thin blue line into a single rectangular node labeled Ambient AI scribe. One of the five document icons, free-text field, carries a small red underline. A single blue arrow leaves the ambient scribe node and points to a larger document on the right labeled Structured clinical note. The structured note shows a small red mark on one line — the underlined sentence from the free-text input has survived intact into the official record.](/images/newsletter/2026-05-26/sentence-enters-chain.png)

A referral letter, a free-text field, a patient-portal message, a scanned document. Anywhere words can sit and wait for a model to read them as instructions.

MHS GENESIS, the Department of War's electronic health record, is full of free text. So is every referral and every patient message that feeds it.

## The Closed Loop

The clinical note has one more stop. The billing office.

Medical coding is moving toward automation, and military medicine has been steering for it on purpose. Software reads the note, assigns the diagnosis and procedure codes, and returns them to the record with little or no human coder in between. The ambient scribe drafts the note. The autonomous coder reads it. The claim goes out. A model wrote the record, a model priced it, a model billed it, and the case for building it that way is real. It is faster, it is cheaper, and it promises fewer of the coding errors that generate improper payments.

That pressure is not abstract. The Government Accountability Office put federal improper payments at 186 billion dollars for fiscal 2025, more than half of it in health care, and 24 billion higher than the year before. DHA carries its own version. A May 2025 DoD Inspector General audit of how the agency monitors TRICARE payments found the program paying 11,500 dollars for a custom sleep-apnea mouthguard in Illinois, and 3,000 dollars for the same device in Iowa next door. An earlier audit found DHA could not produce a reliable improper-payment estimate for its own health benefit program at all.

So automation reads as the fix. Faster claims. Fewer errors. A cut at the waste number every agency is now under orders to bring down.

It is a closed loop, and a closed loop assumes the note going into it is clean.

![The Model-to-Model Conveyor. A cream-background infographic showing a horizontal conveyor belt carrying eight rectangular document cards left to right: Patient Visit, Ambient AI drafts note, Structured Clinical Note, then a Human Review Checkpoint gate, then Autonomous Coder reads note, Diagnosis / Procedure Codes, Claim Goes Out, Paid Claim. Two horizontal lines run beneath the cards. A solid red line — labeled Compromised Note — passes straight through every stage including the checkpoint, with the caption: A single injected sentence becomes part of the official record and is treated as truth by every downstream model. A dashed teal line — labeled Clean Path — diverges at the checkpoint gate. The caption: If the human catches it here, the downstream models never see the injected content. A small inset block in the lower right reads: Human Review Is a Control, Not a Formality. Without it, automation becomes amplification. Title at top: The Model-to-Model Conveyor. Subtitle: Once the note is written, other models believe it.](/images/newsletter/2026-05-26/model-to-model-conveyor.png)

Doctronic is the proof the assumption does not hold. Poison the note upstream with one line of injected text and the manipulated record keeps moving. Into the code. Into a paid claim. A tool bought to shrink improper payments becomes a way to manufacture one.

That is the convergence. Waste pressure pushing toward automation, AI capable enough to take the human out, and a clinical note at the head of the loop that a sentence can rewrite.

## The Regulator Moved the Fence the Wrong Way

In January, the FDA relaxed its oversight of clinical decision support software. Tools that produce a single recommendation, the kind that once drew tighter review, now draw less.

The guidance is about accuracy and transparency. It is silent on whether a tool can be talked out of its own rules. The civilian regulator loosened the perimeter on the question of whether the AI is right, and left the question Mindgard just answered, whether the AI can be turned, outside the fence entirely.

DHA cannot follow that fence line. A civilian accuracy standard assumes honest error. The military threat model assumes an adversary who will write a payload into a medical record on purpose. One of those was built to catch the other. It was not this one.

## What This Asks of the People Buying It

If you are standing up clinical AI inside DHA, the Doctronic case is a red-team finding, not a Utah news story. The architecture Mindgard broke is the architecture being fielded. Before the next treatment facility goes live, someone has to test whether the deployed tools can be talked out of their instructions in plain English. Run that test and the rollout has a floor under it. Skip it and the rollout is moving on faith.

Contracts are the place to make that permanent. Mindgard's warning to Doctronic sat in a ticket, closed twice, while a researcher held proof of a dose-tripling exploit. A DHA clinical AI contract should name a response timeline for security disclosures and an authorized red-team channel. A vulnerability that changes a dose is a patient-safety event. The contract language should treat it as one.

Evaluation has to separate two questions vendors will work to merge.

![Accuracy Is Not Trust. Two parallel test panels on textured off-white paper, divided by a vertical line. Left panel: a navy-blue circular stamp marked with a check inside concentric measurement rings, labeled at top TEST: ACCURACY and at bottom RESULT: PASSED in steady navy ink. Right panel: a near-identical stamp, but cracked through the middle by a jagged red fissure that erupts to the right edge of the frame, scattering pixelated red data fragments into the air. The right stamp is marked with a red X and labeled at top TEST: RESISTS MANIPULATION and at bottom RESULT: FAILED in red ink. The composition makes the point that a system can pass one test and fail the other, and that vendors will treat them as the same question if buyers let them.](/images/newsletter/2026-05-26/accuracy-vs-manipulation.png)

One is whether the AI is accurate. The other is whether the AI can be manipulated. A model can score well on the first and fail the second completely. Doctronic did. A medical device buy already tests cybersecurity alongside function. Clinical AI acquisition has to do the same, or it is buying half a system and calling it whole.

And the loop should stay open a while longer. Autonomous coding is on the DHA roadmap. An autonomous coder reading an ambient-AI note puts two models and no person between a patient visit and a paid claim. The efficiency case for closing that gap is real. So is the case for keeping one human inside it until the note feeding it can be trusted.

The word jailbreak is in heavy rotation this month. Hold the meanings apart. The Army has used it for a push to make defense vendors open their system interfaces. Anthropic uses a close cousin of it for a program that hunts software flaws at machine scale. The clinical version, the one this issue is about, is what happens when an interface like that turns out to have almost nothing behind it. Three uses of one word. Only one ends at a patient.

## Downstream

The market has decided clinical AI is infrastructure. Military medicine does not get to make that assumption. It has to be earned, one facility and one red team at a time.

The military can confirm the identity of a system three time zones away before it shares a single byte with it. A clinical note can now be drafted by one model, read by a second, and billed by a third. No one in that chain can confirm where the words came from.

Downstream is a clinician trusting a clean, structured note because there is no time not to. Or no clinician at all, just the next model in the line. Past all of it is a service member whose dose, whose clearance to fly, whose paid claim rests on a record that a sentence can rewrite.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue has a companion. Premium subscribers also get the Capture Corner, the same story read from the buy side.

It names the four DHA offices where the money sits. It gives you the contract language to put in front of a contracting officer, the eight questions that separate a real AI security posture from a slide about one, and the SAM.gov terms to watch before the requirement is written.

The issue tells you the gap is real. The Capture Corner tells you where to stand in it.

Founding Member rate: $199 a year, locked for the first 100 subscribers. Standard rate $249 a year or $29 a month. Institutional access, five seats, $2,500.

Subscribe at [missionmeetstech.com/pricing](/pricing).

---

## Sources

[1] Mindgard, "Doctronic is Now Accepting New Patients (and Unsafe Instructions)," Mindgard, March 6, 2026, https://mindgard.ai/blog/doctronic-is-now-accepting-new-patients-and-unsafe-instructions

[2] Iain Thomson, "AI doctor's assistant swayed to change scrips, researchers find," The Register, March 4, 2026, https://www.theregister.com/2026/03/04/ai_doctor_easily_swayed/

[3] ECRI, "Top 10 Health Technology Hazards for 2026," ECRI, January 21, 2026, https://www.ecri.org/

[4] Bloomberg, "Anthropic in Talks to Raise $30 Billion at $900 Billion Valuation," Bloomberg, May 12, 2026, https://www.bloomberg.com/news/articles/2026-05-12/anthropic-in-talks-to-raise-30-billion-at-900-billion-valuation

[5] Akash Sriram, "Medical AI startup OpenEvidence doubles valuation to $12 billion in latest round," Reuters, January 21, 2026, https://finance.yahoo.com/news/medical-ai-startup-openevidence-doubles-135448981.html

[6] ARK Invest, "In the Know" (Cathie Wood remarks comparing Claude to the personal computer era), ARK Invest, March 2026.

[7] Jordan Novet, "Anthropic's Claude hits No. 1 on Apple's top free apps list after Pentagon rejection," CNBC, February 28, 2026, https://www.cnbc.com/2026/02/28/anthropics-claude-apple-apps.html

[8] Ask Sage, "Ask Sage and the Defense Health Agency Launch Enterprise-Wide Generative AI Offering to Accelerate Military Health Innovation," Ask Sage, December 8, 2025, https://www.asksage.ai/press-release/ask-sage-and-the-defense-health-agency-launch-enterprise-wide-generative-ai-offering-to-accelerate-military-health-innovation/

[9] Defense Health Agency, "'AI Scribe' Technology for Medical Professionals Reduces Notetaking, Provides More Face Time with Patients at Walter Reed," DHA / DVIDS, April 23, 2026, https://www.dvidshub.net/news/563161/

[10] Orrick, "FDA Eases Oversight for AI-Enabled Clinical Decision Support Software and Wearables," Orrick, January 2026, https://www.orrick.com/en/insights/2026/01/fda-eases-oversight-for-ai-enabled-clinical-decision-support-software-and-wearables

[11] U.S. Army, "Army and defense sector announce 'Right to Integrate' hackathon sprint for shared technology," Army.mil, May 5, 2026, https://www.army.mil/article/292189/

[12] Anthropic, "Project Glasswing: An Initial Update," Anthropic, May 22, 2026, https://www.anthropic.com/research/glasswing-initial-update

[13] U.S. Government Accountability Office, "Payment Integrity: Agencies' Estimated Improper Payments Increased to $186 Billion in Fiscal Year 2025," GAO-26-108694, April 2026, https://www.gao.gov/products/gao-26-108694

[14] U.S. Department of Defense, Office of Inspector General, "Audit of the Defense Health Agency's Monitoring of TRICARE Payments," DODIG-2025-089, May 1, 2025, https://www.dodig.mil/reports.html/Article/4173808/

[15] U.S. Department of Defense, Office of Inspector General, "Audit of the Defense Health Agency's Reporting of Improper Payment Estimates for the Military Health Benefits Program," DODIG-2022-052, January 13, 2022, https://media.defense.gov/2022/Jan/13/2002921501/-1/-1/1/DODIG-2022-052.PDF

[16] Daniel A. Alber et al., "Medical large language models are vulnerable to data-poisoning attacks," Nature Medicine, January 2025, https://www.nature.com/articles/s41591-024-03445-1

[17] U.S. Department of Defense, Chief Digital and Artificial Intelligence Office, crowdsourced AI red-teaming (CAIRT) pilot in military medicine, announced January 2, 2025; coverage: Nextgov/FCW, "DOD announces completion of pilot to identify medical AI vulnerabilities," January 2, 2025, https://www.nextgov.com/artificial-intelligence/2025/01/dod-announces-completion-pilot-identify-medical-ai-vulnerabilities/401922/
