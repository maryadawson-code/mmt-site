# Capture Corner: VA Enterprise AI. The Buy Is Greenfield, Direct-to-Lab, and Usage-Only. The Governance VA Left Out Is the Opening.

*Capture Corner is the premium BD intelligence companion to Mission Meets Tech. Public-record sourced. Independent analysis. Not a recommendation, not vendor advocacy, not capture material. Built for federal health BD, capture, and proposal leaders who need analytical depth, not headlines.*

*This issue covers VA's Enterprise Artificial Intelligence market research, RFI 36C10B26Q0485 / VA-26-00070193. RFI responses are due June 9, 2026, 1:00 PM ET. This is market research under FAR 10.001, not a solicitation. No RFP date is set. Companion to the public issue, "Industry Leader, Out of Scope."*

---

The public issue laid out the path VA should follow. Capture Corner turns that path into a vehicle, a NAICS code, a deadline, and a set of decisions a capture lead can act on before the June 9 deadline.

Read the structure before you read the opportunity. VA is telling industry three things it has rarely stated this plainly: it wants to contract directly with the model makers, there is no incumbent to displace, and it will pay only for what it uses. Each of those reshapes who wins and how you have to respond.

---

## 1. Procurement at a glance

| Field | Detail |
|---|---|
| Solicitation | 36C10B26Q0485 (Amendment A0001) / VA-26-00070193 |
| Title | VA Enterprise Artificial Intelligence |
| Buying office | VA Technology Acquisition Center (TAC), Eatontown NJ 07724 |
| Contracting Officer | Joseph Jones, Joseph.Jones6@va.gov |
| Contract Specialist | Amber Quivers-Davis, Amber.Quivers-Davis@va.gov |
| NAICS | 541512 ($34M size standard) |
| PSC | DA01 |
| Set-aside | None on the RFI notice |
| Notice type | Market research (RFI) under FAR 10.001. Not an RFQ or RFP |
| Incumbent | None. VA states there is no incumbent contractor supporting this effort |
| Response due | June 9, 2026, 1:00 PM ET, email to both POCs, subject line "RFI# 36C10B26Q0485 – Enterprise AI" |
| Format limit | 20 pages max (excludes cover and appendices), MS Word, 11-pt minimum, 1-inch margins |
| Stated screen | No marketing materials. Generic capability statements will not be reviewed |
| Archive | 60 days after response date |

---

## 2. What VA is actually buying, in two surfaces

The RFI scopes two layers and excludes the rest. Knowing which lane you are in decides your entire response.

**Surface 1, user interface tool(s).** Tools from one frontier AI lab spanning assistive, collaborative, and agentic capabilities, with connectors, skills, plugins, managed-assistants, and managed-agents. This is a single-vendor award. One front door.

**Surface 2, API services.** The most direct programmatic access to models, managed-assistants, and managed-agents, plus access through cloud providers. VA states it already holds direct relationships with multiple model creators. This layer is plural.

**Explicitly out of scope:** enterprise work apps with embedded AI (email, calendar), domain-specific embedded AI (ambient scribe), LLM API already embedded in VA production systems, cloud compute and infrastructure, on-device AI, self-hosted open-source models, and custom fine-tuning or training data.

The seam to internalize: the UI is winner-take-one from a single lab, while the API and cloud-provider paths stay multi-lab. If you cannot be the front-door lab, your positioning lives in the API layer, the cloud-provider path, or enablement.

---

## 3. The self-score that decides your play

VA defines a "Frontier AI Lab" with a seven-part test. Score yourself honestly before you write a word.

1. Creates, maintains, and applies proprietary large language models
2. State-of-the-art on recognized third-party benchmarks (MMLU, HELM, BIG-bench, LMSYS Chatbot Arena)
3. Retains direct control over research, model development, deployment, and programmatic access
4. Applies models to enterprise-grade tools with documented capabilities
5. Offers commercial, machine-readable, programmatic offerings with SLAs
6. Researches and publishes on detection and prevention of malicious AI use
7. Publishes model documentation: what it does, where it fails, how it was evaluated

If you clear all seven, you respond as a prime-model provider, and the UI award is the prize. If you do not, you are an enablement or integration play, and the next two plays are yours.

---

## 4. The reseller bar is high and specific

