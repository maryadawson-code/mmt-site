---
title: "Industry Leader, Out of Scope"
date: 2026-06-02
slug: industry-leader-out-of-scope
description: "On May 29, 2026, VA posted RFI 36C10B26Q0485, market research for an enterprise AI buy meant to move a 540,000-person workforce from assistive tools to autonomous agents acting on veteran health data. The same document sends governance out of scope. Here is how VA earns the leadership it claims: sequence the agents by risk, put governance on the quarterly clock the price already runs on, and buy all four parts, the capability and the three preconditions that make it safe."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "VA"
  - "Enterprise AI"
  - "Agentic AI"
  - "AI Governance"
  - "RFI 36C10B26Q0485"
  - "Veteran Health"
  - "Clinical AI"
  - "Autonomous Agents"
  - "NIST Agentic Overlay"
  - "Chief AI Officer"
  - "M-25-22"
  - "M-25-21"
  - "VA Directive 6500"
  - "Federal Health IT"
  - "Frontier AI Labs"
agencies:
  - VA
canonical_url: "https://missionmeetstech.com/newsletter/industry-leader-out-of-scope/"
source: claude_newsletter_project
capture_corner_teaser: "This issue lays out the path. Premium subscribers get the companion Capture Corner on RFI 36C10B26Q0485: the procurement-at-a-glance read, the seven-part frontier-lab self-score, the single-vendor-UI versus multi-lab-API seam, the enablement lane where the governance gap becomes the opening, the SDVOSB teaming move on a no-set-aside buy, and the response checklist before the June 9 deadline."
capture_corner:
  - "Procurement at a glance — RFI 36C10B26Q0485 / VA-26-00070193, responses due June 9, 2026, 1:00 PM ET. NAICS 541512, no set-aside, no incumbent, 20-page limit, direct-to-OEM, usage-based pricing only."
  - "Two surfaces, one seam. The UI tool layer is a single-vendor award from one frontier lab; the API layer stays multi-lab. If you cannot be the front-door lab, your play lives in the API path, the cloud-provider path, or enablement."
  - "The seven-part frontier-lab self-score that decides whether you respond as a prime-model provider or an enablement and integration play, plus the high, specific reseller-value bar for systems integrators."
  - "The enablement lane, where the governance VA carved out becomes the opening: tiered-autonomy controls, human-in-the-loop designed by the builder, runtime allow/deny/modify gating, scoped agent identity, and a path to the NIST agentic overlay."
  - "The SDVOSB move on a no-set-aside buy, the competitive-intel read on VA's own published pilot engagement data, and the week-by-week response checklist before June 9."
---

# Industry Leader, Out of Scope

*VA's enterprise AI market research says the department intends to be an industry leader, with strong governance and trust. The same document sends governance, an AI-ready workforce, and data infrastructure out of scope of the buy. It keeps the capability to field autonomous agents on veteran health data.*

