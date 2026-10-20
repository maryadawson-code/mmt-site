---
title: "The Waiting Days"
date: 2026-10-13
slug: the-waiting-days
description: "Part 1 of a series on DHA's FY27 campaign plan, one line of effort at a time. DHA's FY27 campaign plan promises to cut the days service members lose to injury beyond normal healing time, and the first condition on its priority list is ACL surgery. Sgt. Wang Geun Lee lost ten months to a torn ACL, and about four of them came before his operation. This issue follows Line of Effort 1 through the new duration standard, the virtual care meant to shorten the wait, the evidence on both sides, and the fixes that would make the number mean what it says."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "Defense Health Agency"
  - "Military Health System"
  - "FY2027 Campaign Plan"
  - "Medical Readiness"
  - "Limited Duty"
  - "PARATUS"
  - "MEND"
  - "Virtual Health"
  - "Musculoskeletal Injury"
  - "Access to Care"
  - "Telehealth"
agencies:
  - "DHA"
  - "DoW"
  - "Army"
  - "Navy"
canonical_url: "https://missionmeetstech.com/newsletter/the-waiting-days/"
source: claude_newsletter_project
capture_corner_teaser: "This issue follows LOE 1 from the profile to the clock. Premium's Capture Corner reads the campaign plan's LOE 1 tasks as a buying schedule: what is due when, which office owns it, and which contracts sit underneath, with sourced action windows. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "Get in front of the VIPRR decision before December 31. The campaign plan makes DHA deliver acquisition options for VIPRR primary care capacity and a virtual health portfolio plan built on HL7 FHIR on the same day, and that is the first real virtual care acquisition decision in LOE 1. Bring capacity models and outcome measures, and leave platform features to the incumbent, because Amwell has already mapped its platform to every task on the list and named Sword Health as its orthopedic partner. The open lanes are FHIR interoperability, legacy program rationalization, and the six virtual health pilots due July 31, 2027."
  - "Read the PARATUS CSO for the profiling area of interest before it posts, and build a waiting-clock demonstration on the ACL pathway. HT003826SC004 lists IL5 hosting, an IL6 cross-domain solution, Unity Catalog-aligned governance, and FHIR R4, HL7 v2.5.1, SNOMED CT, ICD-10, and LOINC data contracts, with a data-conformance gate at Phase 2 of a live-demonstration evaluation. Map your data model to those standards, the six legacy exports (e-Profile, MEDPROS, MRRS, LIMDU SMART, ASIMS), and the private sector referral feeds due March 31, 2027. Then join synthetic referral, appointment, and surgery timestamps to a synthetic profile and show healing days and waiting days separately, because that answers the plan's own remediation example, first available surgery date acceptance, and no commercial duration product sells it today."
  - "Sell MEND support as calibration and analytics, not content. With 196 conditions identified and a January 31, 2027 deadline, DHA appears to be writing the standards itself on the Navy model, which cut average musculoskeletal limited duty from 141.97 to 101.39 days after its 2021 guide. The open work is benchmark comparison against MDGuidelines and ODG, monthly lost-warrior-day reporting, remediation tracking, quarterly assessments, and the provider scorecard due June 30, 2027. Track the two written signals of new money beside it: the AI scheduling and referral acquisition strategy due March 30, 2027, and the NIOSH-compliant boothless audiometer procurement due September 30, 2027."
---

![A service member in camouflage with a knee brace stands on crutches beside the doors of an operating room in a bright hospital corridor, while a red line on the floor runs past a row of empty waiting chairs to a physical therapy gym where a therapist works with a second service member on a step.](/images/newsletter/2026-10-13/cover-the-waiting-days.png)

# The Waiting Days

*Part 1 of a series on DHA's FY27 campaign plan, one line of effort at a time. DHA's FY27 campaign plan promises to cut the days service members lose to injury beyond normal healing time, and the first condition on its priority list is ACL surgery. Sgt. Wang Geun Lee lost ten months to a torn ACL, and about four of them came before his operation. This issue follows Line of Effort 1 through the new duration standard, the virtual care meant to shorten the wait, the evidence on both sides, and the fixes that would make the number mean what it says.*

Friends,

In September 2022, Sgt. Wang Geun Lee was deployed to Kuwait when he tore his left ACL getting out of a vehicle during training. The injury was bad enough that the Army medevacked him to Fort Cavazos, Texas, and then sent him to the Soldier Recovery Unit at Fort Belvoir, Virginia. Surgery came in January 2023. After it came ten weeks on crutches and about six months of intense physical therapy. [1]

"It took me ten months to get well," he told an Army writer in 2024. [1] Lee is a Reservist and a financial management specialist, and when he is not pulling reserve duty he is a full-time student at Virginia Tech.

