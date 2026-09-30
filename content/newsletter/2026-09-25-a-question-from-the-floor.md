---
title: "A Question From the Floor"
date: 2026-09-25
slug: a-question-from-the-floor
description: "On September 15, in the telehealth and patient portal session of the Federal Electronic Health Record Modernization office's annual summit, a participant asked what the two departments are doing about DoD Instruction 6040.48, the 2018 policy that says the Military Health System will give every beneficiary a personal health record the patient controls. The panel answered that the portal is a different thing. The same session then called the portal a digital front door, a phrase DoW used in its own 2024 solicitation for one. This issue reads the instruction that says which of those is true, follows what the departments built and unbuilt in the eight years since, and ends with the two people the portal serves least: a sergeant who leaves in November and a fifteen-year-old who cannot log in at all."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "DoDI 6040.48"
  - "personal health record"
  - "patient portal"
  - "MHS GENESIS"
  - "myAuth"
  - "My HealtheVet"
  - "TEFCA"
  - "digital front door"
  - "transition assistance"
  - "FEHRM"
  - "interoperability"
agencies:
  - "DoW"
  - "DHA"
  - "VA"
  - "VHA"
  - "CMS"
canonical_url: "https://missionmeetstech.com/newsletter/a-question-from-the-floor/"
source: claude_newsletter_project
capture_corner_teaser: "This issue reads the instruction against what the departments built. The companion Capture Corner works the requirement underneath it: the six guidance products DoDI 6040.48 assigns the DHA Director that no public document shows delivered, section 3.2 read as an app-authorization pathway the instruction already permits, the twelve-month post-separation clock as an identity and export requirement, the VA self-entry function retired in June 2025 and what replaced it, the TEFCA Individual Access Services dates from October 1 to July 1, and a calendar from Wednesday's myAuth switch to the executive order's March 7 deadline, with sourced action windows in the monthly Capture Intelligence Sheets. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "Ask the compliance question in writing, at both addresses. The DASD for Health Services Policy and Oversight monitors compliance with DoDI 6040.48, and the DHA Director owes the six section 2.2 guidance products. If nobody can point to the guidance, those products are a task without an owner, and a firm can offer to draft them. Whoever writes the data and exchange standards decides what the next solicitation inherits."
  - "Write the section 3.2 registration path as an unsolicited concept. Criteria, DiMe or DirectTrust reliance, an endpoint authorization boundary, the myAuth handoff, and the terms-of-use notice the instruction already requires. Model it on the CMS Medicare app library requirements and cite the instruction section by section. It is a smaller buy than a platform, and it is the one that satisfies the instruction fastest."
  - "Build the export test and put it in front of FEHRM before the January 6, 2027 contract review under EO 14426. Two unaffiliated providers, one device feed, source and date and units preserved, exported in DoW standard formats. Write the technical approach to the TEFCA IAS dates: October 1 tokens, January 1 demographics, July 1 FHIR. Then position the same export step inside TAP support contracts before the March 7 update deadline."
---

![A navy government records window with blue binders behind the glass, beside an empty shelf outlined in red dashes and a teal file box on the floor with a red cord](/images/newsletter/2026-09-25/cover-a-question-from-the-floor.png)

# A Question From the Floor

*On September 15, in the telehealth and patient portal session of the Federal Electronic Health Record Modernization office's annual summit, a participant asked what the two departments are doing about DoD Instruction 6040.48, the 2018 policy that says the Military Health System will give every beneficiary a personal health record the patient controls. The panel answered that the portal is a different thing. The same session then called the portal a digital front door, a phrase DoW used in its own 2024 solicitation for one. This issue reads the instruction that says which of those is true, follows what the departments built and unbuilt in the eight years since, and ends with the two people the portal serves least: a sergeant who leaves in November and a fifteen-year-old who cannot log in at all.*

Friends,

On Wednesday the Military Health System switched the MHS GENESIS Patient Portal from DS Logon to myAuth, after Carl R. Darnall Army Medical Center at Fort Hood spent the week before telling its community to set up the new login before the old one stopped working. [1][2] Take a sergeant there who read the notice, created the account, and logged in Wednesday to find last week's clinic note already waiting, because since January 20 the Defense Health Agency has been releasing signed notes and results to the portal the moment a provider signs them. [3] That sergeant separates in November. What happens to the note in December is the subject of this issue, and a federal instruction signed in October 2018 answers the question in nine pages. [4]

The difference is plain once it is said. A portal is a window into the record the government keeps: you look, you download, you message, and the government decides what is shown and for how long. A personal health record is a copy the patient keeps: everything from every doctor, the home readings no clinic has, held by the patient, shared by the patient, and still there when the government's window closes. The instruction requires the second, for every beneficiary whose record the Military Health System keeps, and it turns eight years old next month. On September 15 a participant at the federal EHR office's own summit asked the people who run the portal what had been done with it, and the answer was that the portal is a different thing. The VA presenter then called the portal a digital front door. Both cannot be true of the same door, and the instruction says which one is.