![The Clean Signature. A clinician's pen signs an AI-drafted clinical document inside a sharp navy bracket, and a thin red fracture runs out from beneath the signature line across the page. A pill tray and a stack of charts sit nearby. The cover image for the issue: the draft reads clean, the signature goes down, and the missing contraindication travels with it.](/images/newsletter/2026-06-02/cover-clean-signature.png)

Friends,

A veteran begins her first round of chemotherapy. The instructions she will follow at home, the warning signs, the dosing, the interactions to avoid, come from a draft an AI agent wrote after reading her chart, and somewhere in that draft a contraindication is missing. The clinician is carrying a full panel that afternoon. The draft reads clean. The signature goes down.

That is the kind of work VA is now buying. RFI 36C10B26Q0485, posted May 29, is market research for an enterprise AI buy meant to move a workforce of roughly 540,000 from assistive tools to autonomous agents acting on veteran health data. The agent drafting a first chemotherapy cycle's take-home instructions is VA's own example, written into the document. And the same document removes the safety system from the purchase. Governance, the RFI says, is "out of scope for this acquisition."

VA has reached for this once already. A sources-sought went out in February asking industry what autonomous agents could do for the department, and VA withdrew it in April after the market answered, with a line about future efforts remaining possible. Six weeks later it is reaching again, larger. The question worth a federal leader's time is whether VA builds the second reach differently than the first.

VA's RFI opens by saying the department intends to be an industry leader in adopting AI, with strong governance and trust. Then it lists five priorities and sends the fifth, governance, out of scope of the buy, to be run by other programs on another schedule. Both cannot be true at once. A leader's governance moves at the speed of its capability. A follower's lags behind and calls the lag caution.

I have built this kind of architecture on a federal program, before the RFIs caught up to it. The model was the easy part. The authorization was the hard part, written for a system that never changes, wrapped around one that changed every week. That gap is the whole problem. It is also the whole opportunity. The way VA earns the leadership it has claimed is to close the gap on purpose, and to let risk decide the order the agents go live.

## Lead where you have already won

Start the agents where VA already has proof. That ground is software development. VA's own figures show roughly 2,000 developers using AI-assisted coding and saving eight hours a week, most reporting the time went to better work. That work runs on code, not protected health information, and its mistakes surface in testing and review rather than in a chart. An agent told to build and test a pipeline and open a pull request for a human to approve is the safest place in the enterprise to learn how agents behave when they act on their own.

The demand is already there, unprompted. VA's pilot data shows one tool logging more than fifty billion input tokens in a single month against another's six, at identical provisioning and with neither group told to use it. The workforce is reaching for these tools on its own. The job is to point that pull at the lowest-risk work first.

Clinical AI already works at VA, in the form that keeps a human in the loop. An AI-assisted decision-support tool was associated with a 22 percent drop in mortality. An AI-powered colonoscopy tool raised adenoma detection by 21 percent. VA's own chat assistant has roughly 95,000 sign-ups, with a subset of users reporting two to three hours saved a week. AI as decision support, with a clinician deciding, already works at VA. Autonomy is the unsolved part.

So sequence by readiness. The developer agent leads. The housing-services agent, which carries a built-in human checkpoint and stops short of a clinical emergency, follows. The oncology agent that drafts chemotherapy instructions comes last. The capability is reachable. The consequence of a quiet error is highest there, and the supervision least mature.

![Sequence by Consequence. Start where errors are catchable, then earn autonomy. Three panels in rising patient risk: the developer agent, lowest risk, where errors surface in automated tests, code review, and pull-request approval; the housing-services agent, moderate risk, where a human checkpoint catches and corrects before impact; and the oncology instructions agent, highest risk, where a quiet error like a missing contraindication can pass through a tired signature. An arrow underneath reads: autonomy increases only after controls mature.](/images/newsletter/2026-06-02/sequence-by-consequence.png)

VA has lived the proof of why order matters. Its Smart Ratings AI, built to propose disability ratings for human review, sits paused with no release date after a review found the underlying decision support missed evidence and surfaced false matches. The administrative end, meanwhile, is paying off now. A Yale study saw clinician burnout fall from 51.9 to 38.8 percent within a month of an ambient scribe going live, and VA has already bought the technology for the new health record. Lead with the agents that draft and summarize for a human to approve. Hold the autonomous clinical decision.

## Put the two clocks into one

The mechanical fix is smaller than the problem sounds. M-25-22, the memo that governs federal AI acquisition, already lets agencies monitor a system's performance quarterly. VA can take the pricing cycle the RFI already builds in, a re-price and a possible model swap at least every quarter, and make each one a mandatory governance checkpoint. Every time the model or the price changes, the risk and impact review runs again. Each checkpoint is a real review: the impact assessment re-run, the new model version re-tested on VA data, the data-handling and refusal-behavior changes logged before the agent keeps acting. The capability clock and the governance clock become one clock, by design.

![The Two Clocks Problem and the fix. On the left, a fast capability clock of quarterly model and price changes runs against a slow governance clock of annual or one-time safety documentation, and the gap between them opens an unsafe interval where the model changes before safety is re-reviewed, with the patient sitting in that gap. On the right, the fix folds both into one shared quarterly checkpoint: every model change triggers the same review, testing on VA data, an impact review, a data-handling review, and refusal-behavior and escalation logging.](/images/newsletter/2026-06-02/two-clocks-problem.png)

The arithmetic is what makes it urgent. The governance program runs on annual and one-time marks. The federal deadline to document minimum safety practices for high-impact AI, the category healthcare falls into by default, landed on or about April 3 this year, and the rule is blunt: a high-impact use that cannot meet the practices has to be discontinued. The inventory updates once a year. The acquisition runs on quarters. A model that re-benchmarks in the spring can arrive by summer with a wider context window or a different refusal behavior, each of which changes what the agent will attempt on a record, and the calendar schedules no review to catch it.

A leader closes that gap with an owner. Federal policy makes the Chief AI Officer the one who decides what counts as high-impact, signs the waivers, and tracks the risk. VA's CAIO announced his departure in March. An agent program acting on veteran PHI cannot run with that seat empty or acting. The official who owns the risk has to exist before the risk does. Fill the seat before the first agent goes live.

## Build the pathway the inventory does not have

The authorization was built for systems that do not act. VA Directive 6500 clears static systems against fixed controls, encryption, access, logging. It does not ask how far an autonomous agent's actions can range, what data it can reach, or which steps must stop for a human. VA's own automation platform shows the mismatch in miniature: its privacy assessment describes the system as transmitting information rather than analyzing it, language built for a passive pipe, and exactly what a reasoning agent breaks.

The control pattern that answers those questions already exists, outside this buy. The field has converged on sorting agent actions by stakes. Low-stakes work an agent does on its own, read-only retrieval and drafting. Moderate-stakes work routes through a second check. High-stakes work, anything irreversible, financially significant, or touching PHI, requires a human approval the system's builders define and the agent cannot override. Around those tiers sit a scoped identity that keeps a housing agent from ever touching a pharmacy record, a runtime gate that stops a wrong action in the half-second before it executes, and observability that keeps PHI out of the logs.

One move makes this real now. VA should turn the RFI's optional AI safety service into a requirement for any agentic surface, and commit to adopting the NIST agentic overlay the day it publishes this fall, building to the CISA and OWASP guidance that already exists in the meantime. Two guardrails travel with it. The model layer has to stay plural, because a frontier provider's federal standing can change on commercial or policy grounds, as the spring 2026 fight over one lab's access showed, and a governance program that cannot survive a provider going dark is not a program. And Congress is already legislating the floor, with FY27 proposals to bar AI from final disability determinations and to require a report on unsanctioned AI on VA networks. A leader builds to that floor before the law arrives.

## The agent is the easy part

Read the carve-out again, because it runs wider than governance. VA scoped this buy to two of its five priorities, expanding access and reimagining workflows, and sent the other three out of scope: governance, an AI-ready workforce, and data and infrastructure. The capability is in the cart. The three things that decide whether the capability is safe and whether it works are sitting outside it.

![One Buy, Four Parts. The RFI buys one part and sends three outside scope. At the center, inside the procurement-scope box, sits the AI capability block resting on a cracked concrete slab. Outside the box sit the three load-bearing parts the buy leaves out, drawn as beams and pillars the capability needs to stand on: governance, an AI-ready workforce, and data and infrastructure.](/images/newsletter/2026-06-02/one-buy-four-parts.png)

Start with the workforce, because of what the cold open actually shows. The model did its job and produced a draft. The failure was the gate: a tired clinician on a full-panel afternoon signing without catching the gap. A human-approval step is a designed control, and designed controls erode when the person is rushed or trusting. Requiring the gate and operating the gate are different things. VA has to train people to supervise agents rather than only use them, and it has to measure whether the gate is real, through override rates and audited samples that show whether a clinician is reading the draft or initialing it. The agent is the cheap part of this. The supervision capacity is the expensive part, and a buy scoped to tools and API access does not purchase it. The pattern is consistent across the private sector, where roughly four in five enterprise AI efforts fail, and they fail on people and process far more than on models.

Then the data, because the cold open hides its largest assumption in three words: the agent "reads her chart." An agent's judgment is only as good as what it is grounded in. One reasoning over VA's own protocols, the current formulary, and the veteran's actual record behaves differently from one improvising over a general model with a thin slice of context. That grounding, the clinical knowledge layer and the clean, connected data beneath it, has to be built. A commercial model bought off the shelf does not arrive with it. The RFI's direct-to-OEM posture gets VA the model and leaves the substrate, the data and infrastructure VA itself named as Priority 4, on the far side of the line the buy drew.

One rule follows for every agent VA fields. It cannot trust an agent because the agent cleared someone else's leaderboard. Only VA's own evaluation, run on real veteran charts before the agent goes live, shows whether this agent is safe on this data for this veteran. Validate on your own charts. The vendor's leaderboard is marketing. Your charts are the test.

VA's vision statement promised an industry leader with strong governance and trust. A leader buys all four parts, the capability and the three preconditions that make it safe. This RFI purchases one of the four.

## The evidence is already in

Strip the sourcing away and the same answer appears from every direction, and it appeared inside ninety days. Ontario's Auditor General reviewed twenty AI scribes in May and found twelve had logged a different drug than the one prescribed, the exact failure the chemotherapy scene describes, in production, last month. An independent benchmark in March found that not one of thirteen widely used agents completed even 40 percent of its tasks while honoring all of its safety limits. VA's own inspector general found in January that the department has no process to report, track, and respond to generative-AI safety errors. VA's own Smart Ratings project is paused. CISA published agentic security guidance in May, NIST's overlay is still months out, and Congress is drafting guardrails as this buy moves.

The operators say the same thing in plainer words. Asked to name a single clinical case he would run fully autonomously, Mayo's John Halamka could offer only a supply-chain agent that "orders Band-Aids." Matthew Versaggi, who has worked federal health AI from inside government for decades, calls healthcare "a much more conservative finance company at its core," and points to performance quality as the real barrier to turning agents loose, ahead of cost or speed. Sol Rashidi, who has scaled AI across global enterprises, builds every deployment feasibility-first, governance before scale, a human at the center of any high-stakes call. Run either operator's method across VA's three agents and the same ranking falls out: the code agent first, the oncology agent last.

Everyone converged on the same answer in the same window. The regulators, the benchmarks, Mayo's Halamka, VA's own inspector general, and VA's own paused project. The only thing that has not caught up is the structure of this one purchase.

None of this is theoretical for VA, because VA is already living both halves of the answer. The administrative agents that work are moving onto the new health record. The autonomous high-stakes one that did not work is paused. The evidence for which path leads is in-house.

Start the agents where the wins already are, put governance on the same quarterly clock the price runs on, and stand up the controls for autonomous action before VA turns an agent loose on a chart.

Picture the version that works. A veteran starts her first round of chemotherapy. An agent reads her chart, her plan, her reading level, her language, and drafts what she carries home. A clinician reads it, corrects it, signs it. Behind that signature sits a governance program that reviewed the model the last time it changed, a CAIO who owns the call, and an audit trail that catches the drift before it reaches her. The agent moved fast. The supervision moved at the same speed. VA reached for this once and pulled back. The second reach is the chance to build it right, and every piece of building it right is already within the department's hands.

Let's roll.

— Mary

Mission Meets Tech

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue lays out the path. Premium subscribers get the companion Capture Corner on RFI 36C10B26Q0485: the procurement-at-a-glance read, the seven-part frontier-lab self-score, the single-vendor-UI versus multi-lab-API seam, the enablement lane where the governance gap becomes the opening, the SDVOSB teaming move on a no-set-aside buy, and the response checklist before the June 9 deadline.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.
**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] Department of Veterans Affairs, Technology Acquisition Center, "Request for Information: VA Enterprise Artificial Intelligence," RFI 36C10B26Q0485 / VA-26-00070193, May 29, 2026 (SAM.gov). Source for scope, the five priorities and Priority 5 carve-out, the agentic personas, direct-to-OEM and no-incumbent terms, usage-based and quarterly MFC pricing, the developer-coding and VA GPT adoption figures, the 22% mortality and 21% adenoma-detection results, and the Table 1 pilot engagement data.