Count his months and they split in two. About four passed between the injury and the operating room, and the other six belonged to the surgery and the recovery after it. Some of those first four were medicine, since a torn knee often needs time to settle before reconstruction. Some of them were the system. On a limited-duty profile, a month spent waiting for a surgeon and a month spent rebuilding a quadriceps look exactly the same.

Vice Adm. Darin Via's FY27 campaign plan, released October 1, goes after months like Lee's. It organizes the Defense Health Agency's year into four lines of effort, and this series takes them one at a time. The first, warfighter medical readiness, commits DHA by 2028 to reducing "90% of lost warrior days outside standard physiologic healing timelines," and it names the tools in the same breath: standard profile durations, and a platform called PARATUS to track them. [2] It sets active-duty access targets of one day for acute care, seven for routine care, and fifteen for a first specialty appointment, and it puts Rear Adm. Reginald S. Ewing III in charge. [2]

It is a good target, and with the access numbers it is the yardstick for this issue. I spent the week in the campaign plan, the profile data, the studies, and the last time the Department moved a readiness number this fast. The plan has seen the difference between Lee's two kinds of months. Whether it counts them separately is the question LOE 1 turns on.

## Ninety-one percent and 15.8 million days

By the measure the Department has used for years, the force is already ready. Total force medical readiness reached 91.1 percent in the last quarter of FY2025, above the 90 percent goal, and the budget credits fewer overdue health assessments and fewer deployment-limiting conditions. [3][4] One of those is medicine and the other is paperwork, and the percentage moves for both.

The days hide inside that percentage. In 2019, the most recent year the Army published, 188,876 active-duty soldiers spent time on a profile, and together they carried 15.8 million recommended limited-duty days. [5] Injuries drove almost two-thirds of those days, and the average injury profile ran 66 days. [5] Musculoskeletal injuries, the knees and backs and shoulders, accounted for nearly 60 percent of the Army's limited-duty days in 2019 analyses. [6]

Those are Army numbers. I could not find a public count of limited-duty days for the whole Department. The plan requires DHA to start reporting lost warrior days outside standard timelines every month by January 31, 2027, which would make it the first enterprise-wide count. [2]

One caution sits on top of every figure above. A profile is a recommendation, and the commander decides what the soldier actually does. [7] A financial management specialist like Lee can do much of his job on a bad knee, while the same profile takes an infantryman off the line. A lost warrior day counts the profile, and what was actually lost depends on the job. How long that profile runs depends, today, mostly on who writes it.

## Who writes the length

Each service writes profiles its own way: the Army on DA Form 3349 in e-Profile, the Navy and Marine Corps through medical boards and a system called LIMDU SMART, the Air Force and Space Force on AF Form 469. [8][9][10] Army temporary profiles can run up to 12 months. [8] Those are ceilings, and none of the services publishes a standard duration by condition. Inside them, length is the provider's call, and the calls vary: at the Eisenhower Army Medical Center emergency department in 2019, traumatic injury profiles averaged 48.9 days, back injuries 68.7, and neck injuries 85.3. [11]

The plan replaces that judgment with a standard it calls MEND, for Medical Evaluation and Normalization of Duration. MEND sets standard profile durations for the top musculoskeletal conditions, about 200 of them, and loads a first tranche of 196 into the services' readiness systems by January 31, 2027. Its target is 90 percent of profile lengths at or below the median for each condition. The initial priority pathways are ACL surgery, arthroscopic shoulder surgery, and spinal surgery. [2] Lee's injury is first on the list.

The standard will run on PARATUS, a single profiling and readiness platform DHA is buying through a Commercial Solutions Opening posted in July to replace six service-specific legacy systems. [12] The plan wants the first prototype award, for periodic health assessments, by October 31, automated private sector referral data flowing into the health record and PARATUS by March 31, 2027, and a profile action or readiness disposition on 95 percent of the deployment-limiting cases PARATUS flags. By June 30, 2027, each provider gets a scorecard comparing the orthopedic duty-limiting patients they see with the limited-duty status they assign. [2] That is a lot of measurement aimed at the healing clock. Lee's knee spent its first four months on the other one.

## The four months

A lost warrior day has two clocks running inside it. The healing clock belongs to biology: the weeks a ligament graft needs, the months a tendon takes. The waiting clock belongs to the system, the time from injury to the specialist and from the specialist to the operating room. A profile counts both, so a standard built from healing timelines will flag every waiting day as excess.

Lee's injury is one the military has studied closely. At Madigan Army Medical Center, researchers followed 165 active-duty patients who had ACL reconstruction between 2016 and 2022. Of those operated on within three months of injury, 80 percent returned to duty. At three to six months, it was 53 percent. [13] The average wait from injury to surgery across the whole group was 220 days. [13]