![Table comparing a patient portal with a personal health record under DoDI 6040.48 across control, what it is, what it can include, where it lives, access after separation, and family and minor access. Key point: a portal is a viewing window, and a PHR is a patient-controlled record that persists when the government's window closes.](/images/newsletter/2026-09-25/portal-vs-personal-health-record.png)



## Nine pages, six chores, one owner

DoD Instruction 6040.48 was approved on October 23, 2018 by Stephanie Barna, then performing the duties of the Under Secretary of Defense for Personnel and Readiness, and it is cleared for public release. [4] Its policy statement is one sentence long. The Military Health System "will provide, for individuals whose medical records it maintains, the opportunity to create an electronically accessed and stored PHR," and patient-controlled data "includes data that may be copied from the DoD Health Record, as well as any patient-generated data or data copied from other sources." [4]

The rest draws the line between that record and the one the government keeps. The PHR "contains information controlled by the patient, in contrast with the DoD Health Record that is fully controlled and managed by the MHS." [4] Patients may keep it in a system DoW offers or in one DoW does not, and will be given the means to copy or send information into it from the DoD Health Record and from home medical devices. [4] Family members get their own. [4] Separating service members keep access to a DoW-offered PHR for at least twelve months, in formats they can share. [4] And when the record lives outside a DoW system, the user has "exclusive control," and HIPAA and the military command exception do not reach it. [4]

The instruction hands the Director of DHA six pieces of homework: guidance on eligibility by age and beneficiary category, data standards for devices and outside sources, exchange standards, breach responsibilities, maintenance and access, and disposition. [4] I have not located a DHA procedural instruction that delivers any of the six; DHA's procedures manual for the DoD Health Record lists 6040.48 among its references and goes no further. [5]

![Table of the six guidance products DoDI 6040.48 assigned to DHA in 2018: eligibility by age and beneficiary category, data standards for devices and outside sources, exchange standards, breach responsibilities, maintenance and access, and disposition. Each is marked no public DHA procedural instruction located. A timeline runs from the 2018 instruction to the FY2020 NDAA, the 2021 FEHRM joint PHR initiative, and no public disposition of that initiative in 2026 quarterly reporting.](/images/newsletter/2026-09-25/nine-pages-six-chores-one-owner.png)



## Congress keeps writing it down, and the departments said it in print

Fourteen months later Congress wrote the same idea into law. Section 715 of the FY2020 National Defense Authorization Act put the Federal Electronic Health Record Modernization office in statute and listed among its purposes patient ownership and control of health data and a lifetime longitudinal personal health record on open APIs and FHIR. [6] The August 2020 joint strategy set beneficiary ownership and control as an objective. [7]

The departments said publicly what they were building. On November 23, 2020, a DHA article by Capt. Hae Kyung Park of the U.S. Public Health Service described the DoD/VA Patient Engagement Work Group as "spearheading efforts to create a single, lifetime, personal health data space that beneficiaries would own and control," a record that "would do for patient health data what personal finance software does for financial data," and named the FY2020 NDAA, the Cures Act, and DoDI 6040.48 as the mandates. [8] A year later, in November 2021, FEHRM listed a "DOD/VA Joint Personal Health Record Initiative (Digital Patient Engagement Platform)" among its 27 modernization initiatives. [9] This summer the Senate Armed Services Committee wrote it a third time: section 721 of its FY2027 bill directs a capability prototype on secure access to health records for members of the Armed Forces, interoperable with the EHR, with a briefing due April 1, 2027. [48] It is not law yet.

FEHRM's quarterly reports since then cover the joint exchange, the Joint Longitudinal Viewer, and TEFCA, and none says what became of the PHR initiative. [10]

## The front door VA built, and the room it closed

The case for the hub starts with what VA has built. VA relaunched VA.gov in November 2018, the same autumn the instruction was signed, and the U.S. Digital Service reports it has carried nearly 1.7 million logins a month since. [32] VA cut sign-in to Login.gov and ID.me, removing the My HealtheVet password on March 5, 2025 and DS Logon on November 18, 2025. [33] The Health and Benefits app passed 3 million downloads and 1.4 million monthly active users by June 2025. [34] On June 4, 2025 My HealtheVet moved onto VA.gov, [15] and on May 29 of this year VA retired My VA Health, its Oracle portal, so that one portal now spans both of its EHRs. [13][16][35] One front door, two logins, one portal, across a legacy EHR and a new one. DoW switched its own portal off DS Logon on Wednesday, ten months behind VA on the same road. [1][33]

VA already has the door, the identity layer, the messaging, the record view, a patient-generated data pathway, and a TEFCA plan. The hub is the set of features My HealtheVet does not have yet, added nationally the way Blue Button rolled out in 2010, so that no facility runs a different version. [12] Feature by feature, not facility by facility. That is why the record should be VA's to build.

In July 2009, VA described My HealtheVet as "VA's online personal health record," where "any Internet user may record and store important health and military history information." [11] For sixteen years VA ran a patient-controlled record that anyone could open, enrolled or not. The June 4, 2025 move ended it. VA's guidance says: "You can no longer use My HealtheVet as a personal health record to enter and store your own health information outside of your electronic health record," because the change "helps us make sure that all your important information is in the record your care team has access to." [13] Older self-entered data can still be downloaded as a report. [14] That was a design choice, and it is part of why the front door is simpler than what it replaced.

The replacement is the Share My Health Data app, which takes readings from Fitbit, Garmin, Apple, and Bluetooth devices and sends them to the VA care team; it requires enrollment, and readings once sent cannot be deleted. [17] Behind it, a 2025 study counted more than 130 million observations from 25,000 patients. [18] The 2009 record let the veteran keep a copy. The 2025 app lets the veteran send one.

VA built a front door with 1.7 million logins a month and, in the same two years, closed the one room in it the veteran owned outright.

## What DoW switched off on April 1, 2025

DoW once had the export the instruction describes. The TRICARE Online Patient Portal carried a "Download My Data" function that let a beneficiary choose the person, the data types, the date range, and the format, and pull the record as a PDF or as a continuity of care document, which TRICARE's own notice said a beneficiary could use "to document data in your preferred personal health record." [36]

On April 1, 2025 DoW decommissioned it, and Darnall told Fort Hood to download before the deadline. [37] The notice was plain: legacy records "won't transfer to MHS GENESIS," a beneficiary who wanted a copy had until March 31 to download one, and after that the route is a request form filled out in person at the records office and a return trip to pick up paper. [36] Secure messages, run by a separate vendor, did not cross over either. [38] A family that moved between a base still on TOL and one already on GENESIS has what the notice calls "gap" records, now nowhere the patient can log in. [36] Providers kept access to everything. Patients kept what they downloaded in time.

What replaced it shows the "current" record, meaning the MTF record since the clinic went live on GENESIS. [19] The presenter on September 15 called it a commercial product on which changes for DoW's own beneficiaries are "not always easy," with appointment locations still shown as DMIS codes "undecipherable" to outsiders, and publishing delays removed only this January. [21][3]

Then there is the hole in the middle of every military family's record. A beneficiary between 13 and 17 cannot have a portal account at all; the MTF flyers say access begins at 18, and cite DoW policy and the Children's Online Privacy Protection Act. [52] Parents of a 13-to-17-year-old can see appointments, messages, immunizations, and allergies, and to see anything else they file a DD Form 2870 with the records office and wait up to 30 business days. [52] The instruction's section 3.3 provides for separate PHRs for family members and says guidance on parental access to a minor's PHR "will be developed." [4] It is the first of the six chores, eligibility by age, and it has not been done. Five years of a child's record that neither the child nor the parents can open. The same flyer gives a separated service member six months of DS Logon access after leaving. The instruction says at least twelve. [52]

![Two panels on who the current portal serves least. A separating service member: myAuth login works September 23, 2026, separation in November, the instruction promises a DoD-offered PHR for at least 12 months, and the portal is not a patient-controlled record. A beneficiary aged 13 to 17: no portal account, parents see appointments, messages, immunizations, and allergies, more data requires DD Form 2870 and up to 30 business days, and parental-access guidance was never developed.](/images/newsletter/2026-09-25/who-the-portal-serves-least.png)

[4]

DoW switched off its patient-controlled export on April 1, 2025. VA switched off its self-entry record on June 4. Nine weeks apart, in the same spring, both departments retired the closest thing they had to the record the 2018 instruction requires, and neither notice mentioned the instruction.

## The front door DoW asked for, and let go

DoW used the phrase itself. In March 2024 DHA launched My Military Health at five hospitals, a care model built around one place a beneficiary starts, and at Eglin reported new patient appointments up 61 percent and mental health waits down from thirty days to one week. [39][40] On April 18, 2024 the Defense Innovation Unit posted DHA's solicitation for "a 'digital front door' that successfully integrates with or replaces our current architecture," with self-scheduling, provider search, and secure messaging. [41] More than 220 companies responded. In December 2024 DIU awarded four prototypes, to BDR Solutions, Bluestaq, Clearstep, and Ernst & Young, for a twelve-month pilot at the same five sites and about 260,000 beneficiaries, one of them the beneficiary application itself. [42][43]

The prototype window closed around September 2025. DHA has announced no scaling decision, I reported in January that the prototypes would not move to production, and the My Military Health beneficiary page on DHA's site now returns Page Not Found. [44][45] What DoW has today is the portal it had before the solicitation, on a login it changed on Wednesday. VA ran the same Oracle portal at its federal EHR sites, retired it in May, and moved those veterans onto the front door it already had. [16] Same product. One department tried to build a door around it and stopped. The other put it behind a door and kept going.

## What the room said

The portal is a window into the agency's record, and a complete copy of a service treatment record is still a Standard Form 180. [19][20] The instruction defines something else: a copy the patient keeps and the agency does not control.

At the September 15 session a participant asked the panel about DoDI 6040.48 by number, tied it to the CMS effort to let patients carry their own records in approved apps, said she saw no discussion of giving service members and veterans the tooling they are about to have in the commercial market, and asked what had become of the 2019 joint strategy. [21]

The first answer came from the DoW presenter, who had moved on from the portal role: the session was highlighting the portal, "which is very different from a patient health record or personal health record," and knew of no other effort. [21] A second DoW participant said the instruction's PHR "is really centered on care that the patient obtains outside of the federal government," described a "My STR" portal for separating members in testing with no go-live date, and said pulling outside records together "comes back to the joint HIE" and would wait on "a federally mandated joint share" that is "not there yet." [21] The participant said the mandate exists and the departments are not paying attention to the rest of healthcare. The reply: "I'm sorry you feel that way, but that's the reality of where we are." [21] The panel moved on.

The VA presenter, introducing My HealtheVet, said that "portals are evolving into digital front doors" needing "an end-to-end way of doing that," and that VA's answer is one portal reached through the app and VA.gov. [21]

If the portal is the front door to everything a beneficiary does with the department, then "the portal is a different thing" is the wrong answer to a question about where the beneficiary's own record lives. Either the patient-held copy sits behind that door or the door does not lead to it. DoW's own 2024 solicitation said the front door "integrates with or replaces" the current architecture, and the record is what the beneficiary comes to the door for. [41] VA's slides made the questioner's case for her, and the two halves of the session never met.

On the policy, the second answer was wrong on its face. The instruction's first section says patient-controlled data includes data copied from the DoD Health Record, and its third section says patients will be given the means to copy it there. [4] The reading offered to the room keeps the outside edge and drops the DoW copy, which is the instruction's core case. On the mandate, the questioner was right, and the room had not been following the news. The information blocking rule has been in force since 2021 and TEFCA's individual access procedure carries dates. [25][27] On July 30, 2025 the White House and CMS put more than 60 companies on a pledge to build patient-centered data exchange and the apps to use it by the end of March 2026: Epic, Oracle Health, Apple, Google, Microsoft, Amazon, and OpenAI among them, 21 networks committing to the CMS Interoperability Framework, and CMS strategic advisor Amy Gleason running it for Administrator Mehmet Oz. [49][50] By January the pledge had more than 600 organizations; in April CMS launched the first wave of tools. [51][29] The vendor of the federal EHR signed it. Every patient of every Epic hospital is on the receiving end of it. The joint HIE is the departments' exchange with each other, and the instruction's record was never contingent on it. Waiting for the joint HIE while the civilian market ships the patient's copy is a decision to be last.

My read is that the beneficiaries will not wait. A service member's family with an Epic hospital in town will hold a record they control for their civilian care and a form at the records office for their military care, and the department's own December 2023 memo, the one that produced the front door solicitation, was written because beneficiaries were already leaving the system for purchased care. [41] They vote with their feet. The record is one more reason to.

The panel answered for the portal. The instruction's six chores are still on the desk of the office they were assigned to in 2018.

We can put a signed clinical note on a soldier's phone within seconds of the signature. We cannot tell that soldier where to keep it when the account closes.

## The case for the hub

DoW put the thesis in policy in 2018: a record outside the EHR's governance, because the patient's control of the data is what makes it work. [4] The departments then said in print what the record would do: one lifetime space the beneficiary owns, holding copies from DoW, VA, and community providers. [8] Then the federal EHR took the money and the people, and the work went quiet.

The instruction says control. The reason is service. A separating service member does not want a project; that record should move to VA on its own, and the executive order now says it will. [31] Here is how it moves today, from a retired reader who did it: at the transition briefing they tell you to go to the records office at the MTF and ask for a CD of your full record. A few days later you have the disc. You hand it to your veterans service officer, who builds your VBA claim from it. At no step does anyone ask you to download anything from a portal, and the service officer will not take paper. In 2026 the record of a military career moves to the Department of Veterans Affairs on a compact disc in the veteran's hand, and the portal never enters the conversation. What the family wants every other day is what an Epic patient across town already has: one place with everything, theirs to open, theirs to share, on a phone. The department already knows what happens when it does not offer that. Its December 2023 memo was written because beneficiaries had left the MTFs for purchased care, and TRICARE's costs change every January by law, with a Select family in Group B paying $1,191 a year to enroll in the plan that buys civilian access. [41][53] Beneficiaries paying more each year for the industry level of service will keep choosing the industry.

The path is the one GAO's number points at: more than 210,000 separations in FY2023, 200,000 reasonably tech-savvy people a year leaving one taxpayer-funded health system and starting another, and VA already running the front door they will walk through. [22] Build the record onto it. Offer it to every service member before they leave, make it a universal veteran benefit whether or not they ever set foot in a VHA clinic, and extend it to the DoW beneficiaries who never become veterans, families included. Add features nationally, one at a time, the way Blue Button rolled out, so that no facility runs its own version. [12]

A hub that only connects is a portal by another name. The record has to aggregate and store, under the patient's control, because only the patient can bring every input together: the lab values from three health systems and the step count that none of them hold, on one screen. That is the feature section 3.4 describes and neither department has built. [4]

The HIPAA claim needs care. Advocates say patient control puts the record outside HIPAA, so a health system must let go of the data entirely for the record to work. The instruction is narrower: a PHR offered by DoW, or by a vendor on its behalf, stays under the HITECH breach rules, and only a record maintained by neither falls to the Federal Trade Commission's rule. [4] HHS draws the same line by who operates the app. [23][24] Control changes which rules apply. It does not remove them, and a design that promises otherwise will not survive a privacy office.

## The honest counterargument

The people who run the portals have two defenses, and each is real.

The first is that a new repository is a new problem: a second identity to prove, a second medication list no clinician reconciled, the patient as unpaid integrator of three health systems, and the matching and consent problems the American Hospital Association raised in April. [26] VA's reason for ending self-entry, one record the care team can see, is a patient safety position, and a hub that aggregates and stores reopens the question VA closed.

The second is that the two halves of the PHR are being built without the label: the portals in front, TEFCA's Individual Access Services behind, with requirements dated October 1, January 1, and July 1, and FEHRM preparing to connect through Oracle Health Information Network. [27][28] Section 3.2 already permits a beneficiary to keep the record in a non-DoW system, so the government authorizes the door and the market builds the room. [4] This is the stronger of the two, and the door is not yet hung: RCE called IAS responsiveness "suboptimal" in February. [30]

The instruction asks for less than a build, and DoW had the export once and switched it off.

## How to get to good

The model exists and VA ran it. Two rules. Build behind the door you already have, on the platform you have already authorized. Add features nationally, one at a time. VA's own privacy assessment describes Health Connect, its clinical contact center, as a virtual front door running as a module on a platform the department had already authorized, and the vendor reports more than 40 million calls. [46][47] My HealtheVet moved onto VA.gov. Nothing in that sequence required a new acquisition or a new place for a veteran to learn.

For the record the instruction describes, the same two rules produce a design DoW can execute without a competition. One beneficiary-facing layer on an enterprise platform the department already holds and has accredited, pulling MHS GENESIS, dental, DEERS, and the portal into a single view, so the beneficiary starts in one place for a refill, a referral, or a copy of the record. Behind that door, the patient's copy: aggregation and storage under the patient's control, populated by the copy-and-send capability section 3.4 names, exportable in the formats section 3.8 names, with the twelve-month clock published beside it. [4] Beside it, a registration path for commercial PHR apps under section 3.2, DiMe or DirectTrust review as the ticket and DoW cybersecurity policy as the floor, so the tools the questioner described become the DoW-permitted system the instruction already allows. [29][4] No new authority to operate. No new accreditation timeline. The nurse line stays in front as the human router it already is.

Then the four things that make it real. DHA writes the six items of guidance, starting with eligibility by age and what "at least 12 months" means on day 366. [4] FEHRM puts a patient-facing acceptance test into the contract review the executive order requires by January 6, labs from two unaffiliated providers and a step-count feed into a record the patient holds, exported in the formats the instruction names, and says in its next quarterly report what became of the 2021 initiative. [31][9][10] VA puts the patient-held copy on the My HealtheVet roadmap with a date. [34][13] The Transition Assistance Program hands the sergeant the export before the CAC goes. [31]

## December

The sergeant at Fort Hood logged in on myAuth Wednesday and the note was there. [1][3] In November the separation is final. The record will go to VA the way it goes now, on a disc from the records office, carried to a service officer. Anything from before the clinic moved to GENESIS is not in the portal and, since April 1, 2025, is a form at that same office. [36] If the sergeant enrolls in VA care, the front door works: one login, the VA record on the screen, the cuff at home sending readings to a care team. [13][17][33] None of it sits in one place the sergeant controls, and the DoW note is on the other side of the wall. If the sergeant does not enroll, the app is unavailable and the DoW portal has eleven months left on the clock. [17][4] The sergeant's fifteen-year-old has no login, and will not until 18, and the parents can see the vaccine list. [52]

Someone asked the government about this on September 15, by instruction number, in a recorded session, and the answer was that the portal is a different thing, and then that the portal is the front door. [21] The instruction has said what the different thing is since October 23, 2018. It has a section on family members. It has a section on separation. It has a to-do list for DHA. The sergeant will not read it and the fifteen-year-old cannot. The two offices named in section two can.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue reads the instruction against what the departments built. The companion Capture Corner works the requirement underneath it: the six guidance products DoDI 6040.48 assigns the DHA Director that no public document shows delivered, section 3.2 read as an app-authorization pathway the instruction already permits, the twelve-month post-separation clock as an identity and export requirement, the VA self-entry function retired in June 2025 and what replaced it, the TEFCA Individual Access Services dates from October 1 to July 1, and a calendar from Wednesday's myAuth switch to the executive order's March 7 deadline, with sourced action windows in the monthly Capture Intelligence Sheets.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] TRICARE Newsroom, "MHS GENESIS Patient Portal transitioning to myAuth login Sept. 23," September 2026. Source for: the September 23 switch from DS Logon to myAuth for the MHS GENESIS Patient Portal and the login options, including Okta Verify without a CAC. https://newsroom.tricare.mil/News/TRICARE-News/Article/4604059/mhs-genesis-patient-portal-transitioning-to-myauth-login-sept-23

