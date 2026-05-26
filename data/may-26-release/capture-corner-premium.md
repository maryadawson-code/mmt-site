# Capture Corner: Clinical AI Assurance

*MMT Premium Exclusive. Companion to "A Researcher Talked a Clinical AI Out of Its Own Rules. DHA Is Fielding the Same Design.," published Tuesday, May 26, 2026.*

*Public-record sourced. Independent analysis. Not a recommendation, not vendor advocacy, not capture material. Built for federal health BD, capture, and proposal leaders working the clinical AI surface inside DHA, VA, CMS, and HHS.*

---

Read the issue first. This assumes it.

The issue named a problem. DHA is fielding clinical AI faster than the security work behind it has kept up. This brief is the other half. Where the money attached to that problem sits, who controls it, and how to position before the requirement is written.

Start with the gap, because the gap is the opportunity. DHA's own red-team pilot found more than 800 vulnerabilities in clinical-note AI. The ambient scribes went live anyway. Between those two facts is a contract that has not been competed yet: a continuous assurance framework, governing a deployment that is already in exam rooms. Its scope is still language. Whoever gets in front of that language helps write it.

A requirement forms one of two ways. A contractor shapes it, or an incident does. Right now it is still the first kind.

Four things make this real money rather than a think-tank concern.

The SOAP note is a new attack surface, and nobody owns the defense of it. Validate note integrity, catch session anomalies, harden against prompt injection, and you are sitting where health IT security meets payment integrity. That space has no settled incumbent. It has a first mover waiting to happen.

The FDA moved in January and left a compliance gap behind it. The updated decision-support guidance redrew the line between a regulated device and a non-device tool. Buyers do not know which side their deployed AI now sits on, especially anything that generates a code or a single recommendation. That uncertainty is a regulatory-advisory wedge, and product work follows the advisory in.

Improper-payment pressure is funded and bipartisan. 186 billion dollars government-wide in fiscal 2025. DHA cited for 14 straight years of unreliable estimates. Every agency is now under orders to bring the number down, which means every agency is a buyer for the tool that does it.

And IL-5 PHI authorization is a moat. Ask Sage holds the first one at DHA. Almost no one else has it. A credible path to IL-5, or a teaming arrangement with a firm that holds one, is the line between bidding and watching.

---

## Why Now: The Demand Signals

The timing is not a guess. Six events in eighteen months put this requirement on a clock.

CDAO, DHA, and the MHS GENESIS program office red-teamed clinical-note-summarization AI in late 2024 and found more than 800 vulnerabilities and biases. The pilot was built to produce benchmark datasets for evaluating future systems. A government office generating evaluation criteria is a procurement signal in plain sight. In December 2025, DHA signed Ask Sage as the first IL-5-authorized GenAI platform for PHI, setting the security bar every follow-on tool now gets measured against. The ambient scribe rollout began in February, limited fielding at four MTFs last winter and a phased push across MHS now underway. The FDA reissued its decision-support guidance in January, superseding the 2022 version and leaving the compliance ambiguity buyers will pay to resolve. GAO reported the 186-billion-dollar improper-payment figure in April. And CMS is scaling Medicare Advantage audits from roughly 60 plans a year toward 550, which is outside the DHA scope but buys the exact same capability.

The deployment is live. The risk is documented. The requirement is not written. That is the whole window.

---

## Who Is Buying

The opportunity concentrates in four DHA offices, with a wider federal market behind them.

The center of it is the DHA CIO, who is also the Program Executive Officer for Medical Systems. Pat Flanders holds both roles. His office is the program office behind MHS GENESIS, long known as PEO DHMS, and it governs any AI overlay on the electronic health record. Every ambient-scribe security layer, every coding-audit tool, every SOAP note integrity capability routes through here or a PEO MS task order. The December 2025 Ask Sage agreement was a CIO action. If you sell one thing into DHA, you sell it here.

The DHA Program Integrity Office is the second door. It owns payment integrity, and it owns 14 consecutive years of OIG findings on unreliable improper-payment estimates. Anomaly detection, coding audit, and claims-review tools sell into a documented, repeating failure. That is the rare federal pitch where the problem statement is already written, by the Inspector General, on the record.

CDAO and its AI Rapid Capabilities Cell are the DoD-wide front door for AI assurance. CDAO ran the CAIRT medical-LLM pilot with DHA and the GENESIS program office and built it to generate benchmark datasets. Get in front of this office before those datasets become evaluation criteria, because once they do, the criteria are the competition.

DHA J-6 rounds out the set. It sets health IT policy across the treatment facilities. It does not hold the money the way the CIO does, but it shapes the requirement before the money moves.

Past DHA, the same capability has four more buyers. VA is scaling ambient scribes from a 10-site pilot toward 130-plus medical centers and is the largest integrated health system in the country. CMS is taking Medicare Advantage audits from roughly 60 plans toward 550 and estimating tens of billions in annual overpayments. The FDA's Digital Health Center of Excellence owns the decision-support guidance that created the compliance question. HHS OIG audits the improper payments and has already flagged AI-assisted coding as a near-term target. A capability built for the DHA problem is a capability with a federal market behind it.

---

## What Buyers Will Tell You: Five Pain Points

Use these as discovery-call openers. Each one is a wedge.

