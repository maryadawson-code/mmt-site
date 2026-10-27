---
title: "The Day a Doctor Said Yes"
date: 2026-10-27
slug: the-day-a-doctor-said-yes
description: "Twenty-four veterans at the Martinsburg VA Medical Center died in 2022 and 2023 with a community care consult still unscheduled, and the chief of community care emailed their names to her team. This issue follows one referral from that hospital through the seven steps it travels between VA and the private doctor at the other end, finds the one date VA cannot produce, explains why six scheduling fixes since 2000 each repaired a single step, and sets out four things, each with an owner, that would give the trip a clock."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "Veterans Affairs"
  - "Community Care"
  - "Referral Pathway"
  - "External Provider Scheduling"
  - "VA Scheduling"
  - "Veterans Health Administration"
  - "GAO"
  - "VA OIG"
  - "MISSION Act"
  - "Prior Authorization"
  - "Interoperability"
agencies:
  - "VA"
  - "VHA"
  - "CMS"
  - "DHA"
canonical_url: "https://missionmeetstech.com/newsletter/the-day-a-doctor-said-yes/"
source: claude_newsletter_project
capture_corner_teaser: "This issue follows a referral through seven steps. Premium's Capture Corner and monthly Capture Intelligence Sheets track the contracts, standards, and bills underneath it, with sourced action windows. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "Pull the September 29 scheduling BPA and its six orders from SAM.gov before you decide which lane you are in. The record carries a $30 million value that may increase, an SDVOSB set-aside, seven offers, and five identically sized network orders at $3,593,765.20 each plus an enterprise order, $19.4 million in the first year. My read is that VISNs 1 through 5 are the five networks of VA's new structure, which would make the first year enterprise-wide, and one call to the contracting office confirms it. The adoption lane is closed for the life of that agreement; the integration, data, and clock lanes are not."
  - "Write the acceptance date as a deliverable, not a feature. GAO sampled 20,463 referrals and VA's data held a usable acceptance date for 673 of them, and the 360X closed-loop referral profile carries an accept message that is exactly that date. A solution narrative for steps five and seven should show the referral as 360X transactions with timestamps and cite GAO-24-105308 by number. Price the authorization step to the CMS pattern, seven days standard and 72 hours urgent, because those are the numbers a congressional staffer already recognizes."
  - "Read the CCN Next Gen performance work statements before January 1. Four IDVs were signed August 31 to Optum, Wellpoint, TriWest, and Humana, running January 1, 2027 through December 31, 2036, with nothing obligated yet. If they carry acceptance, occurrence, and record-return obligations, the TPA becomes the party that produces the data VA cannot, and the integration market shrinks to the seam between the TPA and VA. If they do not, the lane for steps five through seven stays open through the next contract period, and the 2027 Oracle calendar, 26 hospitals starting with four in Wisconsin and Michigan in January, is the constraint your deployment plan has to work around."
---

![Two navy card boxes on a white desk. The left box, labeled VA, holds a community care referral checklist with four dated steps checked off, from referral submitted on January 3 to referral transmitted on January 8. The right box, labeled Private Care, holds a cardiology appointment card stamped accepted and confirmed for January 15. A strip of calendar pages runs between the two boxes, with the January 14 page torn out and lying on the desk below the empty slot.](/images/newsletter/2026-10-27/cover-the-day-a-doctor-said-yes.png)

# The Day a Doctor Said Yes

*Twenty-four veterans at the Martinsburg VA Medical Center died in 2022 and 2023 with a community care consult still unscheduled, and the chief of community care emailed their names to her team. This issue follows one referral from that hospital through the seven steps it travels between VA and the private doctor at the other end, finds the one date VA cannot produce, explains why six scheduling fixes since 2000 each repaired a single step, and sets out four things, each with an owner, that would give the trip a clock.*

Friends,

On February 28, 2023, the Martinsburg VA Medical Center in West Virginia had 5,128 community care consults waiting to be scheduled, and 4,503 of them had waited more than seven days. [1] Somewhere in that stretch the chief of community care emailed her team two lists of veterans who had died with a community care consult still unscheduled, twenty-four names in all from 2022 and 2023, and implied that the delays were the reason. The facility's risk management review later found the deaths were unrelated to the scheduling, and when the inspector general's report came out in May 2024, its first recommendation was that the chief limit who sees those names. [1] The second was to fix the workflow. That workflow is a seven-step trip between VA and a private doctor's office, and for 97 percent of the referrals in a 2024 GAO sample, VA's data could not say the date the trip crossed from one to the other. [9]

I keep returning to that email because of where it went. It went sideways, to her own staff, and its purpose was to make the people who process consults feel a clock the system they work in does not show them. The inspector general found three things behind the backlog at Martinsburg: ineffective processes for managing consults, shortages of specialists in otolaryngology, gastroenterology, radiology, orthopedics, and cardiology, and what the report calls oversight challenges. [1] Those three findings are the argument of this issue in miniature, and the way to see it is to follow one referral.

So take a veteran at Martinsburg that spring. Say his primary care doctor hears something in his heart and wants a cardiologist to look at it. What follows is the trip that consult takes, step by step, with the document that says what goes wrong at each one. The yardstick is a single date, the day a cardiologist agrees to see him.