[2] Carl R. Darnall Army Medical Center, "myAuth transition brings new login process to Fort Hood military community," September 2026. Source for: the Fort Hood community notice to create or update a myAuth account before the September 23 transition. https://forthoodmediacenter.com/myauth-transition-brings-new-login-process-to-fort-hood-military-community/

[3] Defense Health Agency, "Get your health results faster in 2026," January 14, 2026. Source for: immediate release of results and clinical notes to the MHS GENESIS Patient Portal beginning January 20, 2026. https://www.dha.mil/News/2026/01/14/18/23/Get-your-health-results-faster-in-2026

[4] Department of Defense Instruction 6040.48, "Personal Health Records (PHR) and Patient-Controlled Data," October 23, 2018, approved by Stephanie Barna, Performing the Duties of the Under Secretary of Defense for Personnel and Readiness. Source for: the policy statement in section 1.2; the six guidance items and provider-communication guidance assigned to the Director, DHA in section 2.2; the PHR's separation from the DoD Health Record and designated record set in section 3.1; the DoW-offered or non-DoW system choice in section 3.2; copy and send capabilities and automated transmittal tools in section 3.4; the twelve-month post-separation access and standard formats in section 3.8; the HITECH and FTC breach rule split in section 3.9; and the exclusive-control and HIPAA language in section 3.10. https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/604048p.pdf?ver=2018-10-23-092823-430