[2] OrangeSlices AI, "VA Pulls Back on Agentic AI Opportunity After Market Research Phase," April 2026 (re: sources-sought 36C10B26Q0115). https://orangeslices.ai/va-pulls-back-on-agentic-ai-opportunity-after-market-research-phase/

[3] VA Office of Inspector General, "Review of VHA's Use of Generative Artificial Intelligence," Preliminary Result Advisory Memorandum 26-00182-42, January 15, 2026. https://www.vaoig.gov/reports/preliminary-result-advisory-memorandum/review-vhas-use-generative-artificial-intelligence

[4] Canadian Healthcare Technology, "Ontario AG finds flaws in AI scribes," May 2026. https://www.canhealth.com/2026/05/13/ontario-ag-finds-flaws-in-ai-scribes/

[5] Tech Times, "AI Agent Safety Benchmark Finds None of 13 Agents Cleared 40% Safe Completion," May 2026. https://www.techtimes.com/articles/317231/20260526/ai-agent-safety-benchmark-finds-none-13-agents-cleared-40-safe-completion.htm

[6] The War Horse, "AI and VA disability claims: Smart Ratings paused," May 2026. https://thewarhorse.org/ai-veterans-affairs-disability-claims/

[7] KFF, "What AI Can Do and What It Can't" (John Halamka roundtable), May 2026. https://www.kff.org/other-health/what-ai-can-do-and-what-it-cant/