Lee's surgery came at about four months, which by the study's grouping puts him in the second group. He got well. Nearly half of the soldiers in that group did not make it back to duty.

The study shows an association, and it cannot prove the wait caused the gap, since the patients who waited may have differed in other ways. It does suggest that the cheapest lost warrior days to win back are the ones spent waiting, and the plan has noticed. Its MEND tasks call for remediation plans by March 31, 2027 for gaps in healing timelines, and the one example the plan gives is "first available surgery date acceptance." [2] The surgical wait itself gets measured somewhere else. Under LOE 2, hospitals begin reporting active-duty surgical wait time on a quarterly operating room dashboard starting June 30, 2027. [2] The two halves of Lee's ten months land in two lines of effort and two dashboards, and the monthly lost-warrior-day report counts them as one number.

Surgical capacity sits on that clock, and the FY27 budget is thin there. Congress added $4.5 million in FY26 for advanced orthopedic surgical training, which the justification ties to "musculoskeletal injuries common among servicemembers," and the FY27 request reverses it as a one-time item. [3] Reversing one-time money is routine budgeting, and I found no new FY27 line aimed at orthopedic surgical capacity to take its place.

Moves restart part of the clock. The plan wants care reestablished within three days of a permanent change of station, and on day zero for medically complex patients, with a baseline due December 31. [2] The TRICARE Operations Manual already keeps referrals valid across regions and requires help arranging care at the new location. [14] My read is that the gap after a move is compliance and measurement more than policy, and the December baseline will show how wide it is.

The access targets go after the first leg of the wait directly. TRICARE's standard for a first specialty visit is 28 days, and the plan sets 15 for active-duty members in mental health, orthopedics, and physical therapy, at every hospital. [15][2] The Department's February access report put the average first specialist visit at 18.0 days, and overseas the Inspector General found average urgent waits as long as 21.1 days, with 14 of 15 sampled hospitals consistently missing the standard. [16][17] Closing the distance from 18 days to 15 takes either more specialists or more reach for the ones already on staff.

## A specialist on a screen

The plan bets on reach. Its virtual health objective tells DHA to establish orthopedic virtual consultations for active-duty members in direct care "to increase access and reduce MSK injury wait times" by October 31, 2026. [2] That is eighteen days after this issue publishes. By the same date DHA owes a scheduling algorithm that pushes active-duty members to the front for in-person or virtual specialty care in mental health and musculoskeletal lines.

By December 31, DHA owes acquisition options to grow primary care capacity in VIPRR, its virtual readiness and remote care program, and a plan that folds its legacy virtual health programs into one portfolio. The campaign plan targets a 5 percent increase in primary care appointments done virtually, a 10 percent rise in use of the nurse advice line and VIPRR, and a 10 percent drop in private sector urgent care visits. [2]

Distance is the reason. A soldier hurt in Kuwait, Guam, or a remote Alaska post is a long way from an orthopedic surgeon, and every referral that requires travel adds days before anyone with the right training looks at the injury. Navy Medicine showed the alternative back in 2017, when Naval Medical Center San Diego ran the service's first tele-orthopedic consult with a patient in Guam. [18] The consult crossed the Pacific, and the patient never left the island.

DHA has already watched video collapse a wait. Its Virtual Medical Center runs BRAVE, a virtual mental health program embedded at 84 locations across the U.S., Europe, and the Indo-Pacific that has delivered about 60,000 therapy sessions. At Misawa, Japan, the wait for a first appointment fell from 32 days to five. [19] Behavioral health profiles carried 10.2 percent of the Army's 2019 limited-duty days, at an average of 87 days each, so a faster first appointment in mental health goes after a real share of the count. [5]

The platform underneath is already carrying volume. Amwell, the telehealth company DHA said in June it intends to contract with directly, reports about 400,000 virtual visits a year on its platform in the DHA environment, against about 124,000 in the legacy environment, with a 98 percent technical success rate and satisfaction of 92 percent among providers and 91 percent among patients. [20][21] VIPRR already runs its scheduled virtual visits on that platform, by the company's account. [20] The figures come from an Amwell white paper on the FY27 virtual health effort, and DHA has not published an independent set.

The musculoskeletal evidence is thinner. DHA's virtual physical therapy pilot runs at five sites from Bahrain to Puerto Rico, and Martin Army Community Hospital joined in December 2025 as the first Army site, aiming it at service members with mild to moderate musculoskeletal pain who struggle to get to the clinic. [22][23] DHA's pilot page credits it with "significantly reduced patient wait times for care and loss duty days" and publishes no figures behind the claim. The pilot now runs on a sole-source extension through March 29, 2027. [22] Not every consult needs video, either. Clinician-to-clinician eConsults, where a primary care provider sends the question and a specialist answers in writing, avoided an in-person specialist visit 64 percent of the time in one Canadian service. [24]