[5] Defense Health Agency, DHA-Procedures Manual 6025.02, "DoD Health Record Life Cycle Management," Volume 1. Source for: DoDI 6040.48 listed as reference (j). No DHA procedural instruction implementing section 2.2 of DoDI 6040.48 was located as of verification. https://health.mil/-/media/Files/MHS/Policy-Files/DHAPM602502DoDHealthRecordVol1.ashx

[6] Public Law 116-92, National Defense Authorization Act for Fiscal Year 2020, Section 715, December 20, 2019. Source for: the statutory establishment of the FEHRM office, its purposes including patient ownership and control of health data, prevention of exclusive contractor control, a lifetime longitudinal personal health record, and open APIs and FHIR, and the section 715(h) strategy requirement. https://www.congress.gov/116/plaws/publ92/PLAW-116publ92.pdf

[7] Federal Electronic Health Record Modernization office, "DoD/VA Interoperability Modernization Strategy," August 2020, posted September 24, 2020. Source for: the beneficiary ownership and control objective and the appendix mapping the lifetime PHR purpose to the common EHR. https://www.fehrm.gov/images/tab-a2-dod_va_interoperability_modernization_strategy_20200924.pdf

[8] DVIDS, Defense Health Agency, Capt. Hae Kyung (Amy) Park, Ph.D., U.S. Public Health Service, "DoD/VA Personal Health Record is key to increasing patient engagement and military readiness," November 23, 2020. Source for: the DoD/VA Patient Engagement Work Group description, the "single, lifetime, personal health data space" and "under patient ownership and control" language, and the mandates named. https://www.dvidshub.net/news/printable/383686