[8] Classiq, "Podcast with Matt Versaggi," May 2022 (healthcare as a conservative finance company); U.S. General Services Administration, "Presidential Innovation Fellows Launches First Cohort on AI" (Versaggi at CMS), June 17, 2024. https://www.classiq.io/insights/matt-versaggi

[9] Sol Rashidi, *Your AI Survival Guide* (Wiley, 2024); RAND Corporation 2024 study on enterprise AI project failure rates. https://www.solrashidi.com/

[10] Office of Management and Budget, M-25-21, "Accelerating Federal Use of AI through Innovation, Governance, and Public Trust," April 3, 2025. https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf

[11] Office of Management and Budget, M-25-22, "Driving Efficient Acquisition of Artificial Intelligence in Government," April 3, 2025. https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf

[12] Department of Veterans Affairs, "Compliance Plan for OMB Memorandum M-25-21," September 2025. https://department.va.gov/ai/department-of-veterans-affairs-compliance-plan-for-omb-memorandum-m-25-21/

[13] Nextgov/FCW, "VA's top tech and AI official announces departure," March 2026. https://www.nextgov.com/people/2026/03/vas-top-tech-and-ai-official-announces-departure/412112/

[14] VA Directive 6500, "VA Cybersecurity Program," February 24, 2021. https://www.va.gov/vapubs/viewPublication.asp?Pub_ID=1254&FType=2

