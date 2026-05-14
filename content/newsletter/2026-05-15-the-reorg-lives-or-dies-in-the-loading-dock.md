---
title: "The Reorg Lives or Dies in the Loading Dock"
date: 2026-05-15
slug: the-reorg-lives-or-dies-in-the-loading-dock
description: "VA's SCMDSO procurement (solicitation 36C10B26Q0376) is the operating-architecture decision underneath VHA reorganization. Most of the industry chatter reads it as a recompete. The PWS — and the public record of supply-chain failure, EHRM restart, iFAMS rollout, and the RISE timeline — say otherwise."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "VA"
  - "VHA RISE"
  - "SCMDSO"
  - "HELM"
  - "VALIP"
  - "DMLSS"
  - "iFAMS"
  - "EHRM"
  - "VA OIG"
  - "GAO High-Risk"
  - "Supply Chain"
  - "DevSecOps"
  - "Federal EHR"
agencies:
  - VA
canonical_url: "https://missionmeetstech.com/newsletter/the-reorg-lives-or-dies-in-the-loading-dock/"
source: claude_newsletter_project
capture_corner_teaser: "The full SCMDSO BD breakdown: four vehicle scenarios (T4NG2, GSA MAS, SEWP VI, stand-alone IDIQ) mapped against probability and prime posture; the realistic prime field across four tiers (Tier 1 AFS / Tier 2 Leidos, GDIT, Booz Allen, Peraton, ManTech, SAIC / Tier 3 Liberty IT, VetsEZ, Oracle Health / Tier 4 SDVOSB and WOSB primes); the 15-product gating filter that will quietly disqualify most SDVOSB primes if they answer RFI Question 2 honestly; price-to-win scenarios running from approximately $900M to $3.2B over 60 months; the five binary signals that will tell you on the day the formal RFP drops whether VA is buying capability or capacity; and the protest math for a Volume IV input."
capture_corner:
  - "Procurement-at-a-glance card: solicitation 36C10B26Q0376, VA TAC Eatontown, NAICS 541512, hybrid FFP base + T&M optional tasks + cost-reimbursable travel, 12-month base + four 12-month options, 60 months max, citing RFAR 15.101(c)."
  - "Vehicle scenario analysis: T4NG2 (moderate-to-high probability), GSA MAS 54151S (moderate), SEWP VI (lower; services-heavy requirement is wrong shape), stand-alone IDIQ (lower; time pressure argues against). Watch signal for each path documented."
  - "Tiered prime field with Tier 1 incumbent dynamics (Accenture Federal Services via the Cognosante MVH acquisition), Tier 2 large-prime depth on VA OIT, Tier 3 specialized VA health IT primes with prime ambition, Tier 4 SDVOSB and WOSB candidates capable of prime under partial set-aside."
  - "RFI Question 2 as the gating filter: 15 concurrent products with full SAFe PI artifacts is the threshold most SDVOSBs cannot honestly answer. Three mitigation paths documented; the strategically wrong move (stretching a five-product portfolio to claim fifteen) called out."
  - "Win themes that score: integration architecture as the asset, RISE operating-model alignment, field adoption and operational outcomes. Themes that look strong but underperform: generic SAFe certification depth, cloud migration without VA-specific platform context, cybersecurity narrative without RMF artifacts at scale."
  - "Past performance lanes that actually score: Oracle Health (Federal EHR) integration, CGI Momentum iFAMS integration, VistA legacy module work (IFCAP / AEMS/MERS / EQUIP). The rarest combination (Lane 1 + Lane 2 + Lane 3) is essentially the AFS profile; building that at the prime + sub level is the highest-payoff teaming exercise."
  - "Price-to-win framing: conservative $900M–$1.3B / moderate $1.4B–$2.0B / high $2.5B–$3.2B over 60 months. FFP base separated from T&M optional tasks for cost realism. Confidence is moderate on structural inputs, low on absolute dollar ranges."
  - "Protest landscape: VA TAC protest pattern, higher-risk vs lower-risk award structures, and the 100-calendar-day stay math (FAR 33.104) as a Volume IV pricing input."
  - "RFP signals to read on the day the solicitation drops: evaluation factor weights, required proposal artifacts, option-year exercise criteria, EAM CMMS treatment, set-aside posture."
  - "Action items for this week: track Jason King's TAC for industry day, build small-business teaming pitches around Oracle Health / iFAMS / VistA past performance not generic supply-chain branding, answer Question 2 honestly before the RFP drops, map teaming options before final RFP, calendar a November 2027 check-in for the structural prediction."