## Step one: the consult

The doctor enters a consult, and the first fact about it is how often a consult like this never needed a visit. In a rheumatology study VA's own research office lists, a specialist reading the chart recommended primary care management or a different referral for 41 percent of e-consults, and a VA cardiology clinic running a similar model triaged about 60 percent of its consults to e-consult and cut its median wait from 24 days to 13. [35] The front door is the cheapest place to shorten the trip, and the method is on the shelf.

## Step two: the decision

A referral coordination team decides whether the veteran sees a VA cardiologist or one in the community. Martinsburg had a cardiology shortage, so this one goes out. [1] The Referral Coordination Initiative that governs the decision is written into VHA Directive 1232, and when GAO asked, 103 of 129 facility officials, 80 percent, called it challenging, and GAO called its implementation inconsistent. [5][10] The decision that routes sixty million appointments a year is made by teams whose own leaders describe the process as hard to run.

Sixty million is the right number. VA completed 82,083,918 direct care appointments and 59,989,662 community care appointments in fiscal 2025, with community care up 12 percent in a year and direct care up 4.1. [2] By my arithmetic about 42 percent of what VA scheduled went out the door, with $23.0 billion in payments to community providers in 2025 and just over 14 million referrals in fiscal 2024 and the first seven months of 2025. [3][6] Scheduling used to be a clinic function. It is now the routing layer between two delivery systems of comparable size, and the seam between them is where GAO and the inspector general keep finding the gap.

## Step three: the authorization

VA confirms the veteran is eligible, prepares the referral, and issues an authorization number. The department's own page for veterans says this step "can take up to 14 days." [4] The timeframes VA holds its staff to for this step and the next sit in a standard operating procedure that Directive 1232 describes as "not available to the public." [10] The rule the veteran is waiting on is a rule the veteran is not allowed to read.

Hold those fourteen days against a rule the federal government already enforces on someone else. Since January 1 of this year, CMS has required Medicare Advantage, Medicaid, and CHIP plans to decide a standard prior authorization within seven calendar days and an urgent one within 72 hours, with extensions of up to 14 days allowed in limited cases and the interfaces to carry those decisions due in January 2027. [22] In law, a VA referral and a Medicare prior authorization are different instruments. In practice they do the same job, because the veteran cannot be seen outside until VA has said yes. The government holds private insurers to a seven-day clock, publishes it, and enforces it, and it tells a veteran in Martinsburg the same step may take fourteen.

DHA, for its part, put its access standards on the record beside VA's and CMS's in a report to Congress in February: seven days for routine primary care under TRICARE against twenty at VA, 28 days for specialty care on both sides, and next to its own standard DHA printed its measured wait, 18 days. [23] One department publishes its clock next to its comparators. The department next door keeps its clock in a document a veteran cannot open.

## Step four: the slot

Now someone has to find the cardiologist a date. The House subcommittee that oversees VA technology heard in May 2025 that booking one community care appointment takes nine steps, that referrals scheduled by telephone averaged 33 days at the sites it examined, and that a scheduler using VA's External Provider Scheduling tool, which shows a private clinic's open calendar on the scheduler's own screen, could book in seven minutes and bring the average down to 25 days. [6] EPS reached every VA facility by late 2025, and by March 27,000 community providers across 78 specialties had opened their calendars to it; by May the count was past 29,000, with more than 150,000 appointments booked through it. [26][28] It reads availability from more than 150 community record and scheduling systems, and in June VA told the House that a pilot begun in January at Charleston and Atlanta shows direct care and community care appointments "on the same platform." [27][28]

Whether the Martinsburg cardiologist is one of the 27,000 is the question. Adoption has varied by site from the start: committee staff who visited the Orlando and Columbia pilots in 2023 saw two different pictures, and by the fall of 2024 one live site had two providers signed up while others had hundreds. [6] In Nebraska, the state's two academic medical centers began onboarding in October 2024 and were still at it the following May. [6] The AMA's guidance to physicians states the tool's limit in one line: EPS "only aids with the initial appointment, not a complete community care integration solution." [29] If the cardiologist is on it, step four takes seven minutes. If he is not, it takes the telephone.

## Step five: the yes

This is the step to hold. At some point the cardiologist's office agrees to take the veteran. In 2024 GAO asked VA a plain question about that moment: on what date did the community provider accept the referral? GAO sampled 20,463 referrals at nine facilities. VA's data held the answer for 673 of them, and GAO wrote that VA's approach "cannot produce measurements for the time periods from when a provider accepts a referral," which left four of VA's fifteen timeliness measures without a usable clock. [9]

Three percent.

Every package you have ever ordered reports where it is. A VA referral, at the moment it leaves VA's hands and lands in a private doctor's office, does not. DHA tells Congress in writing how many days a service member waits for a specialist, and VA could not say, for 97 percent of a sample, the day a specialist said yes. [23][9]

## Step six: the visit

The appointment happens, or it does not. The inspector general reviewed 133 VA health care systems this August and found five that met VA's own seven-day standard for scheduling mental health consults in the community. [7] VA's acting deputy assistant under secretary for integrated veteran care told the House that network adequacy "is not measured by individual Community Care providers, it is done through the TPAs, who then have different standards not related to MISSION Act standards." [6] The contractors who run the networks are held to clocks of their own. GAO first recommended in June 2018 that VA set a timeframe for when a community appointment must occur, and as of February 2025 VA had not. [5]