[15] OmniMD, "Best Medical AI Scribes 2026" (citing JAMA Network Open clinician-burnout study). https://omnimd.com/blog/best-medical-ai-scribes/

[16] Industrial Cyber, "CISA and partners release agentic AI security guidance to protect critical infrastructure," May 2026. https://industrialcyber.co/ai/cisa-and-partners-release-agentic-ai-security-guidance-to-protect-critical-infrastructure-outline-mitigation-action/

[17] Nextgov/FCW, "NIST aims for summer release of AI cyber guidelines," May 2026. https://www.nextgov.com/artificial-intelligence/2026/05/nist-aims-summer-release-ai-cyber-guidelines/413559/

[18] Nextgov/FCW, "Lawmakers propose to establish AI guardrails for VA in FY27 funding," May 2026. https://www.nextgov.com/artificial-intelligence/2026/05/lawmakers-propose-establish-ai-guardrails-va-fy27-funding/413481/

[19] Department of Veterans Affairs, Privacy Office, Intelligent Automation & Agentic AI (IAAI) Privacy Impact Assessment, March 2026. https://department.va.gov/privacy/wp-content/uploads/sites/5/2026/03/FY26IntelligentAutomationAgenticAIIAAIPIA.pdf

[20] CNBC, coverage of the federal-access dispute involving a frontier AI lab (preliminary injunction and appellate ruling), March–April 2026. https://www.cnbc.com/2026/04/08/anthropic-pentagon-court-ruling-supply-chain-risk.html