---

# The Reorg Lives or Dies in the Loading Dock

*Why SCMDSO is the operating-architecture decision underneath VHA reorganization, and why the requirements as drafted will not test for it.*

---

Friends,

VA just dropped a draft RFI on the contract that underwrites VHA reorganization, and most of the industry chatter I have seen reads it as a recompete.

It is called SCMDSO. Supply Chain Management DevSecOps and Integration. Read only the title and you would assume a contractor support task for a logistics product line. The scope says otherwise. SCMDSO is one of the quiet operating dependencies sitting underneath the entire VHA reorganization.

A VA OIG audit team walked into six medical facilities last year and found more than 150 expired medical items sitting on shelves. At three of those sites, 127 of 130 supply-chain deficiencies flagged in earlier reviews had never been corrected. Surgeries delayed. Some canceled outright. Because someone could not find a sterile supply or confirm an instrument was where the system said it was.

The United States military can coordinate a multi-domain strike across five time zones in milliseconds. It can route a CASEVAC bird to a grid coordinate that did not exist on a map an hour ago. It can keep a forward surgical team supplied through a contested air corridor.

At a VA medical center back home, a Veteran's cataract surgery gets pushed because nobody knew the implant order had stalled.

I have spent a decade watching military health IT solve harder problems than this one. Theater data normalization. Image brokering across DoD and VA care contexts. Hybrid cloud at the edge of clinical care. The capability exists. The question is whether VA has the operating model to use it.

That is the gap. That is the whole gap. And SCMDSO is one of the most direct tests of whether VA can close it.

---

## What the reorganization is actually trying to do

VA announced the VHA reorganization with language that lands like a confession to anyone who has spent time in federal health. Central Office will own policy, financial management, oversight, and compliance. VISNs and Operations Centers will translate that direction into standards. Local health care systems will get clearer guidance and more authority.

The real version: the previous operating model produced role ambiguity, slow decisions, and inconsistent execution across more than 170 medical centers and nearly 1,200 outpatient sites.

RISE, VA's implementation push, is already operational. In a recent VA National Broadcast Studios update, Under Secretary for Health John Bartrum described the old model: policy, standardization, and execution running in parallel across headquarters, VISNs, program offices, and 170 facilities. The result was wide variation in how a single policy got applied on the ground.

Call that the 18-to-170 problem. That phrasing is mine; the underlying description is VA's. The gap between what a policy says and what happens at the facility level shows up everywhere VA tries to operate as one system.

Bartrum gave a real example. A Veteran qualified for a program at one VA facility and was told he did not qualify at another. The policy had not changed. The Veteran had not changed. Two VISNs had implemented the same policy two different ways.

The new model separates those layers. Five consolidated VISNs. A Medical Operations Center, a Business Operations Group, and a Clinical Care Hub for community care. Initial Operating Capability started May 1. Full Operating Capability is targeted by the end of September. Programmatic shifts continue six to twelve months after that.

Bartrum has been explicit that none of this works without cross-functional alignment across contracts, grants, personnel systems, and computer systems. That last category is where supply-chain modernization lives.

---

## The pain record VA is not going to outrun

GAO warned in 2021 that VA's supply-chain modernization was at risk because of seven specific acquisition-management weaknesses. Unreliable data systems. Limited contract oversight. Leadership instability. No coherent procurement strategy. House testimony in July 2025 confirmed both VA health care risk management and VA acquisition management remain on the GAO high-risk list. Concerns continued around EHRM cost discipline, iFAMS integration, cloud procurement, and software license management. The watchdogs have not moved on. The problems have not been solved.

DMLSS is the cautionary tale. VA tried to deploy the DoD logistics system at the Lovell Federal Health Care Center. VA OIG found that the system failed to meet 40 of 90 high-priority business requirements, including 100 percent of high-priority data and information-sharing requirements. Could not interface with CDW. Could not exchange data with eCMS. Could not track recalls. Could not transmit financial-system data. VA canceled future deployments in December 2022. DMLSS is still in production sustainment at Lovell today. The next contractor in this lane has to keep DMLSS alive at a joint VA-DoD facility while building the next thing around it.

Then 2024. Another VA OIG audit found VHA medical facilities failed to comply with supply-chain policy in about 18.5 percent of required areas. Three of six visited facilities had failed to correct 127 of 130 previously identified deficiencies. Expired items. Affected surgeries. Field execution did not match policy intent.