[9] Federal Electronic Health Record Modernization office, "DOD/VA Interoperability Modernization Strategy," presentation to the HITAC Interoperability Standards Workgroup, November 10, 2021, page 6. Source for: the listing of the "DOD/VA Joint Personal Health Record Initiative (Digital Patient Engagement Platform)" among 27 initiatives. https://healthit.gov/wp-content/uploads/2022/01/2021-11-10_DOD-VA_Interoperability_Modernization_Strategy_508.pdf

[10] Federal Electronic Health Record Modernization office, "FY2025 Q3 Quarterly Interoperability Report." Source for: the content of recent quarterly reporting on the joint health information exchange, JLV, and TEFCA analysis; no statement on the disposition of the joint PHR initiative was located. https://www.fehrm.gov/images/fy2025_q3_quarterly_interoperability_report_final_508.pdf

[11] Department of Veterans Affairs, "My HealtheVet – VA's Online Personal Health Record," fact sheet, July 2009. Source for: the description of My HealtheVet as VA's online personal health record and the statement that any Internet user may record and store health and military history information, journals, vital signs, health history, and prescriptions. https://govinfo.gov/content/pkg/GOVPUB-VA-PURL-gpo22119/pdf/GOVPUB-VA-PURL-gpo22119.pdf

[12] The White House, "Blue Button Provides Access to Downloadable Personal Health Data," October 7, 2010. Source for: the federal Blue Button rollout. https://obamawhitehouse.archives.gov/blog/2010/10/07/blue-button-provides-access-downloadable-personal-health-data

