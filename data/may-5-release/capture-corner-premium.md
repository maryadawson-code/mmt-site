# Capture Corner: GSAR 552.239-7001 Exposure Map and the Refresh 32 Acceptance Playbook

*MMT Premium Exclusive: Procedural exposure assessment, vendor waiver chase, FCA documentation playbook, and live signal watchlist for the AI procurement clause and the Anthropic-Pentagon dispute.*

---

The public issue covered the analytical frame: how the language Anthropic refused on the defense side became the civilian procurement default. This Capture Corner covers what BD, capture, and contracts shops need to do about it before Refresh 32 lands.

The window is narrow. The clause publishes again into Refresh 32 on a timeline GSA has not yet announced but that Morgan Lewis expects within the FY2026 third quarter. From publication, MAS contractors have sixty days to accept the modification or be removed. There is no grandfather clause. There is no opt-out. The decisions you make now determine whether your firm spends those sixty days documenting compliance or scrambling to find a foundation model provider that will sign a contract-grade waiver.

Here is the playbook.

---

## Procedural Posture: The Dual-Track Reality

GSAR 552.239-7001 has two tracks running in parallel right now, and each affects contractor exposure differently.

**Track 1: Civilian agency Schedule contracts.** GSA reversed Anthropic's removal from civilian schedules on April 3, 2026, three days after Judge Lin's preliminary injunction took effect in N.D. Cal. The Unbiased AI Principles, the anti-refusal language, and the "any lawful Government purpose" license remain in the proposed clause. The clause is not in effect yet. It enters force when Refresh 32 publishes.

**Track 2: Defense agency contracts.** The Pentagon's FASCSA designation against Anthropic remains operative because the D.C. Circuit denied Anthropic's stay motion on April 8. Defense contractors cannot route work through Claude until either the merits ruling reverses the designation or DoD modifies its position. The May 1 pact's eight-company list is the operational substitute. Oral argument on the merits is May 19.

The two tracks will likely converge within ninety days. If the D.C. Circuit's panel rules with Anthropic on First Amendment grounds in the May 19 argument, the FASCSA designation falls and Claude returns to the defense contracting environment. If the panel rules with the Pentagon, the supply-chain-risk designation calcifies into precedent and any future model provider that resists "any lawful use" terms faces the same posture.

GSA's clause sits downstream of both outcomes. Whichever way the D.C. Circuit rules, the civilian clause will publish into Refresh 32 in structurally identical form. Plan accordingly.

---

## Five-Point Exposure Assessment

Run this audit against every active MAS contract, every IDIQ task order vehicle, and every pipeline opportunity touching a covered civilian agency. Each point is binary: PASS or FAIL.

### 1. AI Component Inventory

**Question:** Have you identified every AI component in your delivery stack for every active and pipeline opportunity?

**Pass criteria:**
- Complete inventory of standalone AI tools (LLM APIs, ML platforms, recognition services)
- Embedded AI inventory across productivity tools (Microsoft Copilot, Google Workspace AI, Notion AI, Grammarly, Otter, GitHub Copilot, Salesforce Einstein, Adobe Firefly, Zoom transcription)
- Subcontractor AI components disclosed and tracked
- Foundation model providers identified by name behind any wrappers or resellers

**Fail criteria:**
- AI inventory limited to procured AI tools
- "We don't use AI" statement without architectural validation
- Reliance on subcontractor disclosure without verification
- Embedded AI in commercial software treated as out of scope

**Action for FAIL:** Stand up an AI component inventory project this week. Use the GSA published draft as the disclosure target. Document every component, every provider, every model behind a wrapper. The clause does not exempt embedded AI.

### 2. Vendor Waiver Status

**Question:** Do you have written confirmation from each AI provider that they have accepted the GSAR 552.239-7001 license terms for federal use?

**Pass criteria:**
- Signed waiver letters from each foundation model provider confirming "any lawful Government purpose" license acceptance
- Anti-refusal restriction acknowledged in writing
- Eyes-off data handling certified
- 72-hour incident reporting workflow documented at the provider level

**Fail criteria:**
- Reliance on commercial Terms of Service without federal-specific addendum
- "We assume the provider will comply" without written confirmation
- Foundation model provider has a public usage policy that prohibits any category of work the federal customer might request
- Click-through commercial license treated as sufficient

**Action for FAIL:** Open the vendor waiver chase this month. The eight providers in the May 1 Pentagon pact have signed defense-side waivers; civilian extension is a separate negotiation their contracts shops are running now. Other providers will need contract-grade waivers or you replace them.