VA's supply-chain problem is governance, data integrity, integration, and field workflow. Tooling sits downstream of all four. The reorganization is supposed to address those same problems at the management layer.

---

## What SCMDSO actually covers

SCMDSO is a single-contractor sustainment and modernization path for VA's Healthcare Environment and Logistics Management product line, or HELM. HELM is organized into five sub-product lines: Environmental and Healthcare Management, Healthcare Technology and Asset Management, Expendable Inventory Management, Prosthetics, and Technical Services. Per the draft PWS, underneath those five lines sit roughly 34 products today, with three to ten more expected during the contract.

The product list is fragmentation made manifest. The draft PWS describes twelve systems funded and maintained by VA Office of Information and Technology and twenty-two more funded by VHA, where OIT only provides cybersecurity authorization, Section 508 compliance, and a thin layer of other IT support. The new contractor inherits both. Two funding streams, two ownership models, one set of clinicians at the end of the supply chain who do not care which one paid for the system that just failed them.

The products you would recognize are in here. Maximo. DMLSS. ROES at the Denver Logistics Center. The VistA IFCAP family. The new Enterprise Asset Management and CMMS system VA is building to replace both Maximo and the legacy VistA engineering reporting platform, sized in the draft PWS for a user base of up to 400,000. That single new system, sitting inside this contract, is larger than most stand-alone modernization programs at federal civilian agencies.

Then there is VALIP. The VA Logistics Integration Platform runs on VA Platform One inside VA Enterprise Cloud, with Red Hat OpenShift, InterSystems IRIS for Health, Databricks, and a DevSecOps pipeline underneath it. That is the stack. Below the stack is the interface list, and the interface list is where the argument lives. VALIP connects to CDW, the legacy Financial Management System, iFAMS (future), Oracle Health Federal EHR (future), Maximo, VistA IFCAP, DMLSS, the electronic contract management system, and a dozen others. More than a dozen major systems in one interface map. The connective tissue between Veteran clinical care, federal financial management, the enterprise data warehouse, the new EHR, and the legacy environment VA still depends on every day.

The integration architecture is the asset. The DevSecOps capability is table stakes. Whoever wins this work does not win a product-line sustainment award. They win the ability to shape how VA's operating model functions at the seam where clinical, financial, and logistics workflows meet.

---

## Why this matters right now

SCMDSO does not exist on an island. EHRM restart deploys at 13 sites in 2026 with full deployment as early as 2031. The new EHR cannot tolerate the kind of supply-chain data fragmentation that broke DMLSS. By mid-2025, iFAMS had only reached a small fraction of its anticipated enterprise user base, even though VHA is expected to account for roughly 115,000 of about 125,000 planned users. Every dollar of supply ordered, received, and paid has to reconcile across iFAMS, the logistics platforms, and the clinical workflows that drove the order.

Read VA's own draft scope of work and the argument writes itself. The contract aligns to Zero Trust Architecture, the VA Digital Modernization Strategy, EHRM, and the iFAMS program. It calls for enterprise deployment, integration support, interface development, platform management, and modernization across asset management, inventory, and prosthetics. VA is describing operating architecture.

SCMDSO is one operating-model bet wearing the shape of a sustainment procurement.

---

## The market read industry keeps getting wrong

The incumbent path runs through Cognosante MVH, now under Accenture Federal Services after a May 2024 acquisition. Public USAspending data shows continued execution alongside descopes and deobligations, including a late-2025 modification referencing a federal transparency directive that reduced total value by approximately $19.6M.

The safer interpretation: the public transaction trail shows a program under re-baseline pressure. CPARS is not public. I am not interested in pretending I know what is in it.

VA is asking the market a question. Industry is reading it as "who can do the existing work cheaper or faster." That read is wrong. The real question: who can help VA turn a fragmented supply-chain program into the operating layer underneath an entire reorganization. While three other modernization programs hit acceleration phase. Without recreating the dependency pattern VA is trying to escape.

A different question. One that does not get answered by a DevSecOps slide.

---

## The risk-allocation question

VA is restarting Federal EHR deployment. VA is expanding iFAMS. VA is reorganizing VHA. VA is re-baselining a supply-chain modernization program that has been through one well-documented failure already. A small number of large primes have meaningful presence across more than one of these lanes.