[13] Department of Veterans Affairs, "My HealtheVet on VA.gov: What to know." Source for: the statement that My HealtheVet can no longer be used as a personal health record to enter and store information outside the electronic health record, the stated reason, and the referral to Share My Health Data. https://www.va.gov/resources/my-healthevet-on-vagov-what-to-know/

[14] Department of Veterans Affairs, "About reviewing medical records online." Source for: the self-entered health information report and the statement that information cannot be added to medical records in My HealtheVet on VA.gov. https://www.va.gov/resources/about-reviewing-medical-records-online/

[15] Department of Veterans Affairs, My HealtheVet, "My HealtheVet Is Moving," May 20, 2025. Source for: the June 4, 2025 transition to VA.gov and the replacement of Shared Vitals with Share My Health Data. https://mhvidp-prod.myhealth.va.gov/mhv-portal-web/web/myhealthevet/ss20250520-my-healthevet-is-moving

[16] Veterans Health Administration, GovDelivery bulletin on the retirement of My VA Health and the transition to My HealtheVet, 2026. Source for: the May 29, 2026 retirement, the consolidation onto My HealtheVet, and the note that completed Clipboard questionnaires did not migrate and access ended May 14. https://content.govdelivery.com/accounts/USVHA/bulletins/416770f

[17] Department of Veterans Affairs, VA Mobile, "Share My Health Data" app page. Source for: supported devices and manual measurements, sharing with the VA care team, the VA health care enrollment requirement, and the statement that connected-device measurements cannot be deleted through the app. https://mobile.va.gov/app/share-my-health-data

[18] Implementation study of VA's unsolicited patient-generated health data infrastructure, JMIR, June 6, 2025. Source for: more than 130 million observations from more than 25,000 patients and the study's data quality and selection limitations. https://pmc.ncbi.nlm.nih.gov/articles/PMC12165444/

[19] Defense Health Agency, "MHS GENESIS Patient Portal," beneficiary page. Source for: portal functions including viewing and downloading health data, appointments, refills, clinical notes and results, and the myAuth notice. https://dha.mil/For-Beneficiaries/MHS-GENESIS

[20] TRICARE, "Medical Records." Source for: viewing and downloading records through the portal and requesting a complete copy of a service treatment record via Standard Form 180. https://www.tricare.mil/records

[21] FEHRM Annual Summit, telehealth and patient portal breakout session, September 15, 2026, attended by the author; session recording and transcript in the author's possession. Source for: the participant's question on DoDI 6040.48 and the 2019 strategy, the two DoW responses including the description of the instruction, the My STR portal in testing, and the joint HIE and "not there yet" statements, and the VA presenter's statement that portals are evolving into digital front doors. Speakers are not named.

[22] U.S. Government Accountability Office, GAO-25-107205, on separation health and the transition of service members, 2025. Source for: more than 210,000 separations in FY2023 and the finding of fragmented separation-health responsibilities. https://files.gao.gov/reports/GAO-25-107205/index.html

[23] U.S. Department of Health and Human Services, Office for Civil Rights, "Individuals' Right under HIPAA to Access their Health Information: Health Apps and APIs." Source for: the distinction between an app the individual chooses and one operated by or on behalf of a covered entity. https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access-right-health-apps-apis/index.html

[24] Federal Trade Commission, "Complying with FTC's Health Breach Notification Rule." Source for: breach obligations for personal health record vendors not covered by HIPAA. https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0

[25] Office of the National Coordinator for Health Information Technology, "21st Century Cures Act: Interoperability, Information Blocking, and the ONC Health IT Certification Program," final rule, Federal Register, May 1, 2020, with information blocking compliance beginning in 2021. Source for: the information blocking rule and its effective period. https://www.govinfo.gov/app/details/FR-2020-05-01/2020-07419