The money is in the request. The FY27 budget adds $200.4 million for DHA digital health, including expanded video visits, Tele-Critical Care, and ambient listening. [3] My read is that telehealth is the fastest lever DHA has on the 15-day target, because it adds specialist reach without waiting years to train more specialists.

Telehealth has limits worth naming. It shortens the leg from injury to an expert opinion, and it can carry much of the rehabilitation that follows. It cannot reconstruct a ligament. The leg from specialist to operating room still runs on surgeons and operating room time, and the numbers that would settle the question, waiting days saved per injured service member, sit in DHA's own data, unpublished.

Getting seen faster is the easy argument. The healing clock is harder, because a standard there can shorten recoveries or rush them, and the military has evidence for both.

## Forty days a case

Navy Medicine has already run a version of MEND. Naval Medical Forces Atlantic adopted a condition-based limited-duty duration guide in 2021, and average limited duty for musculoskeletal cases fell from about 142 days in FY21 to about 101 in FY22. [25] That is roughly forty days per case. The study has limits: FY22 was a partial year, FY21 may carry pandemic effects, only return-to-duty cases counted, and low back and shoulder pain kept running past the guide. [25] Discount the result for all of that and the direction still holds.

Workers' compensation has run on standard durations for decades, and the research attaches a condition. [26][27] A review by Canada's Institute for Work & Health found strong evidence for return-to-work programs that combine health care, case coordination, and changes to the work itself, and "limited or no effect" from programs that work on one of those alone. [28]

The Army has a working example of the combination. Soldiers in brigades with embedded H2F performance teams, the strength coaches, physical therapists, and athletic trainers pushed down to the brigade, spent 5.9 percent less time on limited duty after a musculoskeletal injury, across 1,420,195 injuries from FY2018 through FY2025. [29] Lee had his own version. He credited the recovery unit at Belvoir with making his appointments and with staff who "follow through with the intent of helping me return to duty." [1] The research on reinjury shows what happens when a recovery gets cut short.

## Weeks ten and eleven

Reinjury keeps its own schedule. In a 2025 study of soldiers after knee surgery, the risk of a new injury peaked about 10 to 11 weeks out, roughly when activity restrictions were lifted, and 71 percent had a new musculoskeletal injury within four years. The authors recommended a standard 12-month follow-up. [30] A standard that pushes profiles shorter pushes them toward that window.

Then there are the soldiers the count never sees. In a survey of 1,388 soldiers in one infantry brigade combat team, 49 percent of injuries had gone unreported, and the top reasons were fear for careers and avoiding profiles. [31] A soldier who never gets a profile never becomes a lost warrior day. A metric that punishes long profiles could give every injured soldier one more reason to keep quiet.

The provider scorecard puts the pressure at the pen. Audit and feedback does work, modestly: a Cochrane review found it improves clinical practice by a median of 4.3 percentage points. [32] Pressure on a number can also bend the number. At the Phoenix VA in 2014, 30 of the 79 staff interviewed about scheduling said they had used the wrong desired date, which made waits show up as zero days. [33]

The plan also sets three different targets for the same days. The North Star cuts 90 percent of lost warrior days outside standard timelines. The next sentence drives days above benchmark "to zero." MEND wants 90 percent of profiles at or below the median. [2] A median splits a set of cases in half, so holding 90 percent of profiles at or below one means military profiles have to run well short of the typical case the standard was built from. The cases that will not fit are the complicated ones and the ones that waited. The last time the Department put a hard number on deployability, the number moved fast.

## The last time the number moved

In February 2018 the Department announced its "deploy or get out" policy, and DoD Instruction 1332.45 made 12 consecutive months of nondeployability the trigger for retention review. [34][35] About 235,000 service members, roughly 11 percent of the force, were nondeployable when it started. By March 2019 the rate was about 5.4 percent. [36] Almost half of the original 235,000 had been nondeployable because of a missing exam or missing paperwork, an approaching retirement, or a pregnancy, and the services rewrote how they classified and reported the rest. [36] The Air Force cut its rate from 6.8 to 4.6 percent without discharging anyone under the policy, in part by refining which conditions truly kept airmen from deploying. [37]

The rate fell by half in about a year. The published record credits paperwork, tighter definitions, and about 21,000 separations. Faster healing is not on the list, and the 2018 record is the clearest account of how a readiness number improves through counting before it improves through care.

## Fixes that keep the number honest