### 3. Refusal Behavior Documentation

**Question:** Can you demonstrate, in writing, that the AI components in your stack do not refuse lawful Government tasks based on vendor discretionary policies?

**Pass criteria:**
- Documented testing of refusal behavior across operational use cases
- Written confirmation from provider that no usage policy will trigger task refusal
- Logged history of refusals across the operational record
- Engineering team has flagged in writing where the truthfulness requirement and the anti-refusal requirement may conflict

**Fail criteria:**
- "We have not tested for refusals"
- Reliance on vendor marketing language about model behavior
- Operational use cases not yet mapped to vendor usage policy categories
- No internal documentation of the truthfulness/non-refusal contradiction

**Action for FAIL:** Engineering and contracts need a joint working session this quarter. Map operational use cases to provider usage policies. Document the gap. The FCA exposure runs through the gap.

### 4. FCA Documentation Posture

**Question:** Have you updated your invoice certification workflows to reflect M-26-04's "material to eligibility and payment" language?

**Pass criteria:**
- Designated AI compliance officer or formal designee
- 72-hour incident reporting workflow that hits the CISA portal clock
- Internal audit trail demonstrating compliance with each clause subsection
- CFO and General Counsel briefed on Escobar implied-certification exposure
- Vendor waiver letters preserved in contract files for audit

**Fail criteria:**
- Standard invoice certifications without AI-specific language review
- No designated AI compliance role
- Incident response plan not tested against the 72-hour clock
- Contracts shop unaware of M-26-04 materiality language

**Action for FAIL:** This is a CFO-level conversation. Treble damages on every non-compliant invoice. Brief leadership before the next billing cycle. Update certification language to flag AI components.

### 5. Small Business Exemption Posture

**Question:** If you are a small business, do you have a documented argument for why the clause's compliance load is structurally disproportionate to your size?

**Pass criteria:**
- Position paper documenting the small business compliance burden
- Engagement with AFCEA, PSC, NDIA, or another trade association lobbying for exemption
- Pricing model that absorbs compliance overhead without margin destruction
- Plan B if no exemption is granted

**Fail criteria:**
- No engagement with trade association advocacy
- Pricing model assumes status quo compliance load
- No documented analysis of the structural compliance disproportion
- "We will figure it out when it lands"

**Action for FAIL:** The trade association window closes when Refresh 32 publishes. If you are not on a sign-on letter or an industry comment by June, you have no standing in the conversation. Make the calls this month.

---

## The Vendor Waiver Chase

This is the single most urgent move in the playbook. Run it like a procurement.

**Step 1: Inventory model providers.** From your component inventory, list every foundation model provider in your stack by name. Include resellers, but identify the underlying model in every case. Anthropic Claude through AWS Bedrock is still Anthropic. OpenAI through Azure OpenAI Service is still OpenAI. The clause looks through the reseller.

**Step 2: Categorize providers by waiver readiness.**
- **Tier 1 (presumptively ready):** SpaceX, OpenAI, Google, NVIDIA, Reflection, Microsoft, Amazon Web Services, Oracle. The eight signed defense-side waivers. Civilian-side extension is in negotiation. Request the federal addendum directly.
- **Tier 2 (status uncertain):** Anthropic. Civilian use is restored. The "any lawful Government purpose" language is still the issue Anthropic walked away from on the defense side. Ask Anthropic in writing whether the company will accept GSAR 552.239-7001(d)(2) license terms for civilian use. The answer determines whether Claude is viable in your federal civilian stack post-Refresh 32.
- **Tier 3 (smaller and open-source providers):** Meta, Mistral, Cohere, others. None have signed any pact. Each will need a contract-grade waiver. Some may not provide one.
- **Tier 4 (foreign-headquartered providers):** Models trained or operated by entities outside the U.S. Subsection (e) requires "American AI" to the maximum extent practicable. The undefined "American" standard creates protest exposure even with a signed waiver.

**Step 3: Send the waiver letter.** A short paragraph sufficient to memorialize the provider's position. The waiver request should reference the proposed clause text by subsection, request written confirmation of acceptance, and ask for a date by which the provider will publish federal-specific contract terms. Most provider contracts shops will respond within thirty days. Some will not respond until they know what their competitors are doing. Track the no-responses.

**Step 4: Build the substitution map.** For every provider that will not waive, identify a replacement that will. The substitution map becomes a delivery risk register. Some providers in your current stack may not be replaceable without architectural work. Flag those for engineering planning now, not after the clause publishes.