Concentration risk is real whether or not any specific prime is performing well. No single integrator carries unlimited program management capacity. No single integrator gives a contracting officer the political cover to weather the next OIG report if the same logo is on three program covers.

VA does not have to break up every modernization lane. It does have to think about how to allocate risk across primes in a way that protects the reorganization itself. SCMDSO is one of the cleanest places to make that decision visible.

---

## The case for reading this as just a recompete

The strongest version of the counter-argument is worth taking seriously.

A reasonable reader could say: you are projecting. SCMDSO is a routine product-line sustainment recompete. Most of what you describe is true of any large federal IT contract. Integration interfaces, cybersecurity language, and Zero Trust references always matter. Every modernization RFP cites them now. You are reading reorganization-significance into something that was always going to be a single-contractor renewal with a slightly larger product portfolio.

That version of the argument has some force. The PWS does read in many places like a standard product-line sustainment scope. The optional task structure is conventional. The labor categories are not unusual. If you read the document at face value and stop there, "routine recompete" is a defensible read.

The argument falls apart on four points.

First, the EAM CMMS implementation alone is a 400,000-user enterprise rollout sitting inside what is otherwise framed as a sustainment contract. That is not routine.

Second, RISE is in active implementation while this procurement is being shaped, which is rare in federal procurement and means the operating model the contractor inherits on day one will not be the operating model the contractor was bid against.

Third, the explicit naming of Oracle Health, CGI Momentum iFAMS, and VistA together in a single RFI question is unusual. It tells you VA is asking for integration depth across three live modernization programs simultaneously.

Fourth, the public USAspending data on the prior task order shows re-baseline pressure that routine recompetes do not show.

Any one of those features could appear in a routine recompete. Four of them together do not. The procurement document carries the reorganization-significance on its face, for anyone reading the full record.

---

## What a serious RFP should test

If VA wants this contract to survive contact with RISE, the requirements need to test for things a generic DevSecOps recompete template does not. Five things.

**Integration architecture, not Agile capacity.** Test how the contractor will keep HELM and VALIP integrated with EHRM, iFAMS, VistA, CDW, the legacy financial systems, and the cloud, identity, and Zero Trust layers underneath all of it. Agile capacity is commodified. Integration architecture is not.

**RISE operating-model alignment.** The new model separates headquarters policy from middle-layer standardization from VISN and facility execution. The RFP should test how a contractor's delivery approach supports each layer. A vendor that can write a sprint plan is a different vendor from one that can help a Medical Operations Group operationalize policy across five VISNs without recreating the 18-to-170 problem.

**Field adoption and compliance.** The 2024 OIG audit anchors this. Test how an offeror will reduce variability, support self-inspection, improve corrective-action visibility, and help facilities comply without adding burden to clinicians who are already drowning.

**Transition under motion.** RISE is not waiting. EHRM is not waiting. iFAMS is not waiting. The next contractor inherits a moving operating model on day one. Require a transition plan that holds up during IOC, functional IOC, FOC, and the six to twelve months of programmatic shifts after FOC.

**Outcomes, not activity.** Data quality. Interface reliability. Inventory visibility. Defect resolution. User adoption. Facility readiness. Decommissioning progress. Operational reporting that connects facility execution to VISN performance to Central Office policy. "Tickets closed" tells you the contractor is busy. It does not tell you the operating model is working.

If the requirements do not test those five things, the winner will deliver exactly what the RFP asks for, and the operating model will fail anyway.

---

## What I would do if I were running this

Fair question after laying out the criticism. The buyer-side play looks like this.

Carve out a small business set-aside on one of the five sub-product lines. Prosthetics is the cleanest candidate. The Oracle Health pairing is natural, the legacy IFCAP coupling is light, and a community of qualified small business primes exists. Require integration architecture artifacts in proposal evaluation, not narrative summaries. Tie option-year exercise to measurable adoption metrics at twenty named pilot facilities. Put the EAM CMMS implementation on a separate award with its own performance baseline. Concentration risk is the silent killer. Acquisition strategy has to address it directly.

I would not run this as a single-prime task order without one of those carve-outs. I would not award without a documented integration architecture demonstration. I would not let the option years auto-exercise without showing adoption movement at the facility level. The strongest signal VA could send to industry is that this contract will be measured the way RISE wants to be measured. By what changes on the ground, not by what shows up in a sprint report.

---

## A prediction

A prediction you can check against the record.