Sending the veteran out is not automatically faster, either. In a study of more than 22 million appointments from 2018 through 2021, measured from the day VA approved the referral, VA-delivered care was faster than community care in primary care, mental health, and specialty care in 15, 16, and 17 of 18 networks, while veterans rated community appointments slightly easier to get, 81.4 percent against 77.7. [21] Because the study started its clock at approval, it left out step three, the one VA says can take fourteen days. The access fight is usually staged as VA against the community. The measured waits favor VA, the experience favors the community, and the handoff between them is where both watchdogs keep finding the gap.

## Step seven: the record

The cardiologist's note has to come back. GAO found that a third of behavioral health referrals had no record of the first visit back in the VA file, and VA's own witness told the House in May 2025 that the department does "not collect national-level data on document return at this point." [8][6] For our veteran, that means the primary care doctor who heard something may never read what the cardiologist found, and the referral still counts as done.

## The seam

Seven steps, and the ones that fail are the handoffs: the decision at two, the authorization at three, the yes at five, the return at seven. In June, GAO told the same House subcommittee that VA officials had said the department "has not yet determined how the modernized and updated products used for scheduling will interface and be used to pull and combine the data" into one report. [8]

The trip has every owner except one. The Office of Integrated Veteran Care writes the consult directive. The Office of Information and Technology and the health record program own the scheduling products. The medical centers own the schedulers, the contractors own the networks, and the cardiologist owns the slot. VA is restructuring VHA under an effort called RISE into a central office, operations centers, five networks, and 139 health care systems, and I found no public document that says where the referral pathway lands. [16]

## Twenty-six years of screens

The sequence of fixes explains how it got this way. The Veterans Health Administration decided to replace VistA scheduling in fiscal 2000. [11] Fourteen years and one Phoenix later, VistA Scheduling Enhancement arrived as a front end on the same 1980s system, and the inspector general found the final contract modification came more than a year after the contract was supposed to end, with the price up from $4.1 million to $6.8 million. [11] In August 2015 VA awarded a $624 million contract for a commercial scheduling system built on Epic's software, piloted it in Columbus, and told Congress in December 2018 it would end it to fast-track the scheduling module inside the Cerner record it had bought in the meantime. [12][13] That module's first nine months at Spokane routed more than 11,000 clinical orders to a queue the clinicians could not see, and VHA counted 149 veterans harmed. [14] EPS, the community tool, was piloted in 2020, awarded in September 2023, paused in 2024, and expanded from 16 sites to 36 in the first hundred days of 2025. [6]

The system VA set out to replace in fiscal 2000 has new releases scheduled through 2029. [15]

Six fixes, and each landed on one step. VSE repaired the screen. MASS and the Oracle module repaired the clinic scheduler, or tried to. EPS repaired the telephone call at step four, and the Referral Coordination Initiative repaired the decision at step two. Nothing repaired the yes at step five or the return at step seven, because those are seams, and a seam is what you get when every step has an owner and the trip does not.

The fight over where a clock starts is an old one. In 2012 GAO found VA's wait times unreliable because schedulers changed the "desired date" to match what was available. [17] Phoenix in 2014 was the extreme case. Every redefinition since has argued over the start line, and the finish line, the day care actually happened, has never had a public rule.

## The capacity argument, stated fairly

The strongest case against this issue is that VA's problem is supply, and the record supports it. The independent assessment Congress ordered under the Choice Act listed as its first systemic finding in 2015 "a disconnect in the alignment of demand, resources, and authorities." [18] VHA lost 783 physicians in the first eleven months of fiscal 2026 while adding 235 medical support assistants, so the scheduling workforce held and the clinical bench shrank. [19] England has run a published, legally backed referral-to-treatment clock for years, and in March 65.3 percent of its patients were treated within 18 weeks with 7.11 million still waiting. [20] A clock exposes a gap. It does not close one.

My read is that the capacity argument is right and incomplete. VA cannot route its way to 783 more physicians, and I will not pretend a clock hires anyone. But a department that cannot date the yes at step five cannot tell a network director whether to hire a cardiologist, buy one in the community, or move the consult to video, because it cannot see where the time goes. The pathway fix leaves supply where it is and makes the supply decision answerable.

## Four things, each with an owner

Every part of a working pathway already exists somewhere, and I will take them in the order the referral met them.

Publish the clock. This belongs to the Office of Integrated Veteran Care and could be done this quarter: the consult entry date starts it, the first completed visit stops it, and the SOP timeframes come out of the internal portal and onto VA.gov. England's rules suite shows what the page looks like: it says when a referral-to-treatment clock starts, including the day a referral reaches a referral management service, says when it stops, allows no pauses at all, and sits under a patient's right in the NHS Constitution to treatment within maximum waiting times set in regulation. [24] In this Congress the SCHEDULES Act, S. 4229 and H.R. 8199, would require VA to set that standard, report quarterly on the share of referrals that meet it, and publish rankings for each facility, and its sponsors cite GAO's finding that medical centers are less likely to meet their own seven-day scheduling standard for community referrals than for care inside VA. [25][43] GAO has made 27 recommendations on the community care program, and VA had implemented nine as of February 2025. [5] VA could publish the timeframes tomorrow without waiting for either chamber.