The cheapest fix is a reporting change: split the clock in the monthly report due January 31. Each lost warrior day can carry its category, injury to first specialty visit, specialty visit to surgery, surgery to return, and the administrative days a healed service member spends waiting for the profile to close. Joining LOE 2's surgical wait data to LOE 1's count would put both halves of Lee's months in one report, where waiting days point at access, healing days at clinical care, and administrative days at paperwork. The ACL study supplies a first measure for the first priority pathway, the share of reconstructions done within 90 days of injury. [13]

The standard should set the expected end date, and function should decide the exit. MEND can publish expected durations with best, typical, and maximum ranges, the way the civilian benchmarks do, calibrated against the Navy guide's results. [26][27][25] A clinical exception code that does not count against the provider scorecard would protect the complicated cases the median leaves out.

Every duration measure needs a reinjury measure beside it. A 12-month re-profile rate for the same body region, the follow-up interval the knee surgery study recommends, would show whether shorter profiles are holding. [30] Random audits of closed profiles and a regular anonymous injury survey would catch the two ways a metric can improve while no one heals any faster: paperwork and silence. [31][33]

The first leg of the wait can get shorter with tools the system already owns. Madigan lets soldiers see a physical therapist through same-day sick call, skipping a specialty referral that can take up to 28 days, and reported less long-term disability and fewer permanent profiles. [38][39] The October 31 orthopedic virtual consults should publish their waits from the first month, the virtual physical therapy pilot should publish its results before the extension ends, and an eConsult should be the default first step for a musculoskeletal referral. Britain's Further Faster campaign for armed forces personnel cut median trauma and orthopedic waits from 13.9 to 9.7 weeks in six months across 20 hospital trusts. [40]

Prevention shrinks the count before any clock starts. The plan targets a 5 to 10 percent reduction in musculoskeletal injury risk and wants injury cause coding raised from 10 percent of new injury encounters to 50 percent within a year. [2] More than 86 percent of active-duty soldiers' musculoskeletal injuries in 2021 were cumulative microtrauma, and overuse injuries carried a cause code less than 2 percent of the time from 2016 through 2019. [41][42] Prevention aimed at injuries that go uncoded is aimed blind, so the 50 percent target is the right place to start.

## What to watch

October 31 is the first test. The orthopedic virtual consults, the active-duty scheduling algorithm, and the PARATUS prototype award for health assessments are all due that day. [2] December 31 brings the VIPRR capacity decision, the virtual health transformation plan, and the baseline for reestablishing care after a move. January 31 brings MEND's first 196 standards and the first monthly count of lost warrior days. March 29 ends the virtual physical therapy extension. [22] June 30 brings the provider scorecard and the first quarterly operating room dashboards with active-duty surgical wait time. [2]

The FY28 budget request, the first written after the campaign plan, will show whether surgical capacity and virtual care get money to match the targets. Friday's issue takes the second line of effort, medical warrior currency, and the hospitals it runs through.

## Back to Lee

Lee's injury is first on MEND's list, and his ten months are exactly what LOE 1 will count. About four came before the surgery and about six after it, and the profile records them as one number.

The campaign plan promises to cut the days that run past standard healing time. For the next soldier who tears a knee getting out of a vehicle, the place to start is the four months before the operating room. The first specialist in that stretch can be on a screen.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue follows LOE 1 from the profile to the clock. Premium's Capture Corner and monthly Capture Intelligence Sheets track the contracts and budget lines underneath it, with sourced action windows.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] U.S. Army, MaryTherese Griffin, "Injured Army Reservist excited about his recovery and the road ahead," April 3, 2024. Source for: Sgt. Wang Geun Lee's September 2022 knee injury in Kuwait, January 2023 ACL surgery, ten weeks on crutches, about six months of physical therapy, the ten-month quotation, his role, and the Fort Belvoir Soldier Recovery Unit. https://www.army.mil/article/275079/injured_army_reservist_excited_about_his_recovery_and_the_road_ahead

[2] Defense Health Agency, FY27 campaign plan, including "Delivering Warfighter Readiness, Fiscal Year 2027," October 2026. Source for: the LOE 1 North Star, its 2028 date, and its lead; MEND standard profile durations for about 200 musculoskeletal conditions, the first tranche of 196, the 90 percent at-or-below-median target, and the ACL, shoulder, and spine priority pathways; monthly lost-warrior-day reporting by January 31, 2027; remediation plans citing first available surgery date acceptance by March 31, 2027; the provider scorecard by June 30, 2027; PARATUS milestones and the 95 percent disposition target; days above benchmark to zero; the active-duty access targets of 1, 7, and 15 days for mental health, orthopedics, and physical therapy; the virtual health tasks and targets; the PCS reestablishment targets and baseline; the 5 to 10 percent MSK risk reduction and the 50 percent cause coding target; and operating room dashboard reporting of active-duty surgical wait time.

