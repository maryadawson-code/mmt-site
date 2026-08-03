---
title: "Ten Years to Build It. Ten Months to Field It."
date: 2026-08-04
slug: ten-years-to-build-it-ten-months-to-field-it
description: "On July 27, the Army approved BATDOK-J for Army-wide fielding as a download to hardware Soldiers already carry. The software had been in operational use with Air Force pararescuemen since 2019. What changed in the last ten months was the path to the Soldier, and that mechanism is the part worth copying."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "BATDOK-J"
  - "JOMIS"
  - "Nett Warrior"
  - "Army Medicine"
  - "Defense Health"
  - "Maven Smart System"
  - "OMIS-A"
  - "Point of Injury"
  - "TCCC"
  - "DD Form 1380"
  - "Military Health IT"
  - "Capture Strategy"
agencies:
  - "Army"
  - "DoW"
  - "DHA"
  - "Air Force"
  - "VA"
canonical_url: "https://missionmeetstech.com/newsletter/ten-years-to-build-it-ten-months-to-field-it/"
source: claude_newsletter_project
capture_corner_teaser: "This issue reads the fielding decision and the mechanism behind it. The companion Capture Corner works the money: where the JOMIS portfolio's FY26 prototype-to-fielding transition opens sustainment and integration lanes across all six managed applications, how the OMIS-A SAFe release train changes bid strategy versus a traditional single-award capture, the paired-sensor approval path and what it takes to get on it, which seams in the point-of-injury-to-garrison chain carry contract signal in the next twelve months, the FY28 budget lines that will tell you whether sustainment was funded or assumed, and the basis-of-issue question that governs the size of the addressable user base. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "The five prime slots and what they actually cover. BAE holds BATDOK development under an Air Force research vehicle, not the Army, so a teaming plan that treats this as a single-customer pursuit is aimed at one third of the buyer. The operational medical data backbone was mod'd sole-source (HT0038-21-F-0035) seven weeks before the fielding approval, and Maven is consolidating toward a program of record by end of FY26, which changes the integration gate for anything that writes into it."
  - "What the OMIS-A SAFe release train does to your bid model. Recurring delivery orders replace the single large capture, past performance is measured in increment-boundary cadence rather than program completion, and the staffing profile is flat and continuous. Price this portfolio as one opportunity per application and it is mis-sized in both directions: too large on any single award, too small in aggregate across increments."
  - "Six lanes ranked by how soon they are biddable, from paired-sensor qualification and RMF/ATO sustainment in the next two to four quarters to coalition extension and civilian prehospital in FY28 and beyond. Plus why the Nett Warrior basis of issue, not Army end strength, is the real market size, and the two FY28 budget lines (the RDT&E-to-O&M migration and OMIS-A's delivery line) that tell you whether sustainment was funded or assumed."
---