Put a deadline on the yes-or-no. Same office, with Congress behind it if needed: adopt the rule CMS already enforces on private plans, seven days standard and 72 hours urgent, for the authorization step, and report the share of referrals that meet it. [22] The Take Care of America's Veterans Act, S. 4744, is one bill that could carry it if VA will not act on its own. [38]

Capture the yes as a message. This belongs to VHA and the Office of Information and Technology together, and the deadline is the health record's 2027 calendar. The 360X referral profile, a standard from the IHE consortium built on HL7 messaging, carries a referral as a sequence of messages between two systems: request, accept or decline, appointment, no-show, outcome. [31] An accept message is, exactly, the date GAO could not get. National exchange through TEFCA connects more than 71,000 sites, HL7 has a trial-use specification called SMART Scheduling Links for how a scheduler exposes open slots to any discovery client, and EPS already books into more than 150 systems. [32][30][27] Make the referral record the system of record for the trip, close it only when the note is back and acknowledged, and publish the architecture GAO asked for, naming which product owns which step. [8] VA plans to bring the new health record live at 26 more hospitals in 2027, and the Ann Arbor system's own page warned veterans that "fewer appointments may be available from March through May of 2026" around its transition. [39][40] The seam gets wider at every one of those sites unless someone is assigned to it first.

Name the owner. This belongs to the Under Secretary for Health. The Commission on Care proposed in 2016 that VA run one integrated network and take responsibility for coordinating care across it, and the National Academies set out the principles a year earlier: continuous matching of supply and demand, immediate engagement, patient preference, alternatives to the in-person visit, and standardized measures. [33][34] VA has adopted pieces of both, and it has met an access standard before when it defined one and resourced it; by 2016 every medical center offered same-day services for urgent primary care and mental health needs. [36] RISE is redrawing every box in VHA this year, and a redrawing that leaves the referral pathway unowned is the same organization chart with new names. [16]

Where AI fits in all four: VA's 2025 inventory lists a pilot that summarizes a veteran's history across VistA, Cerner, and outside documents and estimates appointment times across direct and community care, an agentic tool for retrieving community care records that is still pre-deployment, and a machine learning model for the community care directory of 1.5 million providers, also pre-deployment. [37] An overlay cannot read a status the source never writes down, which is why the clock and the acceptance message come first.

## What to watch

The Veterans Community Care Scheduling Improvement Act, H.R. 3482, which would mandate EPS nationwide, passed the House by voice vote on May 19 and waits on the Senate. [41] The SCHEDULES Act sits in committee in both chambers. [25] The Cleland-Dole Act of 2022 required VA to plan how it would tell veterans the expected wait for care, with VA providers and in the community, and to have that plan in place by December 29, 2025. The department's February 2025 plan to Congress said community availability "is reliant on extensive communication with numerous community providers" and that "there is currently no immediate solution that provides Veterans with average wait times in the community," and pointed to EPS and a self-scheduling pilot as the routes it would build. [42] Whether EPS data now serves that duty is not stated in any VA document I could find. On September 29, VA signed a five-year blanket purchase agreement for enterprise scheduling modernization, an SDVOSB set-aside with seven offers, whose own description reads "interoperability, implementation, training, activation, adoption, sustainment, and support" and whose stated $30 million value "may increase over time," and the next day placed six orders against it, one for each of the five networks in VA's new structure and one for the enterprise, $19.4 million in all, to deploy integrated scheduling; the companion Capture Corner reads that record line by line. [44] The first 2027 wave of the new health record lands in January at four sites in Wisconsin and Michigan, and each one is a test of whether the seam gets managed or just moved. [39]

## Back to Martinsburg

The veteran with the cardiology consult is a figure I built from the specialties the inspector general named. The twenty-four are not. The chief of community care at Martinsburg built a clock by hand. She took the names of veterans who had died with a consult open and sent them to the people who process consults, because nothing on their screens told them how long a referral had been sitting or where on its trip it had stalled. The inspector general was right to tell her to stop. It was also right, in its second recommendation, that the workflow was the problem, and the workflow is the trip this issue has followed: seven steps, two delivery systems, scheduling products with no plan for the data between them, and a yes that VA cannot date for 97 percent of a sample.

The parts are built. England publishes its clock rules, CMS enforces a decision deadline on private plans, HL7 wrote the standard for the slots, and the industry wrote the standard for the handshake. VA has the tool at every facility and 27,000 clinics on the other end of it. What is missing is one owner, one clock, and a field in the record that says a doctor said yes.