---

## FCA Documentation Playbook

The Escobar standard is enforceable now, today, against any contract that already incorporates AI components and any agency that already signals materiality through procurement language. M-26-04 broadens the exposure but does not create it. Even before Refresh 32 publishes, an agency that has built materiality into a task order can enforce against an existing contractor.

The defensive documentation posture has four layers.

**Layer 1: AI compliance officer designation.** Formal role assignment, written charter, reporting line to the General Counsel. The 72-hour CISA reporting clock cannot be met by a part-time effort or by a help desk ticket queue. Name the person. Document the role. The first day Refresh 32 publishes is too late to start this.

**Layer 2: Incident response workflow.** From discovery to CISA portal submission to Contracting Officer notification, all within 72 hours, with daily status updates until resolution. Test the workflow before you need it. Document the test. Run a tabletop exercise this quarter against a hypothetical hallucination, an unauthorized data use, or a refusal incident. Save the after-action.

**Layer 3: Vendor waiver file.** Every waiver letter, every dated correspondence, every confirmation of acceptance preserved in the contract file. If a provider's federal terms change after the waiver letter, the waiver file is your evidence of good-faith reliance. Without it, the implied-certification defense weakens.

**Layer 4: Truthfulness/refusal contradiction documentation.** Engineering writes a memo to file documenting the operational tension between (i)(1)(i)(A) truthfulness and (d)(2)(ii) anti-refusal. The memo identifies use cases where forcing a non-refusal could produce an unreliable answer, names the mitigation in place, and timestamps the analysis. This memo is the affirmative defense to a future FCA action. If the relator's bar argues your invoice falsely certified compliance, the memo demonstrates that the contradiction was identified, mitigated, and disclosed in the proposal.

The combination of these four layers does not eliminate FCA exposure. It does materially raise the bar for a successful qui tam complaint and gives the General Counsel something to work with in a pre-litigation negotiation.

---

## What to Watch: 90-Day Live Signal List

The capture decisions over the next ninety days turn on five external signals. Track each one daily.

### Signal 1: D.C. Circuit Oral Argument, May 19, 2026

**MMT Projection: High Confidence**

Three-judge panel oral argument on the merits of Anthropic's FASCSA challenge. Outcome is highly consequential for civilian-side Anthropic posture. A First Amendment ruling for Anthropic would likely trigger Pentagon reversal of the supply-chain-risk designation within thirty days. A ruling for the Pentagon hardens the precedent for any future model provider that declines "any lawful use" terms.

**Watch for:** Panel composition, line of questioning on the First Amendment retaliation finding, any signal about the equitable balance against active military operations. Decision likely within 60 to 90 days of argument.

**Action:** If your civilian-side stack includes Anthropic, hold position until the panel rules. If your defense-side stack depends on Anthropic, build the substitution architecture now. Do not wait for the ruling to start the engineering work.

### Signal 2: GSA Refresh 32 Publication

**MMT Projection: Medium Confidence**

GSA has not announced a Refresh 32 publication date. Morgan Lewis expects publication within FY2026 Q3 (April through June). The agency may delay further if industry comments document significant operational concerns from the April 3 close.

**Watch for:** Refresh 32 publication notice on GSA Interact and on the MAS contract holder communications channel. The clause text in Refresh 32 may or may not match the March 6 proposed text. Compare every subsection.

**Action:** The day Refresh 32 publishes, the 60-day acceptance clock starts. Have your AI compliance posture ready by then or you are managing the clock from a deficit.

### Signal 3: Pentagon Anthropic Talks

**MMT Projection: Low to Medium Confidence**

Trump told CNBC on April 17 that a deal with Anthropic "is possible" after a meeting between Anthropic CEO Dario Amodei and White House Chief of Staff Susie Wiles. Whether that translates into a renegotiated Pentagon position is open. Hegseth has not publicly modified his February 27 statement.

**Watch for:** Any Defense One, DefenseScoop, or Breaking Defense reporting on a renegotiated agreement, modified usage policy, or formal carveout structure that satisfies the Pentagon. A deal would likely include modified terms that draw a narrower line than "any lawful use" while preserving operational flexibility for the warfighter.

**Action:** A Pentagon-Anthropic deal would establish the template for limited carveouts that survive the "any lawful use" language. That template then becomes the model for civilian-side waivers from other providers. Track closely.

### Signal 4: Trade Association Industry Comments