[3] Department of War, Office of the Under Secretary of War (Comptroller), "Military Health System, Fiscal Year 2027 Budget Estimates, Volume 1, Combat and Operational Medicine Program (0130D) and Private Sector Care Program (0146D)," April 2026. Source for: total force medical readiness of 91.1 percent in Q4 FY2025 and the drivers cited (p. 8); the $200.4 million DHA digital health increase for ambient listening, video visits, and Tele-Critical Care; and reversal of the one-time FY2026 $4.5 million congressional increase for advanced orthopedic surgical training and its stated rationale (OP-5 exhibit). https://comptroller.war.gov/Portals/45/Documents/defbudget/FY2027/budget_justification/pdfs/09_Military_Health_System/MHS_PB27_J-Book-Vol1-COMP_PSCP.pdf

[4] Department of Defense Instruction 6025.19, "Individual Medical Readiness Program." Source for: the 90 percent total force medical readiness goal and the classification of temporary nondeployable conditions as not medically ready. https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/602519p.PDF

[5] U.S. Army Public Health Center, "2020 Health of the Force." Source for: 188,876 active-duty soldiers on profile and 15,818,852 recommended limited-duty days in 2019, the 64.2 percent injury share, the 66-day average injury profile, and behavioral health profiles at 10.2 percent of days with an 87-day average. https://ph.health.mil/PHC%20Resource%20Library/2020-hof-report.pdf

[6] Military Medicine, 2020, vol. 185, issue 9-10, e1461. Source for: musculoskeletal injuries accounting for about 59 percent of Army limited-duty days and 65 percent of medically nondeployable soldiers in 2019 analyses. https://academic.oup.com/milmed/article/185/9-10/e1461/5805225

[7] DVIDS, Army Public Health Center, "Properly interpreting Soldier e-Profile data can help leaders better assess Soldier recovery time recommendations," October 2021. Source for: profiles as recommendations and the commander's role in deciding duties. https://www.dvidshub.net/news/408117/properly-interpreting-soldier-e-profile-data-can-help-leaders-better-assess-soldier-recovery-time-recommendations

[8] U.S. Army Inspector General, "IG Update 25-4: Profiles." Source for: DA Form 3349 in e-Profile, temporary profiles of up to 12 months, and monthly commander review of temporary profiles of 180 days or more. https://ig.army.mil/Portals/101/Documents/IG%20UPDATES/IG%20Update%2025-4_Profile_HIPAA.pdf

[9] MyNavy HR, "Enlisted Limited Duty." Source for: temporary limited duty through medical boards and review of extended limited duty by Navy Personnel Command. https://www.mynavyhr.navy.mil/Career-Management/Detailing/Deployability/Enlisted-Limited-Duty/

[10] Department of the Air Force Manual 48-123, "Medical Examinations and Standards." Source for: AF Form 469, provider-prescribed duty limitations, and resolution of provider-commander disagreements by MTF medical leadership. https://static.e-publishing.af.mil/production/1/af_sg/publication/dafman48-123/dafman48-123.pdf

[11] Military Medicine, 2021, vol. 186, issue 5-6, p. 565. Source for: traumatic injury profile durations at the Eisenhower Army Medical Center emergency department in 2019, including the 48.9-day mean, 32-day median, and back and neck averages. https://academic.oup.com/milmed/article/186/5-6/565/6054785

[12] HigherGov listing of SAM.gov Commercial Solutions Opening HT003826SC004, "Profiling Action and Readiness Tracking Unified System (PARATUS)," posted July 20, 2026. Source for: the CSO, its replacement of six service-specific legacy systems, and its areas of interest. https://www.highergov.com/contract-opportunity/profiling-action-and-readiness-tracking-unified-sy-ht003826sc004-s-1c1bb/

[13] Military Medicine, 2025, vol. 190, issue 3-4, e675. Source for: return to duty of 80 percent for ACL reconstruction within three months of injury versus 53 percent at three to six months, among 165 active-duty patients, and the 220-day mean time to surgery. https://academic.oup.com/milmed/article/190/3-4/e675/7750429

[14] TRICARE Operations Manual, Chapter 7, Section 5, paragraph 4.9 (change dated July 29, 2025). Source for: referral validity across regions, the bar on requiring a new referral, contractor assistance arranging care at the new location, and virtual urgent care during a move. https://manuals.health.mil/pages/DisplayManualHtmlFile/2025-07-29/ChangeOnly/tot5/c7s5.html

[15] TRICARE, "TRICARE Access to Care Standards." Source for: the 28-day specialty care standard and the urgent and routine standards. https://tricare.mil/GettingCare/TRICARE-Access-to-Care-Standards