A scheduler at Martinsburg opened that email and read the names. The fix is a system in which that scheduler sees the clock before anyone has to write the list.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue follows a referral through seven steps. Premium's Capture Corner and monthly Capture Intelligence Sheets track the contracts, standards, and bills underneath it, with sourced action windows.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] Department of Veterans Affairs Office of Inspector General, "Delays in Community Care Consult Processing and Scheduling at the Martinsburg VA Medical Center in West Virginia," 23-02020-85, May 2, 2024. Source for: 5,128 unscheduled consults as of February 28, 2023, with 4,503 (88 percent) older than seven days (p. 12); the chief of community care's two lists totaling 24 veterans who had died with unscheduled consults and the implication that scheduling delays were the cause (pp. 9, 15); the internal review finding that the deaths were not related to the delays (p. 15); the three stated causes, ineffective processes, specialty shortages in otolaryngology, gastroenterology, radiology, orthopedics, and cardiology, and oversight challenges (pp. 3, 9); and the four recommendations in order (p. 21). https://www.vaoig.gov/sites/default/files/reports/2024-05/vaoig-23-02020-85_0.pdf

[2] Department of Veterans Affairs, "Following major reforms, over 300K new Veterans enroll in VA health care in 2026," October 21, 2026. Source for: 82,083,918 direct care and 59,989,662 community care appointments in fiscal 2025, with community care up 12 percent and direct care up 4.1 percent. The 42 percent share is the author's calculation from VA's counts (59,989,662 of 142,073,580). https://news.va.gov/press-room/following-major-reforms-over-300k-new-veterans-enroll-in-va-healthcare-in-2026/

[3] Congressional Budget Office, publication 61960. Source for: $23.0 billion in payments to community providers in 2025. https://www.cbo.gov/publication/61960

[4] Department of Veterans Affairs, "How to get community care referrals and schedule appointments," VA.gov. Source for: "This part of the process can take up to 14 days." https://www.va.gov/resources/how-to-get-community-care-referrals-and-schedule-appointments/

[5] U.S. Government Accountability Office, GAO-25-108101, statement of Sharon M. Silas before the House Committee on Veterans' Affairs, Subcommittee on Health, February 12, 2025. Source for: 27 recommendations on the Veterans Community Care Program with nine implemented, 17 open, and one closed as of February 2025 (pp. 1, 3); 103 of 129 facility officials describing the Referral Coordination Initiative as challenging and implementation as inconsistent (p. 12); the June 2018 recommendation in GAO-18-281 on community appointment timeframes (p. 20); and the finding that VA "has not established a timeliness standard within which veterans' appointments must occur" (pp. 10-11). https://www.gao.gov/assets/gao-25-108101.pdf

[6] U.S. House of Representatives, Committee on Veterans' Affairs, Subcommittee on Technology Modernization, "Improving Access to External VA Care Through Enhanced Scheduling Technology," hearing, May 5, 2025, Serial No. 119-19. Source for: the nine-step scheduling process; 33 days to schedule by traditional means against 25 through EPS at live sites; seven minutes per booking; the 2020 Orlando pilot; the September 2023 award; the 2024 pause; expansion from 16 to 36 sites (oral testimony as of May 1, 2025; the written statement gives 34 as of April 18); site-to-site adoption variation; the Nebraska onboarding account; the 14 million referrals in FY2024 to date; the network adequacy quotation; and the statement that VA does "not collect national-level data on document return at this point." https://congress.gov/119/chrg/CHRG-119hhrg61152/CHRG-119hhrg61152.pdf

[7] Department of Veterans Affairs Office of Inspector General, "Review of Timeliness of Mental Health Community Care Appointments," 25-03623-147, August 10, 2026. Source for: five of 133 VA health care systems meeting the seven-day scheduling standard. https://www.vaoig.gov/sites/default/files/reports/2026-08/vaoig-25-03623-147-final.pdf

[8] U.S. Government Accountability Office, GAO-26-109213, statement of Chelsea Harris before the House Committee on Veterans' Affairs, Subcommittee on Technology Modernization, June 12, 2026. Source for: the quoted statement, which GAO reports as what VA officials told it, that the department "has not yet determined how the modernized and updated products used for scheduling will interface and be used to pull and combine the data into a comprehensive report" (p. 12), and 118,373 of 357,299 behavioral health referrals in fiscal years 2021 through 2023, 33 percent, lacking initial-visit records (p. 13). https://docs.house.gov/meetings/VR/VR11/20260612/119376/HHRG-119-VR11-Wstate-HarrisC-20260612.pdf

[9] U.S. Government Accountability Office, "Veterans Community Care Program: VA Needs to Improve Its Data on Referral Timeliness," GAO-24-105308, March 28, 2024. Source for: the sample of 20,463 referrals at nine facilities, August 16 to 31, 2023; "only 3 percent (673 referrals)" with usable acceptance data (Highlights and p. 16); the statement that VA's approach "cannot produce measurements for the time periods from when a provider accepts a referral" (p. 15); and four of 15 timeliness metrics affected (Table 3, p. 24). https://www.gao.gov/assets/gao-24-105308.pdf

[10] Veterans Health Administration, Directive 1232, November 22, 2024. Source for: the Referral Coordination Initiative in policy and the consult timeliness standard operating procedure described as not available to the public. https://www.va.gov/vhapublications/ViewPublication.asp?pub_ID=12082