[26] American Hospital Association, comments on the TEFCA Individual Access Services procedure, April 24, 2026. Source for: matching, consent and authority, state-law compatibility, and accountability concerns. https://www.aha.org/lettercomment/2026-04-24-aha-comments-tefca-individual-access-procedure

[27] The Sequoia Project, Recognized Coordinating Entity, "TEFCA Standard Operating Procedure: Individual Access Services Exchange Purpose," version 3, effective August 3, 2026, section 4.9. Source for: the staged requirements dated October 1, 2026, January 1, 2027, and July 1, 2027. https://rce.sequoiaproject.org/wp-content/uploads/2026/07/SOP-IAS-XP-v3_June2026_Clean_-5081.pdf

[28] Nextgov/FCW, "14 organizations are looking to join the federal electronic health record program," September 3, 2026. Source for: FEHRM's chief technology officer on preparing to connect to TEFCA through Oracle Health Information Network. https://www.nextgov.com/digital-government/2026/09/14-organizations-are-looking-join-federal-electronic-health-record-program/415801/

[29] Centers for Medicare & Medicaid Services, "CMS Launches First Wave of Health Tech Ecosystem Tools," April 2026, and Medicare app library requirements. Source for: tools from more than 50 companies and review by DiMe or DirectTrust. https://www.cms.gov/newsroom/press-releases/cms-launches-first-wave-healthtech-ecosystem-tools-fast-tracking-fully-digital-patient-centered and https://www.cms.gov/initiatives/health-technology-ecosystem/overview/submit-your-app/requirements-medicare-app-library

[30] The Sequoia Project, Recognized Coordinating Entity, RCE information call slides, February 17, 2026. Source for: the description of IAS responsiveness as suboptimal. https://rce.sequoiaproject.org/wp-content/uploads/2026/01/2.17.26-RCE-Info-Call-FINAL.pdf

[31] Executive Order 14426, "Accelerating Access to Veterans' Benefits and Employment Opportunities," September 8, 2026, 91 FR 58003, published September 11, 2026. Source for: the 30-, 120-, and 180-day requirements in section 2, the contract review and interoperability requirement in section 2(b), and the Transition Assistance Program update in section 3. https://www.federalregister.gov/documents/2026/09/11/2026-18738/accelerating-access-to-veterans-benefits-and-employment-opportunities

[32] U.S. Digital Service, "Simplifying Veteran-facing services through VA.gov," project page. Source for: the November 2018 relaunch, the design around veterans' most common tasks, and nearly 1.7 million logins a month since relaunch. https://www.usds.gov/projects/va-dot-gov

[33] Department of Veterans Affairs, "Prepare for sign-in changes." Source for: the two sign-in options, removal of the My HealtheVet sign-in on March 5, 2025, and removal of DS Logon on November 18, 2025. https://www.va.gov/initiatives/prepare-for-vas-secure-sign-in-changes/

[34] Department of Veterans Affairs, "VA health and benefits app reaches 3 million downloads," press release, June 6, 2025, and Office of Information and Technology milestone posts. Source for: the 2021 launch, more than 3 million downloads, and 1.4 million monthly active users. https://news.va.gov/press-room/va-health-and-benefits-app-reaches-3-million-downloads/

[35] FEHRM Annual Summit patient portal session, September 15, 2026 (see [21]), and Department of Veterans Affairs, "Welcome to VA's new unified health portal," one-pager, March 2026. Source for: the Michigan market as the first federal EHR go-live that stayed on My HealtheVet, and the May 2026 transition of earlier sites. https://digital.va.gov/ehr-modernization/wp-content/uploads/sites/3/2026/03/my-healthevet_oracle-transition-new-unified-health-portal_veterans_one-pager_508-qr-code_7d2366.pdf

[36] TRICARE Newsroom, "TRICARE Online Patient Portal Decommissioning: Download Your Health Records Now," January 22, 2025. Source for: the April 1, 2025 decommissioning, the Download My Data steps and PDF or continuity of care document formats, the statement that legacy records would not transfer, the in-person request process after April 1, the "gap" records note, the 30-year lookback, and the limits on parents' access to records of children aged 12 to 17. https://newsroom.tricare.mil/News/TRICARE-News/Article/4036730/tricare-online-patient-portal-decommissioning-download-your-health-records-now

[37] Carl R. Darnall Army Medical Center, "Act Now, TRICARE Online Patient Portal to Be Decommissioned April 1," March 21, 2025. Source for: the Fort Hood community notice on the TOL decommissioning. https://darnall.tricare.mil/News-Gallery/Articles/Article/4131757/act-now-tricare-online-patient-portal-to-be-decommissioned-april-1

[38] Captain James A. Lovell Federal Health Care Center, "Electronic Health Record Modernization (EHRM)," TRICARE beneficiary page. Source for: TOL Secure Messaging run by a separate vendor (formerly RelayHealth) and the statement that messages do not cross over to MHS GENESIS. https://www.va.gov/lovell-federal-health-care-tricare/programs/electronic-health-record-modernization-ehrm/

[39] Defense Health Agency, "Defense Health Agency Launches New Digital Health Care Tools at Five Military Hospitals," March 23, 2024. Source for: the March 2024 launch of My Military Health at five military hospitals. https://health.mil/News/Dvids-Articles/2024/03/23/news466862

[40] Defense Health Agency, "My Military Health: Improving Mental Health Access and Readiness," May 30, 2025. Source for: the reported 61 percent increase in new patient appointments at Eglin and the reduction in mental health wait time from about thirty days to one week. https://dha.mil/News/2025/05/30/12/18/My-Military-Health-Improving-Mental-Health-Access-and-Readiness