[16] Department of War, "Assessing Access to Health Care Standards," report to Congress, February 27, 2026. Source for: the 18.0-day average for an initial specialist visit and the 9.7-day routine primary care average. https://www.health.mil/Reference-Center/Reports/2026/02/27/Assessing-Access-to-Health-Care-Standards

[17] Department of War Office of Inspector General, "Audit of the Defense Health Agency's Management of Military Medical Treatment Facility Access to Care," DODIG-2026-025, December 8, 2025. Source for: average urgent appointment waits of 1.2 to 21.1 days at 15 sampled OCONUS parent MTFs and 14 of 15 consistently missing the standard. https://www.oversight.gov/sites/default/files/documents/reports/2025-12/DODIG-2026-025_Redacted%20SECURE.pdf

[18] DVIDS, "Virtual first for orthopedics in Navy Medicine," 2017. Source for: Navy Medicine's first tele-orthopedic consult from Naval Medical Center San Diego to a patient in Guam. https://www.dvidshub.net/news/246552/virtual-first-orthopedics-navy-medicine

[19] Defense Health Agency, "BRAVE virtual mental health helps all service members get therapy," August 4, 2025. Source for: BRAVE administered by the DHA Virtual Medical Center, 84 locations, about 60,000 sessions, and the Misawa first-appointment wait falling from 32 days to five. https://www.dha.mil/News/2025/08/04/15/40/BRAVE-virtual-mental-health-helps-all-service-members-get-therapy

[20] Amwell, "Accelerating the FY27 DHA Virtual Health Campaign," white paper, October 2026. Source for: company-reported figures of about 400,000 annual virtual visits versus about 124,000 in the legacy environment, a 98 percent technical success rate, 92 percent provider and 91 percent patient satisfaction, and VIPRR's use of My Military Health scheduled virtual visits. Vendor-reported; not independently verified.

[21] Defense Health Agency, notice of intent to sole source to MHS GENESIS solution providers, HT003826CEXXX1, June 2026. Source for: DHA's stated intent to contract directly with Amwell for telehealth. https://sam.gov/workspace/contract/opp/947fe670c6184824a5def4e406548a8c/view

[22] Abierto listing of DHA notice HT001125NOCAE007, sole-source extension of the virtual physical therapy pilot, September 30, 2026 through March 29, 2027, and Defense Health Agency, "Virtual Physical Therapy Pilot." Source for: the extension dates, the five pilot sites, and DHA's statement of reduced wait times and lost duty days without published figures. https://abierto.us/opportunities/ht001125nocae007 and https://dha.mil/Offices-and-Programs/Virtual-Physical-Therapy-Pilot

[23] DVIDS, "Martin Army launches virtual physical therapy pilot to keep Soldiers mission ready," December 2025. Source for: Martin Army Community Hospital as the first Army MTF in the pilot and its focus on mild to moderate musculoskeletal pain. https://www.dvidshub.net/news/554830/martin-army-launches-virtual-physical-therapy-pilot-keep-soldiers-mission-ready

[24] Champlain BASE eConsult service, program report. Source for: eConsults avoiding an in-person specialist visit 64 percent of the time. https://www.champlainbaseeconsult.com/_files/ugd/ac5147_107fd7825fd34145bbe38448c02f2ebf.pdf

[25] Military Medicine, 2024, vol. 189, issue 7-8, e1683. Source for: average musculoskeletal limited duty falling from 141.97 days in FY21 to 101.39 days in FY22 after the 2021 condition-based LIMDU duration guide, the study's scope limits, and low back and shoulder pain exceeding the guide. https://academic.oup.com/milmed/article/189/7-8/e1683/7603516

[26] MDGuidelines, "Duration Benchmarks Methodology." Source for: the Physiological Benchmark as the healing time for uncomplicated cases. https://www.mdguidelines.com/wp-content/uploads/MDG_Articles/MDG_WhitePapers/Duration-Benchmarks-Methodology-0321-v4.pdf

[27] MCG, "ODG Return-to-Work Guidelines." Source for: return-to-work durations built from more than 10 million lost-time cases. https://www.mcg.com/odg/solutions/workers-comp/return-to-work-guidelines-modeling/

[28] Institute for Work & Health, "Effective workplace return-to-work interventions are multi-faceted," At Work, issue 87. Source for: strong evidence for multi-component return-to-work programs and limited or no effect from single-area programs. https://www.iwh.on.ca/newsletters/at-work/87/effective-workplace-return-to-work-interventions-are-multi-faceted-iwh-review