[11] Department of Veterans Affairs Office of Inspector General, 16-03597-171, August 20, 2019. Source for: the fiscal 2000 decision to replace VistA scheduling and VistA's 1980s origin (p. i); the VistA Scheduling Enhancement schedule, with completion planned for November 2015, enhancements due July 2016, and the final modification in September 2017, "more than one year after the contract end date," with contract value rising from $4.1 million to $6.8 million (pp. 2, 10); the Medical Appointment Scheduling System award to Systems Made Simple at "a maximum cost of about $624 million over a seven-year period"; and the December 20, 2018 report to Congress and April 2019 program statement that MASS "will no longer be deployed to other sites." https://www.oversight.gov/sites/default/files/documents/reports/2019-08/VAOIG-16-03597-171.pdf

[12] Lockheed Martin, "Meeting Veterans' Needs with a Modernized VA Medical Appointment Scheduling System," August 31, 2015. Source for: the August 2015 MASS award to Systems Made Simple. https://news.lockheedmartin.com/2015-08-31-Meeting-Veterans-Needs-with-a-Modernized-VA-Medical-Appointment-Scheduling-System

[13] Office of Rep. Susie Lee, chairwoman, House Veterans' Affairs Subcommittee on Technology Modernization, release on VA's December 2018 notification of its intent to terminate the MASS contract, 2019. The Columbus deployment, April 2018 at the Chalmers P. Wylie Ambulatory Care Center, is in VA OIG 16-03597-171 (pp. ii, 5), source 11. https://susielee.house.gov/media/press-releases/video-file-included-chairwoman-susie-lee-va-officials-your-plan-update-patient

[14] Department of Veterans Affairs Office of Inspector General, "The New Electronic Health Record's Unknown Queue Caused Multiple Events of Patient Harm," 22-01137-204, July 14, 2022. Source for: more than 11,000 orders routed to the unknown queue from go-live through June 2021 and 149 patient harm events. https://www.oversight.gov/sites/default/files/oig-reports/VA/VAOIG-22-01137-204.pdf

[15] U.S. Government Accountability Office, GAO-25-106851, May 22, 2025. Source for: "New versions of ISS will be released through 2029." https://files.gao.gov/reports/GAO-25-106851/index.html

[16] Department of Veterans Affairs, RISE. Source for: the planned VHA structure of a central office for policy and governance, operations centers and VISNs for oversight and implementation, a five-VISN map, and 139 health care systems, with placement "ongoing" and no effective date stated. https://digital.va.gov/rise/

[17] U.S. Government Accountability Office, GAO-13-130, December 2012. Source for: unreliable wait-time data caused by schedulers changing the desired date. https://www.gao.gov/products/gao-13-130

[18] MITRE Corporation, "Independent Assessment of the Health Care Delivery Systems and Management Processes of the Department of Veterans Affairs," Integrated Report, Vol. I, September 2015, p. xiii, first systemic finding: "A disconnect in the alignment of demand, resources, and authorities." Also quoted in GAO's summary of the assessment. https://www.mitre.org/sites/default/files/publications/17-0210-caring-for-our-vets.pdf and https://www.gao.gov/assets/690/680170.pdf

[19] Department of Veterans Affairs, VA Workforce Dashboard, Issue 41, September 25, 2026, data through August 31, 2026. Source for: medical support assistants from 35,631 to 35,866 (up 235) and physicians from 28,340 to 27,557 (down 783) in fiscal 2026 to date. https://department.va.gov/employees/wp-content/uploads/sites/63/2026/10/VA-Workforce-Dashboard-Issue-41.pdf

[20] NHS England, "Health service hits 18-week target amid half-million waiting list drop," May 2026. Source for: 65.3 percent of patients treated within 18 weeks in March 2026 and a waiting list of 7.11 million. https://www.england.nhs.uk/2026/05/health-service-hits-18-week-target-amid-half-million-waiting-list-drop/

[21] RAND Corporation, testimony before the Senate Committee on Veterans' Affairs, September 2022, and JAMA Network Open, 2022, on wait times for VA and community care, 2018 to 2021. Source for: VA-delivered care faster in 15, 16, and 17 of 18 VISNs for primary, mental health, and specialty care, measured from approval, and 81.4 percent versus 77.7 percent ease-of-access ratings. https://www.veterans.senate.gov/services/files/AC23DF01-51F2-45E3-A2E6-8172E23B3546 and https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2795631

[22] Centers for Medicare & Medicaid Services, CMS Interoperability and Prior Authorization Final Rule (CMS-0057-F), fact sheet and frequently asked questions. Source for: seven-calendar-day standard and 72-hour expedited decision timeframes effective January 1, 2026, for Medicare Advantage, Medicaid, and CHIP; extensions of up to 14 days in limited circumstances; and the Prior Authorization API requirement from January 1, 2027. https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f and https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/frequently-asked-questions/improving-prior-authorization-processes

[23] Department of War, "Assessing Access to Health Care Standards," report to Congress, February 2026, responding to H. Rept. 118-529. Source for: Table 1, routine primary care at 7 calendar days (TRICARE), 20 days (VA), and 15 business days (CMS); specialty care at 28, 28, and 30 business days; and measured MHS waits of 1.6, 9.7, and 18.0 days. https://www.health.mil/Reference-Center/Reports/2026/02/27/Assessing-Access-to-Health-Care-Standards