VA tells intermediaries directly that responses from resellers and aggregators should demonstrate value not available through a direct relationship. It names three lanes:

- Proprietary integration capability
- Specialized compliance infrastructure
- Differentiated pricing not otherwise accessible to federal agencies

If you are a systems integrator, your response has to land in one of those three with evidence, against a 20-page limit and an explicit warning that generic capability statements will not be read. Pick one lane and prove it. Do not spread across all three.

---

## 5. The enablement lane, where the governance gap becomes the opening

VA carved AI governance (Priority 5) out of the capability buy. It left one governance-shaped item inside scope: an optional "AI safety" enablement service, defined as tools, documentation, and advisory support to help VA implement responsible AI governance aligned with emerging federal and industry rules.

That optional line is the wedge.

The public issue laid out the gap: agents acting on PHI, a governance program VA's own inspector general found has no formal process to report, track, and respond to safety issues, and a CAIO seat in transition. The agentic-specific guidance VA will need (CISA's May 2026 guidance, the NIST agentic overlay due late summer or fall, the OWASP agentic top-ten) exists outside this buy.

The capture-smart enablement response proposes the scaffolding VA did not buy: tiered-autonomy controls, human-in-the-loop designed by the builder rather than the agent, runtime allow/deny/modify gating, scoped agent identity, and a path that maps to the NIST overlay when it publishes. Pair that with the other three enablement categories VA named, forward-deployed engineers embedded in VA operations, AI literacy training, and adoption playbooks from comparable health or enterprise deployments, and you have a position a frontier lab alone will not prioritize. The lab sells the model. The governance and adoption scaffolding is the part the buy underspecifies, and the part VA will need most.

---

## 6. The veteran-owned move on a no-set-aside buy

There is no set-aside on this RFI. The submission requirements still ask every respondent for business size and status, including SBA VetCert proof for VOSBs and SDVOSBs, or the names of the VOSB and SDVOSB firms you are working with, plus the ability to comply with VAAR 852.219-75, the limitations-on-subcontracting certificate.

That is VA signaling it expects veteran-owned participation in the eventual award structure even on a full-and-open track. Lock SDVOSB teaming and your 852.219-75 posture now. Teaming that is already in place before the RFP reads as strategy. Teaming assembled after it reads as a scramble.

---

## 7. Competitive-intel read on the published pilot data

The point of this section is your positioning, not a vendor scoreboard. VA published its own pilot engagement numbers in Table 1, and what they reveal is that adoption is real and uneven, which means adoption will carry weight in the eventual single-vendor UI decision. Treat the numbers as a point-in-time snapshot inside an early pilot.

| Metric (trailing 30 days, per RFI Table 1) | Claude for Gov pilot | ChatGPT Enterprise pilot |
|---|---|---|
| Users provisioned | 110,000 (not notified) | 110,000 (not notified) |
| Daily active users | 3,062 | 577 |
| Active users, last 30 days | 10,871 | 2,814 |
| Input tokens | 51.9B | 5.88B |

At equal provisioning and with neither cohort notified, one pilot is out-engaging the other by roughly five times on daily active users and nearly nine times on input tokens. Per the same Table 1 notes, Gemini for Government sat at 20 users on public data only. Do not read this as a finished contest. Read it as VA telling industry that unprompted usage is a live evaluation input.

The move it dictates for you is the same regardless of which lab leads. If you are positioning a UI play, build your response around demonstrated, unprompted adoption and the switching costs of an entrenched workforce, because VA has signaled it will look there. If you are positioning anywhere else, the API layer, the cloud-provider path, or enablement, the engagement gap is the argument for staying model-plural: today's leader is not guaranteed to be next quarter's, and the buy's own structure keeps the API open to several labs for that reason. Track the next inventory and any updated usage data VA releases before a solicitation, since this snapshot will move.

---

## 8. Timeline, compressed

This is the unusual one. Most Capture Corner timelines run quarters. This one runs days, then goes dark until VA acts.

| Milestone | Window | Confidence |
|---|---|---|
| RFI responses due | June 9, 2026, 1:00 PM ET | Confirmed |
| VA market-research synthesis into acquisition strategy | Summer 2026 | Moderate |
| Solicitation release | Not set; watch SAM.gov | Speculative |