1. **"We are deploying ambient AI at speed and have no adversarial-testing framework."** They need repeatable, IL-5-capable red-teaming they can run continuously, not once at pre-deployment.
2. **"Our TRICARE improper-payment estimates are still unreliable."** AI-assisted coding speeds throughput and amplifies the problem without an anomaly-detection layer. They need tools that tell an honest coding error apart from a manipulated one.
3. **"We don't know which of our AI tools are FDA-regulated devices."** They need deployed tools mapped against the non-device CDS criteria, especially anything that generates a code or a single recommendation.
4. **"We need PHI-capable AI at IL-5 and almost no vendor has it."** A credible IL-5 path commands premium positioning.
5. **"Our clinicians trust the AI note and we cannot tell if it has been altered."** Session integrity validation and anomaly flagging before the note enters the record. Nothing off-the-shelf does this today.

---

## Teaming

| Partner | Why them | The play |
|---|---|---|
| **Ask Sage** | Only IL-5 PHI GenAI at DHA; enterprise agreement in place | Sub to them on the PHI layer, or prime with them as your IL-5 path |
| **Humane Intelligence** | Ran the CDAO CAIRT medical red-team pilot | Team on assurance task orders; their CAIRT benchmark data is the reference set |
| **Mindgard** | Demonstrated the clinical-AI attack now driving the conversation | Sub for adversarial testing; their healthcare case study is the proof point |
| **Rise8 / Thoughtworks Federal** | Scaling the VA ambient scribe to 130-plus centers | Team on VA-side security overlays; a door into the VA ambient architecture |
| **Nuance / Microsoft Dragon Copilot** | Dominant commercial scribe with EHR integration paths | Large-prime partner; capture the governance overlay as a sub layer |
| **Clearwater Security** | Published healthcare prompt-injection defense work; HIPAA AI risk advisory | Team on FDA compliance advisory and AI risk assessment |

---

## Eight Questions to Put to Incumbents and AI Vendors

For capture discovery, black-hat sessions, and teaming due diligence. A vendor that cannot answer these cleanly is a risk on your bid.

1. Has the system been tested against prompt injection that targets SOAP-note persistence, where a manipulated note survives session end and re-enters later sessions as patient history?
2. If someone injects a fake regulatory bulletin into a clinical session, how does the system tell it from a real policy update?
3. What is the vulnerability disclosure timeline? Walk through Day 1 to Day 30 for a researcher's report.
4. A signed SOAP note carrying a manipulated dose reaches the coding engine. Where does the catch happen?
5. Does the vendor hold, or is it pursuing, IL-5 authorization for PHI? If not, what is the current data posture for TRICARE beneficiary data?
6. Has the system been red-teamed by CDAO or an affiliated program? What were the findings, and what was remediated?
7. How does the system meet the FDA's January 2026 transparency expectation, so a provider can review the basis for a recommendation without relying on it outright?
8. With CMS scaling its RADV audits, what audit documentation does the system generate for every code it assigns, and does that documentation hold up in a retrospective review?

---

## Contract Language to Shape

If you can influence the requirement, push for these. If you are responding, propose against them before the government asks.

- **Adversarial testing.** Prompt-injection testing on all LLM-based clinical documentation and decision-support tools, before deployment and at least quarterly, results to the government within 30 days. Scope it to system-prompt extraction, SOAP-note persistence, safety-filter bypass, and fabricated-document injection.
- **Session integrity audit trail.** Every AI-generated note carries a verifiable record of its inputs, model version, and any external content accessed during generation. Logs retained no less than seven years.
- **IL-5 PHI certification.** Any tool touching PHI maintains IL-5 and FedRAMP High equivalency, with ATOs for all components inside 90 days of award.
- **FDA CDS transparency.** Plain-language documentation of the algorithm, training data, validation method, and known limits for any decision-support function, enough for a clinician to review the basis independently.
- **Improper-payment anomaly detection.** AI coding tools flag any code, sequence, or billing pattern that deviates past a set threshold, routed to human review before the claim goes out.
- **Coordinated disclosure.** The vendor runs a responsible-disclosure program and notifies the government within 24 hours of any credible vulnerability report affecting documentation, coding, or decision support.

---

## Watch List

**SAM.gov and RFI keywords:** ambient listening, ambient scribe, clinical note summarization, AI red teaming, CAIRT, payment integrity, PIIA compliance, IL-5 PHI, clinical decision support software, autonomous medical coding, prompt injection, adversarial AI testing, MHS GENESIS integration, AI assurance, SOAP note integrity.

**Vehicles to track:** CIO-SP3, and CIO-SP4 once the protest clears, where Task Area 7 covers AI security; PEO DHMS task orders for any EHR-adjacent AI overlay; CDAO AI Rapid Capabilities Cell contracts; VA T4NG for the scribe scale-out; SEWP V for off-the-shelf AI security tools; TRICARE managed-care support recompetes for payment-integrity scope.

---

## The Read

The issue makes a patient-safety argument. The capture argument is the same fact read from the buy side. A documented vulnerability with no requirement attached is a procurement category still forming, and a category that is still forming will harden into a line item. The question is who is standing there when it does.

Get in front of PEO MS and the CDAO assurance cell before the evaluation criteria are set. Bring a red-team methodology that survives a black-hat review, an honest IL-5 answer, and disclosure language a contracting officer can lift straight into a statement of work. Shape the requirement while it is still a sentence someone can edit.

One thing to keep in front of the capture team. Every capability on this sheet ends where the issue ends. A clinician reading a note under time pressure. A coder, or no coder. A service member whose dose and whose flight clearance ride on a record being true. Sell the assurance. The readiness case is already made for you.

Let's roll.

— Mary

Mission Meets Tech