[29] Murray et al., JAMA Network Open, 2026, summarized at https://pofolia.com/article/56382?lang=en, and Army Times, "Army's H2F program linked to faster injury recovery among soldiers, study finds," September 18, 2026. Source for: 5.9 percent fewer limited-duty workdays after musculoskeletal injury in brigades with H2F teams, across 1,420,195 injuries from FY2018 through FY2025. https://www.armytimes.com/news/your-military/2026/09/18/armys-h2f-program-linked-to-faster-injury-recovery-among-soldiers-study-finds/

[30] Adams et al., Sports Medicine - Open, 2025. Source for: injury hazard peaking about 10 to 11 weeks after knee surgery, 71 percent with a new musculoskeletal injury within four years, and the recommended 12-month follow-up. https://pmc.ncbi.nlm.nih.gov/articles/PMC12647509/

[31] Sports Health, 2016, PMC5089359. Source for: 49 percent of injuries unreported among 1,388 soldiers in one infantry brigade combat team, and the reasons given. https://pmc.ncbi.nlm.nih.gov/articles/PMC5089359/

[32] Ivers et al., "Audit and feedback: effects on professional practice and healthcare outcomes," Cochrane Database of Systematic Reviews, 2012. Source for: a median 4.3 percent absolute improvement in practice. https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD000259.pub3/full

[33] Department of Veterans Affairs Office of Inspector General, "Review of Alleged Patient Deaths, Patient Wait Times, and Scheduling Practices at the Phoenix VA Health Care System," 14-02603-267, August 2014. Source for: 30 of 79 staff interviewed reporting use of incorrect desired dates. https://www.vaoig.gov/sites/default/files/reports/2014-08/VAOIG-14-02603-267.pdf

[34] Military Times, "DoD releases new 'deploy or get out' policy," February 14, 2018. Source for: the February 2018 policy. https://www.militarytimes.com/news/your-military/2018/02/14/dod-releases-new-deploy-or-get-out-policy/

[35] Department of Defense Instruction 1332.45, "Retention Determinations for Non-Deployable Service Members." Source for: retention review for members nondeployable for more than 12 consecutive months. https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/133245p.pdf

[36] Military Times, "About 21,000 booted so far under 'deploy or get out' policy," March 14, 2019. Source for: about 235,000 nondeployable at the start, the drop to about 5.4 percent, about 21,000 separations, the composition of the original population, and revamped classification and reporting. https://www.militarytimes.com/news/pentagon-congress/2019/03/14/about-21000-booted-so-far-under-deploy-or-get-out-policy/

[37] Air Force Times, "Non-deployability rates drop in Air Force without kicking anyone out," August 14, 2019. Source for: the Air Force's drop from 6.8 to 4.6 percent without separations. https://www.airforcetimes.com/news/your-air-force/2019/08/14/non-deployability-rates-drop-in-air-force-without-kicking-anyone-out/

[38] U.S. Army, "Fast-tracking physical therapy can save time, money and pain." Source for: Madigan's same-day physical therapy sick call, the specialty referral of up to 28 days it bypasses, and reported reductions in long-term disability and permanent profiles. https://www.army.mil/article/248234/fast_tracking_physical_therapy_can_save_time_money_and_pain

[39] Defense Health Agency, "Improving Military Readiness through Physical Therapists Serving in Primary Care Roles," report, January 2, 2024. Source for: the Joint Base Lewis-McChord initiative beginning May 2018, its screening algorithm, and 90 to 120 minutes a day of physical therapy sick call. https://www.health.mil/Reference-Center/Reports/2024/01/02/Improving-Military-Readiness-through-Physical-Therapists-Serving-in-Primary-Care-Roles

[40] GIRFT and NHS England, "British forces waiting times reduced by a month thanks to targeted GIRFT campaign," October 2026. Source for: the Further Faster Armed Forces campaign with 20 trusts and median orthopedic waits falling from 13.9 to 9.7 weeks in six months. https://gettingitrightfirsttime.co.uk/british-forces-waiting-times-reduced-by-a-month-thanks-to-targeted-girft-campaign/

[41] Military Review, "The Musculoskeletal Imperative," September-October 2024. Source for: more than 500,000 musculoskeletal injuries among active-duty soldiers in 2021, 86 percent cumulative microtrauma. https://www.armyupress.army.mil/Journals/Military-Review/English-Edition-Archives/SO-24/SO-24-Musculoskeletal-Imperative/

[42] Medical Surveillance Monthly Report, "Injury Cause Coding," February 1, 2025. Source for: 10.0 percent of 5.97 million injury encounters from 2016 through 2019 carrying a cause code, and overuse injuries coded less than 2 percent of the time. https://health.mil/News/Articles/2025/02/01/MSMR-Injury-Cause-Coding

Sources verified as of October 9, 2026.