[24] NHS England, "Referral to treatment consultant-led waiting times rules suite," October 2022. Source for: clock start rules including referral to "an interface or referral management or assessment service" (Rule 1b); clock stop rules (Rule 4); the statement that since October 1, 2015 "there is no provision to pause or suspend an RTT waiting time clock under any circumstances"; and the NHS Constitution right to access services within maximum waiting times, with the standards set in the 2012 Standing Rules Regulations. https://www.gov.uk/government/publications/right-to-start-consultant-led-treatment-within-18-weeks/referral-to-treatment-consultant-led-waiting-times-rules-suite-october-2022

[25] S. 4229 (Sen. Rick Scott, introduced March 26, 2026) and H.R. 8199 (Rep. Scott Franklin, introduced April 6, 2026), SCHEDULES Act of 2026, 119th Congress. Source for: the referral-to-appointment timing standard, publication in the Federal Register and on a VA website, quarterly reporting, and facility rankings. https://www.congress.gov/bill/119th-congress/senate-bill/4229/all-info and https://www.congress.gov/bill/119th-congress/house-bill/8199/text

[26] Department of Veterans Affairs, "VA moves to speed up community care appointment scheduling," March 9, 2026. Source for: "EPS was implemented in all VA facilities by late 2025" and 27,000 participating community care providers across 78 medical specialties. https://news.va.gov/press-room/va-moves-to-speed-up-community-care-appointment-scheduling/

[27] Department of Veterans Affairs, Veterans Health Administration, "FAQ for EPS Providers," dated July 2026. Source for: "EPS has over 150 integrations with community electronic health records (EHR) and scheduling systems." https://department.va.gov/vha/wp-content/uploads/sites/65/2026/08/FAQ-for-EPS-Providers-VA-Styled.pdf

[28] Department of Veterans Affairs, statement of Andrew Gradison, Senior Advisor to the Under Secretary for Health, before the House Committee on Veterans' Affairs, Subcommittee on Technology Modernization, June 12, 2026. Source for: the integrated scheduling pilots at Charleston, South Carolina, and Atlanta, Georgia, begun January 2026, allowing "viewing of both direct care and community care appointments on the same platform" (pp. 1-2); and, as of May 2026, "over 29,000 community providers and more than 41,000 provider services" and "more than 150,000 appointments" through EPS (p. 2). https://www.congress.gov/119/meeting/house/119376/witnesses/HHRG-119-VR11-Wstate-GradisonA-20260612.pdf

[29] American Medical Association, "Enterprise Patient Scheduling (EPS): What community physicians need to know about VA scheduling," April 23, 2026. Source for: the quoted limit on EPS. https://www.ama-assn.org/public-health/population-health/enterprise-patient-scheduling-eps-what-community-physicians-need

[30] HL7, SMART Scheduling Links, version 1.0.0-ballot, STU 1, trial use, continuous build. Source for: the Slot Publisher and Slot Discovery Client roles. The build page states it is not an authorized publication. https://build.fhir.org/ig/HL7/smart-scheduling-links/en/specification.html

[31] IHE International, Patient Care Coordination Technical Framework Supplement, "360 Exchange Closed Loop Referral (360X)," Trial Implementation, and CMS, ACCESS model interoperability webinar slides, 2026. Source for: the 360X transactions, referral request, accept or decline, appointment notification (optional), no-show, interim consultation, and referral outcome, built on HL7 v2, C-CDA, and Direct. https://www.ihe.net/uploadedFiles/Documents/PCC/IHE_PCC_Suppl_360X_Rev1.1_TI_2017-09-08.pdf and https://www.cms.gov/priorities/innovation/files/access-interop-webinar-slides.pdf

[32] Assistant Secretary for Technology Policy / Office of the National Coordinator, "Data Liquidity, Affordability, and Access: The History and Growth of TEFCA," updated June 5, 2026. Source for: "over 71,000 sites or organizations are participating in TEFCA through 11 QHINs." https://healthit.gov/resources/data-liquidity-affordability-and-access-the-history-growth-of-tefca/

[33] Commission on Care, Final Report, June 30, 2016. Source for: recommendation 1, "integrated community-based health care networks, to be known as the VHA Care System" (p. 23); "VHA will have overall responsibility of ensuring care coordination for veterans, including complex care navigation" (p. 29); and recommendation 9, a board of directors for VHA Care System governance (p. 94). https://i2.cdn.turner.com/cnn/2016/images/07/05/commission-on-care_final-report_063016_1815-3-1.pdf

[34] National Academies of Sciences, Engineering, and Medicine, "Transforming Health Care Scheduling and Access: Getting to Now," 2015, Summary, Boxes S-2 and S-3. Source for: supply-demand matching through formal ongoing evaluation, immediate engagement, patient preference, need-tailored care with reliable alternatives to the clinician visit, and standardized measures and benchmarks for timely access. https://www.nationalacademies.org/read/20220/chapter/2