One precedent worth holding: VA issued a separate agentic AI sources-sought (36C10B26Q0115) in February 2026, then declined to proceed after market research in April, noting future efforts remained possible. VA has circled this space and pulled back once already. The direct-to-lab, usage-only structure here is more defined than that effort, which suggests intent, not certainty. Build your pipeline assumption accordingly.

---

## 9. What to do this week

1. **If you clear the seven-part frontier-lab test,** respond direct. The RFI rewards it and warns intermediaries off. Lead with agentic capability on PHI-cleared environments and your ATO and Directive 6500 posture.
2. **If you are a systems integrator,** pick one reseller-value lane (proprietary integration, specialized compliance infrastructure, or differentiated pricing) and prove it in evidence. Generic capability statements will not be reviewed.
3. **If you do AI governance, safety, or assurance,** the optional "AI safety" enablement service is your door. Propose the agentic-governance scaffolding the buy leaves out, mapped to CISA now and the NIST overlay when it lands.
4. **If you are, or can team with, an SDVOSB,** lock the teaming agreement and the VAAR 852.219-75 compliance posture before June 9. It reads as strategy now, scramble later.
5. **If you are pricing,** model usage-based only. VA rejects seat, subscription, and flat-fee. Build the quarterly MFC benchmarking, the automatic quarterly downward adjustment, and the machine-readable pricing-data obligation into your assumptions before you respond.
6. **Everyone:** set a SAM.gov watch on 36C10B26Q0485 for any amendment or Q&A before the deadline, and on VA-26-00070193 for the eventual solicitation.

---

## Editorial discipline note

Capture Corner is built to be useful, not provocative. It does not name preferred vendors. It does not recommend awards. It does not characterize incumbent performance beyond what public records support. It does not reveal nonpublic information. It does not advocate for any specific offeror's win. What it does is read the public record carefully, project realistic competitive scenarios from public data, and surface the practitioner-level decisions that BD and capture leaders actually have to make. Use it accordingly.

The pilot engagement figures in Section 7 are VA's own, published in the RFI, and are a single point-in-time snapshot inside an early pilot. They are competitive context, not a performance verdict.

---

Mary

Mission Meets Tech Premium

---

## Sources

[CC1] Department of Veterans Affairs, Technology Acquisition Center, "Request for Information: VA Enterprise Artificial Intelligence," RFI 36C10B26Q0485 / VA-26-00070193, May 29, 2026, SAM.gov. Source for procurement-at-a-glance fields, the two in-scope surfaces and out-of-scope list, the seven-part frontier-lab definition, the reseller-value lanes, the enablement-services categories, the usage-based and quarterly MFC pricing terms, the submission requirements and VAAR 852.219-75 reference, and the Table 1 pilot engagement data as of May 27, 2026.

[CC2] VA Office of Inspector General, "Review of VHA's Use of Generative Artificial Intelligence," Preliminary Result Advisory Memorandum 26-00182-42, January 15, 2026. https://www.vaoig.gov/reports/preliminary-result-advisory-memorandum/review-vhas-use-generative-artificial-intelligence

[CC3] Industrial Cyber, "CISA and partners release agentic AI security guidance to protect critical infrastructure," May 2026. https://industrialcyber.co/ai/cisa-and-partners-release-agentic-ai-security-guidance-to-protect-critical-infrastructure-outline-mitigation-action/

[CC4] Nextgov/FCW, "NIST aims for summer release of AI cyber guidelines," May 2026. https://www.nextgov.com/artificial-intelligence/2026/05/nist-aims-summer-release-ai-cyber-guidelines/413559/

[CC5] Office of Management and Budget, M-25-22, "Driving Efficient Acquisition of Artificial Intelligence in Government," April 3, 2025. https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf

[CC6] OrangeSlices AI, "VA Pulls Back on Agentic AI Opportunity After Market Research Phase," April 2026. https://orangeslices.ai/va-pulls-back-on-agentic-ai-opportunity-after-market-research-phase/

[CC7] HigherGov, Agentic AI Sources Sought 36C10B26Q0115 listing. https://www.highergov.com/contract-opportunity/7a20-agentic-ai-va-25-00075915-va-25-00104844-36c10b26q0115-r-f1bdd/