[41] Nextgov/FCW, "DHA looks to contract a 'digital front door' to modernize its health system," April 19, 2024. Source for: the April 18, 2024 DIU solicitation, the "integrates with or replaces our current architecture" language, and the self-scheduling, provider search, and secure messaging features. https://www.nextgov.com/modernization/2024/04/dha-looks-contract-digital-front-door-modernize-its-health-system/395924/

[42] Defense Innovation Unit, "DIU, Defense Health Agency Announce First Awards for Digital Front Door Program," December 10, 2024. Source for: more than 220 companies responding, four prototype other transaction awards, the twelve-month prototyping effort, piloting at DHA's venture sites serving approximately 260,000 beneficiaries, and the smart routing engine prototype. https://www.diu.mil/latest/diu-defense-health-agency-announce-first-awards-for-digital-front-door

[43] ExecutiveGov, "EY Books DHA Contract to Prototype Military Healthcare Tool," December 12, 2024. Source for: Ernst & Young's prototype scope including native iOS and Android development and health record access. https://executivegov.com/2024/12/military-healthcare-technology-upgrade/

[44] Mission Meets Tech, "The MHS Triad," January 2026. Source for: the report that the Digital Front Door prototype awards would not move to production. No DHA or DIU announcement of a scaling decision has been located as of verification.

[45] Defense Health Agency, dha.mil site structure as of August 21, 2026. The beneficiary page at /For-Beneficiaries/My-Military-Health returns a Page Not Found response, and My Military Health does not appear in the DHA Topics A-Z listing. https://www.dha.mil/DHA-Topics-A-Z

[46] Department of Veterans Affairs, "VA Health Connect Customer Relationship Management Privacy Impact Assessment," FY2025. Source for: the description of VA Health Connect as modernizing VA's Clinical Contact Centers to serve as a virtual front door to VA health care, and its operation as a module on VA's already authorized platform. https://department.va.gov/privacy/wp-content/uploads/sites/5/2025/08/FY25VAHealthConnectCustomerRelationshipManagementPIAV2.pdf

[47] Salesforce, "VA Awards Salesforce $1.6B Contract to Transform Veteran Care and Services," July 24, 2026. Source for: the figure of more than 40.6 million Veteran calls handled by VA Health Connect. Vendor announcement. https://www.salesforce.com/news/press-releases/2026/07/24/missionforce-transforms-veteran-care/

[48] Senate Armed Services Committee, report language accompanying the FY2027 National Defense Authorization Act, committee filing version, section 721. Source for: the capability prototype on secure access to health records for members of the Armed Forces, interoperability with the EHR, and the April 1, 2027 briefing. https://www.armed-services.senate.gov/imo/media/doc/fy27_ndaa_report_language_committee_filing_version.pdf

[49] Centers for Medicare & Medicaid Services, "White House, Tech Leaders Commit to Create Patient-Centric Healthcare Ecosystem," press release, July 30, 2025. Source for: the more than 60 companies, the first-quarter 2026 delivery commitment, the 21 networks pledging to the CMS Interoperability Framework, the seven EHR vendors, and the 30 companies committing to identity-credentialed record retrieval. https://www.cms.gov/newsroom/press-releases/white-house-tech-leaders-commit-create-patient-centric-healthcare-ecosystem

[50] Nextgov/FCW, "White House launches digital health initiative backed by leading tech firms," July 30, 2025, and STAT, "Health care and tech companies promise CMS they'll make patient data more accessible," July 30, 2025. Source for: Epic, Oracle Health, Apple, Google, Microsoft, Amazon, and OpenAI among the signatories, and Amy Gleason's role as project lead. https://www.nextgov.com/digital-government/2025/07/white-house-launches-digital-health-initiative-backed-leading-tech-firms/407119/ and https://www.statnews.com/2025/07/30/health-care-tech-companies-promise-cms-make-patient-data-more-accessible/

[51] Fierce Healthcare, "CMS wants to speed up tech innovation and AI for patients, setting major goalposts in 2026," January 23, 2026. Source for: more than 600 organizations on the pledge by January 2026, the March 31 delivery target, and the second-quarter FHIR and record locator goals. https://www.fiercehealthcare.com/ai-and-machine-learning/cms-trying-speed-tech-innovation-and-ai-patients-major-goalposts-set-2026

[52] Ireland Army Health Clinic, "Records Request and Patient Portal Eligibility/Information," MHS GENESIS flyer, last updated January 2024. Source for: no portal access for beneficiaries aged 13 to 17 until allowed by DS Logon, parents' view limited to appointments, messaging, immunizations, and allergies, the DD Form 2870 request process and up to 30 business days, the citation of DoD policy and COPPA, and the six-month DS Logon grace period for separated, non-retired service members. Corroborated by the Womack Army Medical Center eligibility flyer. https://ireland.tricare.mil/Portals/66/IRAHC%20MHS%20GENESIS%20RECORDS%20REQUEST-PATIENT%20PORTAL%20ELIGIBILITY.pdf

[53] TRICARE Newsroom, "Learn your 2026 TRICARE health plan costs," November 7, 2025. Source for: the statement that TRICARE costs change each year based on the law, and the CY2026 TRICARE Select Group B enrollment fee of $594.96 per individual and $1,191 per family for retirees, family members, and others. https://newsroom.tricare.mil/News/TRICARE-News/Article/4328806/learn-your-2026-tricare-health-plan-costs

Sources verified as of September 24, 2026.