[35] Malcolm et al., Journal of Clinical Rheumatology, 2022, as listed by VA Health Services Research and Development, citation 155942: rheumatologists "recommended management in primary care or referral to another specialty for 41% of eConsults, reducing initial demand for in-person visits." And American Journal of Managed Care, 2019 (PubMed 31120719): a VHA outpatient cardiology clinic using e-consults within an active referral management process triaged about 60 percent of consults to e-consult and cut median wait from 24 to 13 days. https://www.hsrd.research.va.gov/research/citations/abstract.cfm?Identifier=155942 and https://pubmed.ncbi.nlm.nih.gov/31120719/

[36] VA News, "VA facilities now offer same-day care for urgent primary and mental health care needs," January 12, 2018. Source for: "In 2016, all of VA's medical centers offered same-day services," covering a clinician visit, nurse advice call, telehealth or video visit, specialist appointment, or same-day prescription. https://news.va.gov/44400/va-facilities-now-offer-day-care-urgent-primary-mental-health-care-needs/

[37] Department of Veterans Affairs, AI Use Case Inventory 2025, April 2026 update. Source for: VA-24-421, Patient Care Services Integration Platform, pilot, with history summaries from VistA/CPRS, Cerner, and outside records in PDF and estimated time to appointment in direct and community care; VA-25-2660, Community Care Records Retrieval, agentic AI, pre-deployment; and VA-25-817, CCN Provider Directory, 1.5 million-plus providers, predictive machine learning, pre-deployment. https://department.va.gov/ai/wp-content/uploads/sites/26/2026/04/VA-AI-Use-Case-Inventory-2025-Web-Compliance-Updates.xlsx

[38] S. 4744, Take Care of America's Veterans Act, 119th Congress. https://www.congress.gov/bill/119th-congress/senate-bill/4744/all-info

[39] Department of Veterans Affairs, Electronic Health Record Modernization, "VA deploys electronic health record system to hospitals in Cleveland, Anchorage," October 26, 2026. Source for: 13 hospitals live in 2026, 26 planned for 2027, and the January 2027 sites in Wisconsin and Michigan. https://digital.va.gov/ehr-modernization/news-releases/va-deploys-electronic-health-record-system-to-hospitals-in-cleveland-anchorage/

[40] VA Ann Arbor Healthcare System, "Electronic Health Record Modernization." Source for: "During our transition to the new Federal Electronic Health Record, fewer appointments may be available from March through May of 2026." https://www.va.gov/ann-arbor-health-care/programs/electronic-health-record-modernization-0/

[41] Congress.gov, H.R. 3482, Veterans Community Care Scheduling Improvement Act, 119th Congress. Source for: House passage under suspension of the rules by voice vote on May 19, 2026, and referral to the Senate Committee on Veterans' Affairs on May 20, 2026. https://www.congress.gov/bill/119th-congress/house-bill/3482/all-info

[42] Department of Veterans Affairs, "Plan Regarding Informing Veterans of Expected Wait Times for Appointments of Care," report to Congress under section 122 of Division U of the Joseph Maxwell Cleland and Robert Joseph Dole Memorial Veterans Benefits and Health Care Improvement Act of 2022, February 2025. Source for: the section 122(a) requirement to plan for informing veterans of expected days to care with VA and community providers and the section 122(b) implementation deadline of December 29, 2025 (p. 1); "appointment availability with community providers is reliant on extensive communication with numerous community providers" and "there is currently no immediate solution that provides Veterans with average wait times in the community" (p. 2); and EPS and a community care self-scheduling pilot as the planned routes (pp. 4-5). https://www.govinfo.gov/content/pkg/CMR-VA1-00199314/pdf/CMR-VA1-00199314.pdf

[43] Office of Rep. Jimmy Panetta, "Reps. Panetta, Franklin Introduce Bipartisan Bill to Improve Timely Access to Veteran Care," April 8, 2026. Source for: "GAO found VA medical centers are less likely to meet that standard for veterans referred to community providers than for care delivered inside the VA" and "the VA still has no clear benchmark for how long a veteran should wait to actually receive care after that appointment is scheduled." https://panetta.house.gov/media/press-releases/reps-panetta-franklin-introduce-bipartisan-bill-improve-timely-access-veteran

[44] USAspending.gov, award record for Department of Veterans Affairs BPA 36C10X26N0178 under IDIQ 36C10X25D0017, signed September 29, 2026, performance September 30, 2026 through September 29, 2031, solicitation 36C10X26R0052, SDVOSB set-aside, seven offers, Strategic Acquisition Center Frederick, with the quoted description including "($30M value may increase over time)"; and the six orders of September 30, 2026: 36C10X26N0209, 0211, 0212, 0213, and 0214 for VISNs 1 through 5 at $3,593,765.20 each and enterprise order 36C10X26N0204 at $1,396,886.80, $19,365,712.80 in all. That the VISN numbers are the five networks of VA's new structure is the author's read, supported by the integration of legacy VISN 3 into VISN 2 in October 2015 (VA OIG 21-00240-158, p. 5), by VA's VISN page, which now states the department "comprises 5 Veterans Integrated Service Networks," and by VA's EHR deployment schedule, which already uses the new numbering. https://api.usaspending.gov/api/v2/awards/CONT_AWD_36C10X26N0178_3600_36C10X25D0017_3600/ and https://department.va.gov/integrated-service-networks/ and https://digital.va.gov/ehr-modernization/ehr-deployment-schedule/

Sources verified as of October 26, 2026.