If the RFP is written around generic Agile capacity rather than integration architecture, expect a GAO high-risk follow-up to land within 18 months of award, regardless of who wins. Either as a standalone supply-chain modernization report or folded into the broader VA acquisition management high-risk update. Watch for the same OIG-flagged problems showing up in the next round of facility audits. Unresolved deficiencies. Expired items on shelves. Interface failures. Recall tracking gaps.

The claim is structural, not CPARS-derived. Requirements that buy execution capacity instead of integration capability produce a predictable outcome, regardless of who wins.

I hope I am wrong. I do not think I am.

---

## What I would tell a clinician at a VA hospital

If you are a nurse at a VAMC and your supply room runs out of the IV sets you need by Wednesday, this story is the reason. The people in your supply room care. The data the system uses to predict what you need lives in a different platform than the data that orders it, which lives in a different platform than the data that tracks the recall, which lives in a different platform than the data that ties the spend back to your facility's budget. Four systems. Four owners. Four sets of incentives. No single integration layer that makes all of them tell the same story.

If you are a Veteran and your surgery got pushed because an implant was not on the shelf, that is what was happening behind the curtain. Remember the Veteran whose cataract surgery got pushed at the top of this piece. The implant existed. Someone had it. The system did not know that, because three platforms, two ownership models, and 170 facility-level interpretations of one policy could not agree on where it was. Whoever fixes that problem fixes something most modernization programs cannot.

The reorganization is supposed to fix that. Reorganization alone will not fix it. VA also has to rebuild the spine of the operating model the reorganization sits on top of.

That spine is supply chain. It is logistics. It is integration. It is data governance. It is field-level workflow that someone has walked through with the people who use it.

That is the job in front of whoever wins this. Bigger than DevSecOps. Bigger than the product line. One of the more consequential federal health IT contracting decisions of the next five years.

**You cannot reorganize what you cannot see. And VA cannot see what its supply chain cannot tell it.**

---

That's this week's Mission Meets Tech. If you are working a VA modernization opportunity in 2026, the question I would press you on is whether the requirements your team is responding to test for the five things above. If they do not, the winner will deliver to the RFP and the operating model will still fail.

Sara and I are going to dig into this one on Mission Meets Reality. If you want to weigh in before we record, leave a comment or hit reply. I read every one.

Let's roll.

Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

**Want the capture intelligence behind this analysis?**

MMT Premium subscribers received today's companion Capture Corner: the full SCMDSO BD breakdown. Four vehicle scenarios mapped against probability and prime posture. The realistic prime field across four tiers. The fifteen-product gating filter that will quietly disqualify most SDVOSB primes if they answer Question 2 honestly. Price-to-win scenarios running from approximately $900M to $3.2B over 60 months. The five binary signals that will tell you, on the day the formal RFP drops, whether VA is buying capability or capacity.

If you are working this opportunity, that is where the actual work is.

**Founding Member rate: $199/year** (locked permanently for the first 100 subscribers)
**Standard rate: $249/year or $29/month**

Plus: 48-hour early access, deep-dive solicitation analysis when major RFPs drop, direct Q&A access, and tool discounts on ProposalPulse and MarketPulse.

**[Subscribe at missionmeetstech.com/pricing](https://missionmeetstech.com/pricing)**

---

## Sources

1. VA OIG, *Audit of VHA's Supply Chain Compliance* (2024). 18.5% noncompliance finding; 127 of 130 uncorrected deficiencies across three facilities.
2. VA OIG, *Lovell DMLSS Deployment Review* (2021). 40 of 90 high-priority requirements unmet; 100% high-priority data and information-sharing requirements unmet.
3. GAO, *VA Supply Chain Modernization at Risk* (2021). Seven acquisition-management weaknesses cited.
4. GAO High-Risk List update, House testimony (July 2025). VA health care risk management and VA acquisition management remain on list.
5. VA SAM.gov posting, RFI 36C10B26Q0376. SCMDSO scope of work (draft); RFI closed May 11, 2026.
6. VA National Broadcast Studios. RISE update with Under Secretary for Health John Bartrum.
7. USAspending.gov. Cognosante MVH task order transaction history; late-2025 modification referencing federal transparency directive; approximately $19.6M deobligation.
8. VA VALIP Privacy Impact Assessment. Confirms HELM modernization scope and integration with iFAMS and Federal EHRM-related environments.
9. VA Digital Modernization Strategy. Zero Trust Architecture and EHRM/iFAMS alignment language cited in SCMDSO PWS.