**MMT Projection: High Confidence**

AFCEA, PSC, NDIA, ITI, Chamber, and others have submitted formal comments. A consolidated industry comment letter requesting small business exemption, procedural defect remediation, and clarification of the truthfulness/refusal contradiction is likely if not already in motion. Expect formal sign-on opportunities through May.

**Watch for:** Trade association communications inviting member sign-on. Comment letters published on association websites. Any reference to Section 1707 procedural defect arguments.

**Action:** Sign on. Without standing in the comment record, your firm has no procedural foothold for a later challenge.

### Signal 5: First Pre-Award Protest

**MMT Projection: Medium Confidence**

The procedural defect under 41 U.S.C. § 1707 is grounds for a pre-award protest. A well-funded MAS contractor or trade association coalition could file at GAO challenging Refresh 32 on procedural grounds within the ten-day window after publication. The protest would not necessarily succeed on the merits but would delay implementation and force GSA to address the procedural defect.

**Watch for:** GAO bid protest filings within ten days of Refresh 32 publication. Federal court complaints challenging GSA's authority. Any coordinated protest action by trade associations.

**Action:** A successful protest could push the clause's effective date out by months. Plan for the procedural challenge as a possibility. If you are positioning to lead such a challenge, contracts and legal need to be working it now.

---

## Capture Implications by Solicitation Category

The clause's impact varies by procurement type. Map your pipeline accordingly.

### Highest Exposure

**MAS Schedule task orders incorporating IT services.** Once Refresh 32 lands, every Schedule task order on a covered IT category may incorporate the clause. Your existing MAS positions are the priority audit target.

**FedRAMP-authorized AI services.** The 72-hour incident reporting clock and the eyes-off data handling requirements layer on top of FedRAMP control families. The combination drives compliance overhead that small FedRAMP-authorized providers may not absorb.

**Civilian agency IDIQ task orders touching AI.** Every covered civilian IDIQ vehicle may flow the clause down. Position now to demonstrate compliance posture in source selection.

### Medium Exposure

**Defense contracts incorporating commercial AI.** DoD has its own AI procurement architecture, but defense contracts increasingly route through GSA Schedules or civilian agency vehicles. Cross-agency exposure is rising.

**State and local contracts using federal pass-through funding.** The clause does not formally extend, but federal grant terms increasingly mirror federal procurement language. Track grant solicitations from agencies that flow federal AI requirements.

### Lower Exposure (Today)

**Pre-existing contracts that do not incorporate the clause.** Existing task orders without AI-specific terms may continue under prior compliance posture, but option year exercises and contract modifications will trigger clause incorporation.

**Subcontractor positions on prime contracts where the prime carries the clause obligation.** Compliance load shifts upward, but disclosure obligations to the prime survive at the sub level.

---

## Bottom Line Assessment

The clause is the policy machinery that makes EO 14179, EO 14319, M-25-21, M-25-22, and M-26-04 enforceable at the invoice level. The May 1 Pentagon pact is the parallel architecture on the defense side. Both documents export the same two principles into binding contract terms. Eyes off Government data. Unrestricted lawful Government use of outputs.

The deferral to Refresh 32 bought administrative runway, not substantive relief. GSA controls the publication timeline. Sixty days is the acceptance window. Compliance posture takes longer than sixty days to build from cold start.

**Winners:** Contractors with documented AI inventories, signed vendor waivers, formal AI compliance roles, and FCA documentation already in motion. Contractors with deep relationships at the eight Pentagon-pact providers. Contractors with trade association standing in the comment record.

**Losers:** Contractors who treat the deferral as relief. Contractors using foundation models with public usage policies that prohibit categories of federal work. Small businesses with no negotiating power against their model providers. Contractors who learn about M-26-04's materiality language after their first FCA referral.

**Strategic imperative:** Refresh 32 publishes when it publishes. Build the compliance posture against the proposed text now. The version that lands will not be materially different. Contractors who treat the deferral as a planning opportunity will be the ones still on Schedule in Q4.

The fight that began with one company on the defense side ends with every contractor on the civilian side. The clock is running.

Let's roll.

— Mary

Mission Meets Tech

---

*MMT Premium: Essential intelligence for federal health IT and defense contracting decision-makers.*

**Questions about your specific situation?** Premium subscribers get one direct Q&A session per month with strategic guidance tailored to your pipeline and positioning.

**Submit your question:** [premium@missionmeetstech.com](mailto:premium@missionmeetstech.com)