![A composite battlefield-medicine scene on white. Left: a female combat medic in camouflage and gloves kneels over a casualty, entering data on a rugged handheld device while a paper DD Form 1380 Tactical Combat Casualty Care card rests on the casualty's chest and a medevac helicopter crosses the desert behind them. Center: dashed lines carry vitals, an urgent evacuation priority, and a Role 2 demand signal to a headset-wearing operator watching a casualty record and map on a command display. Right: a Role 2 surgical team stands ready in a field hospital, connected by a caduceus icon. The graphic shows a casualty record moving from point of injury to the surgeon before the patient arrives.](/images/newsletter/2026-08-04/cover-ten-years-to-build-it.png)

# Ten Years to Build It. Ten Months to Field It.

*On July 27, the Army approved BATDOK-J for Army-wide fielding as a download to hardware Soldiers already carry. The software had been in operational use with Air Force pararescuemen since 2019. What changed in the last ten months was the path to the Soldier, and that mechanism is the part worth copying.*

Friends,

A medic kneels next to a casualty and reaches for a card.

It is a DD Form 1380. It goes in a cargo pocket, or it gets taped to the casualty's chest. It gets filled out in pen, under whatever light there is, by hands that just finished doing something else.

Then the casualty moves and the card moves with him, and somewhere between the point of injury and a surgeon under canvas, it gets wet, or comes loose, or arrives carrying a name and a tourniquet time and nothing else.

The Defense Health Agency revised that form in July 2025. The current version is paper.

Every reconstruction after that is memory. Every handoff is verbal. The commander deciding which bird goes where is working off a radio call and a guess.

On July 27, 2026, that stopped being the only option in the Army.

## What was approved

CPE Ground - Soldier Systems approved the Battlefield Assisted Trauma Distributed Observation Kit - Joint for fielding Army-wide, effective immediately. The date was the Army Medical Enterprise's 251st birthday. Any Soldier equipped with a Nett Warrior end-user device is authorized to download BATDOK-J and use it operationally.

LTC Brian Lee, Strategic Communications Advisor to the 46th Surgeon General, announced it the next day. His framing: warfighters at the tip of the spear and decision makers at echelon shift from paper based, post intervention tracking to real time, digital point of injury documentation, integrated with Maven Smart System and the Army's Next Generation Command and Control stack.

Read the verb in that authorization. Download.

There is no fielding convoy. There is no new hardware line item, no unit waiting its turn in a distribution schedule built around a device that has to be manufactured, shipped, inventoried, and hand-receipted. The Soldier already carries the end-user device. The software goes onto it.

That is the whole delivery model.

## Why the pipes matter more than the app

Nett Warrior is the Army's dismounted-leader Android device, paired with software-defined tactical radios running the TSM waveform on the Secure-But-Unclassified Encrypted enclave of the Integrated Tactical Network. It is the same mesh that carries fires coordination, ISR feeds, and the commander's picture.

Operational medical data has historically moved on a separate path, when it moved at all. Voice on a different net. Paper forward of Role 1. A theater medical picture assembled at echelon hours after the fact, out of reports that started as handwriting.

Putting BATDOK-J on the Nett Warrior device collapses that. The medic's documentation now rides the same network as everything else the brigade is doing, without leaving the enclave, and it lands in the same fused display the commander is already looking at. Sensor to shooter has a decade of investment behind it. This is the first Army fielding decision I can point to that treats sensor to surgeon as the same engineering problem.

Three things follow.

Evacuation decisioning gets a data layer. Right now the choice of which casualty moves first, on which platform, to which role of care, is made on voice reports of variable quality under time pressure. Vitals streaming from a paired sensor into a common picture changes the inputs to that decision.

Medical logistics gets demand signal. Blood, oxygen, and Class VIII consumption forward of Role 2 is currently a lagging estimate. Point-of-injury documentation makes it something closer to a live count.

And the record starts earlier. Everything downstream, the Role 2 handoff, the theater hospital, the garrison record, the eventual VA claim, inherits a first entry that was typed at the point of injury instead of transcribed from a card three hours later by somebody who was not there.

## Nine years of working software

The engineering was finished long before the fielding decision.

It started around 2015 and 2016 as an Air Force science and technology effort inside the 711th Human Performance Wing's Airman Systems Directorate at Wright-Patterson, answering an Air Combat Command requirement for better battlefield documentation for pararescue jumpers. Dr. Gregory Burnett ran development out of the Warfighter Interface Division. Military medics began evaluating it in 2016.

It deployed operationally with Air Force pararescuemen in 2019.

Seven years before the Army approved it for its own Soldiers, this software was in the hands of the people who jump out of aircraft to recover casualties. Real missions. In 2022, after cross-service testing, the Joint Operational Medicine Information Systems program office selected BATDOK as the Joint integrated electronic health record for point of injury and en route care. That moved it out of Air Force S&T and into a Joint program funded by the Defense Health Program. In July 2025, AFRL selected BAE Systems to continue development under FORGE-IT.

Working software. Joint program of record. Defense Health Program money. Four more years before Army-wide fielding.

## What the nine years actually were

Three structural drags account for most of it. All three will slow the next one too.

![A horizontal timeline titled 'Ten Years to Build It. Ten Months to Field It. From working software to Army-wide fielding.' Five milestones: 2015-2016 AFRL development and military medic evaluation; 2019 operational use with Air Force pararescuemen; 2022 selected by JOMIS as the Joint point-of-injury and en route record; September 2025 82nd Airborne JRTC stress test proves the data path; July 27, 2026 Army-wide fielding approved as a download to Nett Warrior devices. A bracket marks the first four points as 'ten years to build it' and the last gap as 'ten months to field it.' Below, three cards under 'What slowed it down': cross-service handoff, MC4 to OMIS-A transition, and testing serialization. A footer shows a paper DD Form 1380 turning into a digital casualty record on a rugged tablet.](/images/newsletter/2026-08-04/ten-years-to-build-it-ten-months-to-field-it-timeline.png)



**Cross-service handoff.** An Air Force S&T project that Air Force medics were using in 2019 did not become a Joint program until 2022. The gap between one service proving something and the enterprise adopting it has no owner. That gap sits between a service S&T portfolio and a Joint program office, and it carries no milestone in either one.

**The MC4 to OMIS-A transition.** The Army's Medical Communications for Combat Casualty Care program was scheduled to sunset September 30, 2023, with Operational Medicine Information Systems – Army standing up October 1. The transition slipped waiting on the FY24 Defense Appropriations Act. OMIS-A was not formally established until April 12, 2024. For roughly six months, the Army office that would own delivery of this capability was mid-transfer, and a continuing resolution was the reason.

**Testing serialization.** DOT&E published the first JOMIS MedCOP initial operational test and evaluation report in May 2025, from FY24 testing. JITC ran two operational assessments, cyber survivability testing, and a large IOT&E event covering five JOMIS applications on the modernized operational medical data services backbone. The full portfolio testing package did not clear until FY26.

None of these are scandals. Every one of them is the machine working the way the machine is built. Appropriations timing drives program transitions. Test authorities batch events because running them separately costs more. Services own their own S&T portfolios. Each decision is defensible in isolation, and the sum of them is nine years between a working capability and the Soldier who needed it.

LTC Lee said it in the announcement, and he said it about his own enterprise: this has been a ten-year journey, this is not the best representation of moving at the speed of need, far from it.

An organization that publishes that sentence on the day it takes a victory lap is an organization that can get faster.

## The ten months

In late 2025, Dr. Alex Miller, the Army's Chief Technology Officer since December 2023, made what LTC Lee described as a short notice ask: have the 82nd Airborne stress test BATDOK at the Joint Readiness Training Center.

The test ran in September 2025, during 1st Mobile Brigade Combat Team's JRTC rotation at Fort Polk. A small team led by the Army Surgeon General's Chief Technology Officer, LTC Dan Heffner, working with Brigadier General Jonathan Craig Taylor, and supported by PEO Soldier, PEO C3N, OMIS-A, AFRL's BATDOK developers, and JOMIS, moved medical data through the ITN and put it on a Maven Smart System display.

Shyam Sankar, Palantir's chief technology officer, is named in the announcement alongside the Army team. A tag on a post is thin evidence by itself. Vendor chief technology officers rarely turn up in the acknowledgments of a service fielding decision, and that is indicative of how direct the integration work was.

Roughly ninety days from the ask to the demonstration.

Now correct the story you are going to see repeated this week. Ninety days did not produce Army-wide fielding. Ninety days produced proof that the data path worked under brigade conditions at a combat training center. What happened next was ten months of units.

The 82nd Airborne. The 101st Airborne. The 4th Infantry Division. The 68th and 18th Theater Medical Commands. Testing it, using it, and sending back what broke. Then, on July 27, CPE Ground - Soldier Systems approved it for the force.

Ninety days to prove it. Ten months to harden it. Both numbers matter, and conflating them will get you laughed out of a program review.

## The mechanism worth copying

Strip the names off and look at what actually moved.

A senior technical authority with no program equity in the outcome issued a falsifiable challenge with a date on it. The deliverable was a demonstration in front of real Soldiers, under conditions that could produce a failure everyone would have to look at.

Miller has been describing this model publicly for two years. Instead of a bespoke process where people who are not in the fight write requirements and make purchasing decisions, take commercial and military technology and give it directly to units, and let acquisition professionals and requirements writers engage directly with Soldiers. Put things out fast, test them, kill what does not work, and scale what does. Continuous transformation rather than modernization focused on kit.

Three conditions made it work here, and all three are transferable.

**The software already existed.** Miller did not fund a new start. He challenged an existing capability with six years of operational use behind it to prove it could survive the Army's network. The ask was integration, not invention.

**The venue was a rotation already on the calendar.** JRTC was happening regardless. The demonstration consumed a training event, not a program of record.

**Failure was survivable.** If the data had not made it to the Maven display, the answer would have been to stop investing, and everyone involved knew it going in. That is what makes the challenge real rather than theater.

![An infographic titled 'The Mechanism Worth Copying: How BATDOK-J moved from proven software to Army-wide fielding.' A six-step numbered flow: 1 existing software already in operational use; 2 a senior technical challenge, a falsifiable ask with a date; 3 test at a scheduled rotation at JRTC with real Soldiers and a real network; 4 prove the data path from point of injury to the Maven display; 5 harden with units (82nd, 101st, 4th ID, 68th and 18th TMC); 6 field via download, no new hardware convoy required. A top strip shows a medic entering casualty data on Nett Warrior, a commander seeing it on a Maven display, and a Role 2 surgical team ready. A bottom band, 'Why it worked,' lists three reasons: the software already existed, the venue was already on the calendar, and failure was survivable.](/images/newsletter/2026-08-04/the-mechanism-worth-copying.png)



There is a structural piece too. BATDOK-J's approval lands in the middle of the Army's reorganization of acquisition into Capability Program Executives under Portfolio Acquisition Executives, announced by ASA(ALT) Hon. Brent Ingraham. CPE ES2 activated February 25, 2026. CPE Ground stood up in April 2026 under BG Troy M. Denomy, and it is CPE Ground - Soldier Systems that signed this out three months later.

A brand-new acquisition organization approved a medical software product in its first quarter of existence. Watch whether that repeats. If the CPE structure keeps producing decisions at that tempo, it is the most consequential thing happening in Army acquisition right now, and the medical portfolio got there first.

The limit of the model is worth naming with the same honesty. This runs on a senior technical authority with enough standing to issue a challenge and enough independence to accept a bad answer. The Army has one Chief Technology Officer. He cannot personally challenge four hundred programs, and a challenge that becomes routine stops being falsifiable, because every organization eventually learns to schedule the demonstration it knows will pass.

What made September 2025 real was that failure was live. Institutionalizing this means keeping that true when the thing issuing the challenge is a process instead of a person, and I have not seen an acquisition system anywhere that has solved that problem.

## What this does not prove

One demonstration and one approval do not constitute a reformed system. Four things I am watching, and you should be too.

**Nett Warrior distribution is the gate.** The authorization reads: any Soldier equipped with a Nett Warrior end-user device. Nett Warrior is a dismounted-leader device. It is not a universal issue item, and a company medic is not automatically on the distribution list. The question that determines whether this fielding decision reaches the person kneeling next to the casualty is not a software question. It is a basis-of-issue question, and it will be answered in a resourcing document, not a press release.

**Authorization is not adoption.** Available for download means available. It does not mean trained, integrated into unit TACSOPs, exercised at home station, or reflected in the way a battalion surgeon runs medical rehearsals. The Navy finalized its JOMIS training systems plan in February 2026 and has BATDOK-J on the roadmap. The Army's training pipeline for this is the thing to ask about in September.

**Cyber survivability surfaced deficiencies.** JITC's testing found the kinds of issues typical of first-fielding software. Authority to operate is not a one-time event, and a medical application riding the tactical network inherits an attack surface that a standalone app does not.

**Sustainment funding has not been demonstrated.** The JOMIS portfolio is transitioning from prototype to fielding across all six managed applications in FY26. Fielding six applications is cheaper than sustaining six applications. Watch the FY28 budget request, because that is where the enterprise tells you whether it meant it.

## Beyond the Army

BATDOK-J is a Joint application, and this was one service's decision on a portfolio that four services are consuming.

The Air Force built it and is still building it. The 445th Aeromedical Evacuation Squadron partnered with the 711th Human Performance Wing on an iOS variant, with JOMIS funding the FY25 work. Evacuation crews run on a different platform baseline than a dismounted Soldier, and en route care is a different documentation problem than point of injury. Two variants, two form factors, one record.

The Navy finalized its JOMIS Navy Training Systems Plan in February 2026, with BATDOK-J on the roadmap. A training systems plan is an unglamorous document, and it is the one that determines whether a capability gets used or gets ignored. The Navy wrote it before the Army approved fielding.

The Marine Corps received a Maven Smart System enterprise license in August 2025. JOMIS-managed applications flow through that same architecture, which puts the Marine Corps in position to consume this data without standing up a separate integration effort.

Coalition is further along than most people expect. OpMed CDP is already deployed at Balikatan in the Philippines at Role 2. Partner-nation medical documentation is a data-sharing agreement problem more than a software problem, and an application that lives on an encrypted-but-unclassified enclave is a much easier conversation with an ally than one that needs classified infrastructure on both ends.

There is a civilian instance too. In December 2025, Maryland State Police put BATDOK on medevac helicopters, the first civilian deployment of the software. Civilian prehospital care has the same documentation gap the military has, with different regulatory constraints and a far larger user base. If outcome data comes out of that deployment, state EMS systems are the next conversation, and AFRL ends up holding a technology transfer story it did not set out to write.

## The chain, and where it still breaks

BATDOK-J is one of six JOMIS-managed applications supporting five operational medicine functions: healthcare delivery, medical command and control, medical situational awareness, medical logistics, and patient movement. It is the only one that operates at the point of injury. Everything else starts at Role 1 or above: OpMed CDP, MHS GENESIS Theater, MedCOP and MedHub.

Which means the chain now has a first link that did not exist before. Point of injury, to Role 1 and Role 2 through OpMed CDP, to MHS GENESIS Theater at the forward hospital, to MHS GENESIS in garrison, to the Federal EHR the VA is standing up.

Each of those seams is a separate engineering and governance problem, and they are not equally mature. The forward seams are the ones being tested now. The garrison-to-VA seam is a longer conversation and it belongs in a different issue.

Lee closed the announcement with a doctrinal claim worth catching: this success demonstrates the Surgeon General's role as the medical integrator for the Army. That is a statement about who owns the seams. Coming from the 46th Surgeon General's strategic communications advisor on the day of the approval, it reads as a position being staked rather than a settled fact, and the CPE structure now standing up has its own view of who integrates what. Watch whether those two views converge.

What changed on July 27 is that the chain now starts where the injury happens rather than where the paperwork catches up. For the entire post-9/11 period, the answer to what happened in the first ten minutes has been reconstructed after the fact, from a card, by people who were not standing there.

## What to do Monday

The transferable play is a falsifiable challenge with a date on it, aimed at a capability that already works somewhere else, run at a training event already on the calendar. It costs a rotation slot instead of a new start. Every portfolio has a candidate. Find the system with years of operational use in another service that has never touched your network, and ask its owners to prove it can survive contact with yours.

Industry should read the prime slots as closed. BAE holds BATDOK development under FORGE-IT. Palantir holds Maven. Peraton and T6 hold OpMed CDP. Omni Federal holds the data backbone. What opens now sits downstream of the fielding decision: paired sensor integration and the approval path onto that list, iOS sustainment for the evacuation variant, TCCC training and simulation that documents natively into BATDOK-J, RMF and ATO sustainment on an application riding the tactical network, and coalition extension. OMIS-A runs a SAFe release train, which means recurring delivery orders rather than one large capture. Price the pipeline that way or lose money bidding it the old way.

On the Joint side, JOMIS had already fielded the classified MedCOP variant to most combatant commands, per DOT&E, so this is not the portfolio's first fielding. What is new is the route. BATDOK-J is the first JOMIS-managed application approved for Army-wide fielding by a Capability Program Executive, reaching the force through the service's own acquisition chain rather than combatant command channels. My read is that the route matters more than the sequence, and it leaves one question open that gets expensive later: who owns sustainment when the fielding decision and the funding line sit in different organizations.

There is one question anybody in operational medicine can answer this week without a clearance or a meeting. Do the medics in your formation have Nett Warrior devices? That single answer tells you whether July 27 reaches your unit this year or waits on a basis-of-issue change.

## The Card

The medic still kneels. The casualty still bleeds at the same rate he did in 2016, when the first military medics sat down at Wright-Patterson to evaluate this software.

What changed on July 27 is where the record goes next. It leaves that piece of ground at the speed of the network the medic is already standing on. The surgeon sees it before the helicopter lands. The commander sees the demand signal while he can still act on it. It follows the Soldier into garrison and past separation instead of ending in a wet cargo pocket.

DD Form 1380 will be in the aid bag tomorrow, because a download authorization and a basis of issue are two different documents.

Ten years is a long time, and the people who built it said so out loud on the day they won.

Ten months is what it took after Alex Miller asked.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue reads the fielding decision and the mechanism behind it. The companion Capture Corner works the money: where the JOMIS portfolio's FY26 prototype-to-fielding transition opens sustainment and integration lanes across all six managed applications, how the OMIS-A SAFe release train changes bid strategy versus a traditional single-award capture, the paired-sensor approval path and what it takes to get on it, which seams in the point-of-injury-to-garrison chain carry contract signal in the next twelve months, the FY28 budget lines that will tell you whether sustainment was funded or assumed, and the basis-of-issue question that governs the size of the addressable user base.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] Brian Lee, LTC, Strategic Communications Advisor to the 46th Surgeon General, LinkedIn post, July 28, 2026. Source for the July 27, 2026 CPE Ground - Soldier Systems approval, the Nett Warrior end-user device authorization, Maven Smart System and NGC2 integration, the ten-year characterization, the Alex Miller short-notice ask, the September 2025 JRTC stress test, and the participating units (82nd Airborne, 101st Airborne, 4th Infantry Division, 68th and 18th Theater Medical Commands). https://www.linkedin.com/posts/yingtabrianlee_the-army-continues-a-relentless-push-to-transform-activity-7378908398005837824--MJq

[2] Jay Baker, MD, LinkedIn post, July 28, 2026 (announcement amplification). https://www.linkedin.com/posts/jay-baker-md-4614497_yesterday-army-medicine-took-another-significant-activity-7487999417329922049-woNv

[3] DD Form 1380, Tactical Combat Casualty Care (TCCC) Card, current version JUL 2025; prescribed by DoDI 6040.45, DoDD 6490.02E, and DHA-PI 6040.01. https://www.esd.whs.mil/Directives/forms/

[5] Air Force Research Laboratory, "AFRL invention deployed by Maryland State Police," December 5, 2025. Source for BATDOK origins at the 711th Human Performance Wing, 2016 medic evaluation, and 2019 operational deployment with pararescuemen. https://www.afrl.af.mil/News/Article-Display/Article/4350895/afrl-invention-deployed-by-maryland-state-police/

[4] Air University, "Embedded Air Force researchers develop innovative battlefield medical technology." Source for Air Combat Command requirement and Dr. Gregory Burnett's role. https://www.airuniversity.af.edu/News/Display/Article/1263816/embedded-air-force-researchers-develop-innovative-battlefield-medical-technology/

[6] Air Force News Service, "Popular AFRL invention supports joint military needs with mobile medical documentation," September 3, 2023. Source for the 2022 JOMIS selection of BATDOK as the Joint integrated EHR for point of injury and en route care. https://www.af.mil/News/Article-Display/Article/3510960/popular-afrl-invention-supports-joint-military-needs-with-mobile-medical-docume/

[7] Air Force Medical Service, "445th AES, 711th HPW collaborate to improve en route patient care," July 29, 2024. Source for the iOS variant and FY25 JOMIS funding. https://www.airforcemedicine.af.mil/News/Display/Article/3852546/445th-aes-711th-hpw-collaborate-to-improve-en-route-patient-care/

[8] Director, Operational Test and Evaluation, FY2025 JOMIS Report. Source for MedCOP IOT&E timing, JITC operational assessments and cyber survivability testing, the five operational medicine functions, the six managed applications, and the FY26 prototype-to-fielding transition. https://www.dote.osd.mil/Portals/97/pub/reports/FY2025/dow/2025jomis.pdf

[9] Joint Forces News, "US AFRL selects BAE Systems for BATDOK development," July 4, 2025 (FORGE-IT). https://www.joint-forces.com/ew-and-cyber/83659-us-afrl-selects-bae-systems-for-batdok-development

[10] CPE Ground, OMIS-A program page, and DVIDS, "MC4 prepares for transformation into agile-focused OMIS," April 21, 2025. Source for the MC4 sunset schedule, the FY24 appropriations slip, the April 12, 2024 OMIS-A establishment, and the SAFe 6.0 Agile delivery model. https://cpeground.army.mil/Soldier-Systems/OMIS-A/ · https://www.dvidshub.net/news/460281/mc4-prepares-transformation-into-agile-focused-omis

[11] Army.mil, "Stryking towards networked battlefield communications," March 2, 2023, and CPE Ground Nett Warrior page. Source for Nett Warrior as a dismounted-leader Android EUD, TSM waveform, SBU-E enclave, and the Integrated Tactical Network. https://www.army.mil/article/264225/stryking_towards_networked_battlefield_communications · https://cpeground.army.mil/Equipment/Equipment-Portfolio/PM-MBCT-Enablers-Portfolio/Nett-Warrior/

[12] Soldier Systems Daily, "US Army activates Capability Program Executive Enterprise Software and Services (ES2)," March 1, 2026; CPE Ground, "A new force in Army acquisition: PEOs Soldier and Ground Combat Systems merge," April 10, 2026; ExecutiveGov, "Army acquisition portfolio changes," July 7, 2026. Source for the CPE/PAE reorganization, ES2 activation February 25, 2026, and CPE Ground under BG Troy M. Denomy. https://soldiersystems.net/2026/03/01/us-army-activates-capability-program-executive-cpe-enterprise-software-and-services-es2/ · https://cpeground.army.mil/News/Article-Display/Article/4456266/a-new-force-in-army-acquisition-peos-soldier-and-ground-combat-systems-merge-to/ · https://www.executivegov.com/articles/army-acquisition-portfolio-changes-autonomy

[13] Tectonic Defense, "A Q&A with Alex Miller, CTO of the Army," August 5, 2025, and Defense Mavericks, "Using AI to enhance mission effectiveness with Alex Miller," November 2023. Source for Miller quotations on requirements process, test-and-scale tempo, and continuous transformation. https://www.tectonicdefense.com/a-qa-with-alex-miller-cto-of-the-army/ · https://www.defensemavericks.com/using-ai-to-enhance-mission-effectiveness-with-alex-miller/

[14] CSIS, Alex Miller biography (Army CTO since December 2023). https://csis-website-prod.s3.amazonaws.com/s3fs-public/2024-09/240911_Miller_Bio.pdf

[15] health.mil, Joint Operational Medicine Information Systems Fact Sheet and Medical Common Operating Picture Fact Sheet, March 24, 2026. https://www.health.mil/Reference-Center/Fact-Sheets/2026/03/24/Joint-Operational-Medicine-Information-Systems-Fact-Sheet · https://www.health.mil/Reference-Center/Fact-Sheets/2026/03/24/Medical-Common-Operating-Picture-Fact-Sheet

[16] Navy Medicine, "Navy Medicine forges training plan for JOMIS, boosting fleet medical readiness," March 12, 2026. https://www.med.navy.mil/Media/News/Article/4434246/navy-medicine-forges-training-plan-for-jomis-boosting-fleet-medical-readiness/

[17] Peraton, "Peraton awarded $28M to continue supporting the DHA's JOMIS health care delivery program," February 13, 2025 (OpMed CDP with T6 Health Systems). https://www.peraton.com/news/peraton-awarded-28m-to-continue-supporting-the-dhas-jomis-health-care-delivery-program/

[18] SAM.gov, OMDS sole-source notice, June 26, 2026 (Omni Federal, HT0038-21-F-0035). https://sam.gov/workspace/contract/opp/b7ff49e907764979bc23723f15910ad5/view

[19] Reuters, "Pentagon to adopt Palantir AI as core US military system, memo says," March 20, 2026; CNBC, "Palantir lands $10 billion Army software and data contract," August 1, 2025; DefenseScoop, "DOD raises Palantir Maven Smart System contract ceiling," May 23, 2025. https://www.reuters.com/technology/pentagon-adopt-palantir-ai-as-core-us-military-system-memo-says-2026-03-20/ · https://www.cnbc.com/2025/08/01/palantir-lands-10-billion-army-software-and-data-contract.html · https://defensescoop.com/2025/05/23/dod-palantir-maven-smart-system-contract-increase/
