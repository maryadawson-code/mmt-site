---
title: "The Floor at Winston-Salem"
date: 2026-09-29
slug: the-floor-at-winston-salem
description: "In May 2012 VA's Inspector General walked the sixth floor of the Winston-Salem regional office and found 37,000 veterans' claims folders stacked on top of the file cabinets, the floor bowing under them. That fiscal year the average claim took 378 days. Last Tuesday VA reported three million claims completed this year at an average of about 76. The folder on that floor and the number in that release are the same object thirteen years apart, and what happened in between was built from parts any agency can buy, in an order the Department of War, Social Security, and the military disability system can copy."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "VA"
  - "VBA"
  - "disability claims"
  - "claims backlog"
  - "automation"
  - "AI"
  - "Automated Decision Support"
  - "claims intake"
  - "National Work Queue"
  - "FY2027 budget"
  - "Inspector General"
agencies:
  - "VA"
  - "DoW"
canonical_url: "https://missionmeetstech.com/newsletter/the-floor-at-winston-salem/"
source: claude_newsletter_project
capture_corner_teaser: "This issue follows the folder from a bowing floor to a 76-day average. The companion Capture Corner works the money and the records underneath it: the $130 million the FY2027 budget proposes for VBA automation and AI and the $47.8 million enterprise line it sits beside, the $425.5 million intake requirement, the AI claims-evaluation pilot whose award record ends October 2, the Deloitte intake task order with a March 2027 end date, the unresolved question of who holds the ADS development work today, and the five acceptance criteria a team needs to clear before VBA will let a tool near a rater. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "The AI claims-evaluation pilot, contract 36C10X25P0051 to SteerBridge, is fully funded at just under $5 million and its award record ends October 2 with no next phase announced. Watch USAspending after that date for a modification, a new order to the same vendor, or silence. Each one tells you something different about whether a production buy is coming."
  - "Nobody in the public record holds ADS development today. The Agile Six lead that circulates ended in April 2025 and covered adjacent applications, not the engine. Put a written inquiry to VBA's Office of Business Integration now asking for the current ADS contract numbers and acquisition office, because that answer closes the biggest gap in this brief."
  - "VA has already written down what it will accept: summaries that link to their source page, accuracy scored separately for automated work, a named human who makes the final decision, a defined exception queue with an owner, and accuracy reported by diagnostic code. Build those five artifacts before a solicitation shows up. The Inspector General and the privacy office have told you what the evaluators will ask for."
---

![A stone federal building service window with an eagle crest passes digital claim pages and x-ray images through the air into an open navy file box holding tabbed folders for military, federal, medical, home, and wearable health records.](/images/newsletter/2026-09-29/cover-the-floor-at-winston-salem.png)

# The Floor at Winston-Salem

*In May 2012 VA's Inspector General walked the sixth floor of the Winston-Salem regional office and found 37,000 veterans' claims folders stacked on top of the file cabinets, the floor bowing under them. That fiscal year the average claim took 378 days. Last Tuesday VA reported three million claims completed this year at an average of about 76. The folder on that floor and the number in that release are the same object thirteen years apart, and what happened in between was built from parts any agency can buy, in an order the Department of War, Social Security, and the military disability system can copy.*

Friends,

The cabinets on the sixth floor were pushed so close together that the drawers would not open all the way, so the folders went on top. By May 2012 there were about 37,000 of them up there, two feet high and two rows deep, with more in boxes on the floor and more along the walls, and the Inspector General's team walking the Winston-Salem regional office noticed that the tops of the cabinets no longer sat level. The floor underneath was bowing. [1] The year before, a stack had come down on an employee and hurt his shoulder. [1] On June 13 the General Services Administration finished a load study and told VA the answer: the sixth floor was carrying 164 pounds per square foot, and it was rated for 125. [1] The report's phrase for it was that the paper appeared to have the potential to compromise the integrity of the building. [2]

Every folder up there was a veteran waiting. The office served 770,000 veterans with 680 people, and a claim in 2012 was a thing that could be in exactly one place. [2] If it was on the sixth floor in Winston-Salem it was not on a rater's desk, and if a rater needed it, someone climbed for it. At the end of that fiscal year the average claim took 378 days from filing to decision. [3] That is where this issue starts, because the number VA published last Tuesday is the same folder, thirteen years on.

On September 22 VA said it had completed more than three million disability claims in fiscal 2026 as of September 18, at an average of 75.6 days to a decision, against 141.5 days on January 20, 2025, with the count of claims older than 125 days down more than 70 percent over the same span. [4] I searched the release for the words automation, digitize, and decision support. None of them is in it. The how is in three other documents, the FY2027 budget book, an April House statement, and a July one, and read together they describe a sequence. [9][10][17] The sequence is the useful part, and it began with a promise made the spring after the floor study.

## The promise

In March 2013 Allison Hickey, then Under Secretary for Benefits, told the Senate Veterans' Affairs Committee that VA would complete every claim in 125 days at 98 percent accuracy and eliminate the backlog in 2015, and that the way there was to stop the folder from being paper. [5] VA's chief information officer had said the same thing the previous August, on the day the Winston-Salem report came out: paperless processing in every regional office by the following year. [6]

Both numbers are still on VA's books. The 125 days became the definition of a backlogged claim, the line VBA measures itself against every Monday. [7] The 98 became 96 after 2015. [8] One promise was about speed and the other about being right, and they have had different lives.

## The folder that is everywhere

The backlog did not end in 2015. It came down, and then the PACT Act arrived in August 2022 with a generation of toxic-exposure claims behind it. VA projected the backlog would peak near 600,000 in March 2024. It peaked in January 2024 at about 400,000, and the VFW, which held power of attorney for more than 700,000 veterans and dependents at the end of FY2025, wrote in April that VA beat its own projection by raising rating output and automating the back end while keeping the non-PACT claims moving, which was the lesson of 2013. [3]

Ryan Gallucci, who runs the VFW's Washington office, made a diagnosis in that statement that explains where the remaining days live. Today's bottlenecks, he wrote, are almost exclusive to development, meaning evidence and exams, because the steps VA controls directly, intake, rating, and award, are already automated or take days. [3] The folder that could only be in one place is now in every place at once, and the wait that is left is the wait for something to arrive in it.

VA has measured where that wait sits. In its September 2025 baseline a claim spent about 13 days waiting to be assigned, 14.5 days in initial development, 49.9 days in active development, and 5.2 days in decision. [9] Five days to decide. Fifty to gather. Every dollar that moved the average was spent upstream of the rater, and it was spent in an order.

## The mail

The first thing VA fixed was the thing that bowed the floor. The Veterans Claims Intake Program centralizes inbound paper, turns it into more than 55.5 million images a month, automates 80 percent or more of incoming compensation and pension mail, and gets a document in front of a processor in 2.1 hours on average. [9] Robert Orifici of the Veterans Benefits Administration told a House subcommittee in July that VA has digitized more than 1.2 billion claim documents, and separately that a search tool inside the Veterans Benefits Management System now finds evidence inside each electronic folder. [10] He described those as two things, and they are: first the paper became images, then the images became searchable, and only after that could anything automated read them.

The VFW dates the end of the 2013 backlog to exactly this, the introduction of electronic tools to digitize the claims process. [3] None of it is artificial intelligence. A summarizer pointed at a scanned fax is a summarizer pointed at nothing, and once the folder was images and the images were searchable, VA could build something that reads them.

## The reading

Automated Decision Support pulls federal records, writes what VA calls an Automated Review Summary Document, and orders or drafts the examinations a claim needs, before a human opens the file. [9][11] Orifici's description of its job was to help processors obtain, review, and synthesize evidence. [10] It covered 26 diagnostic codes when it started. It covers 202 now, it touched more than 540,000 compensation claims in 2025, and by September 2025 it was running on half of all compensation claims in the inventory. [9]

VA reports two results from it. Claims worked with the tool close about 33 days faster than claims worked without it, and in quality review they scored 96.4 percent against 95.5 percent for traditional claims. [9] Both figures are VA's own, both are observational, and neither comes with a published method for matching case complexity, so the 33 days is a VA number and not a promise anyone else should make. The second number has a history worth more than its value. VA scores automated claims separately because its Inspector General told it to. The first automation project ran on hypertension claims, the Inspector General sampled 60 of them in 2023 and found 16 wrong, and the recommendation was that VBA compare automated work against traditional work side by side. [12] The separate scorecard is what VBA built in answer, and it is the most portable thing in this story: a quality number for the machine's work, reported apart from the average, because the first attempt failed and someone wrote it down.

More than 43 percent of compensation claims now need a Toxic Exposure Risk Activity memo under the PACT Act, and VA has started auto-populating those memos from verified data with links back to the source documents, which it says cuts the time to produce one by up to 40 percent. [10][9] The link is the part that matters. A rater can click the summary and land on the page it came from.

At the end of the reading there is still a person. Orifici's statement to the House is the sentence to keep: a trained claims processor makes the final decision on every disability compensation claim, and automation and AI do not. [10] He scoped it to compensation, and so do I, because in April the Inspector General found that survivor benefit decisions in a separate program had been automated with no human involved, with legal errors in about 2 percent of cases and $2.7 million in improper payments. [13] Compensation kept the human because a neighboring program showed what happens without one.

The next tool in line is already in a pilot. VA's privacy assessment for what it calls the Artificial Intelligence Claims Evaluation System describes software that reads completed disability benefit questionnaires, uploads them to VBMS, and sends anything it cannot accurately extract and validate to a person. [14] The award record behind it is a proof-of-concept contract worth just under $5 million that ends October 2, this Friday, with no next step announced. [15] Same rule as the layer above it. The machine reads, the machine sends what it cannot read to a human, and the human signs. What no machine inside VA can do is make a record arrive that VA does not own.

## What it is built from

In April 2024 the acting director of VBA's Automated Benefits Delivery office, Molly Gatti, briefed the stack to the USSOCOM Warrior Care Program, and the slide that lists the parts is the most useful page in this story because there is nothing on it a program office cannot buy: robotic process automation, optical character recognition and intelligent form recognition, natural language processing models, medical annotators and summarizers, a rules engine, process management, and reporting and analytics. [26]

Each part does one job. Digital workers, the RPA layer, establish claims around the clock, so that more than 70 percent of claims are set up within 24 hours of the mail arriving, and they add priority flashes for veterans in high-risk circumstances without anyone asking; by the spring of 2024 they had handled more than 10 million packets. [26] The OCR and form-recognition layer was trained on the ways a medical condition gets described, and it reads handwriting as well as type. [26] The annotators and summarizers search everything extracted for diagnosis, symptoms, and treatment tied to the rating criteria in Title 38, and lay the results out in the review summary by relevance and recency. [26] And the rules engine holds the gates: a claim goes through automation only if the veteran was not previously denied for that code, the discharge was not dishonorable, the service treatment records are in the folder, the profile is not sensitive, and nothing in it belongs in a specialized queue such as ALS or military sexual trauma. Anything that fails a gate goes to a person. [26]

The part with the most measured effect is the plumbing. ADS reaches the VHA Health Data Repository through an API and pulls structured clinical data straight from the hospital systems, which VBA's testing found saved about 10 minutes per claim, and it retrieves scanned VA and community care images through a second service, which saved about 70 minutes per claim. [26] Eight hundred million pages of medical records had been reviewed that way by April 2024. [26] An hour and twenty minutes of a rater's time per claim, recovered by two interfaces into systems VA already owned.

The newest tool follows the same pattern. The privacy assessment for the claims evaluation pilot describes artificial intelligence, natural language processing, and OCR applied to disability benefit questionnaires, with the output going into VBMS for a person to use. [14] VBA said in 2024 that the next additions would be generative assistants for employees and better handling of free-form text. [26] The frontier piece is arriving last, on top of a decade of parts that are not frontier at all. The most consequential component in the stack is a rules engine, and the rules are the regulation, which is what makes the result portable. Every benefits agency has a regulation, a mailroom, and a hospital system with an API.

The one thing the stack cannot manufacture is a record VA does not own.

## The records VA does not own

The VFW listed the evidence that is hardest to get: VA physicians who will not fill out a questionnaire, separating service members waiting on their treatment records, private providers who do not answer. [3] VA has been shortening each of those waits at the source. Private medical record requests come back from providers in under ten days on average, the best result in that program's fourteen years, and VA is expanding health information exchange with its own hospitals and planning to use the national TEFCA framework with the Social Security Administration. [9]

The exam itself is the other record VA does not produce. Most compensation exams are performed by contract examiners, and in January 2025 VA re-awarded that work to four vendors, among them Leidos QTC Health Services, which has run exams for VBA since 1998 and now sees about 63,000 veterans a month. [27][28] Leidos says it has added artificial intelligence and machine learning to its exam processing and built interfaces directly into VBA's systems, so the completed questionnaire lands in the folder the summarizer reads instead of in a scanner queue. [28] That is the same design rule applied from the outside in: the evidence arrives already readable, and ADS orders the exam within a day of the claim being established, which puts the examiner's clock and VA's clock on the same file. [26]

The record VA still cannot pull on its own schedule is the service treatment record, and that is the seam I traced two weeks ago from the personnel systems through DEERS to the rater's desk. On September 8 the President signed an order giving the Department of War 30 days to send every separating service member's records to VA the moment they leave, with a deadline of October 8. [16] The September 18 issue showed where that record breaks before VA sees it. What this issue shows is the other side of the wire: once the record is in VA's hands, the machinery to read it, summarize it, and put it in front of a rater exists and is measured. The order fixes the handoff. The receiving end is built. What remained, once the evidence arrived, was making sure the file went to a desk that had time for it.

## One pile

In 2012 a claim belonged to the regional office nearest the veteran, which is how Winston-Salem came to hold 37,000 folders on top of its cabinets while the same files were nowhere else. [1][3] The National Work Queue ended that. It holds every claim in a single national pool and pushes work to whichever office has capacity, and Gallucci called it imperfect in the same sentence he credited it with letting VA cross-level work across the enterprise and avoid regional surges. [3] It probably moved more days than anything with the letters AI in it.

It is also where VA's own baseline shows the most obvious slack left. Thirteen days to assign a claim is thirteen days in which nothing happens to it, and the budget names National Work Queue modernization, projected for 2027, as the fix. [9] Margarita Devlin, the principal deputy under secretary for benefits, described the goal to the House as routing claims more efficiently. [17] That work is not done and does not count toward the 66 days.

Each layer needed the one under it, and VA built them roughly in order across a decade. This is the year they compounded, and the year the people carried the rest.

## What the people did

Devlin told the House in April that the gains came from the targeted use of overtime and automation assist tools, in that order, and the budget puts $67 million against overtime because it adds capacity without the delay of onboarding new staff. [17][9] It did so with fewer people. A third-party analysis of federal personnel data counts 2,950 fewer claims examiners between September 2024 and June 2026, a 14 percent drop, and a House member's letter in March cited zero VBA hires in fiscal 2026 to that point. [18][19] Fewer examiners, more decisions, a machine doing the reading. The VFW raised the obvious question in the same statement that praised the result: an operational tempo that leads to burnout cannot be sustained, and doing more with less is not a plan. [3]

That question is open. What is settled is that a 66-day cut in the average, delivered with a smaller workforce and a human still signing every compensation decision, is the speed half of what Hickey promised in 2013, kept. The other half is on the dashboard.

## The number still open from 2013

The release says accuracy is 94 percent, the highest in two years. [4] Behind it on VA's dashboard are two figures: 93.94 percent accuracy at the issue level over twelve months, against the 96 percent target that replaced Hickey's 98, and 83.53 percent at the claim level, which counts a claim wrong if any issue inside it is wrong. [8] The 94 rounds from the first. Both are real, and neither has reached the line VA drew for itself after 2015. Two more numbers sit beside them. The non-rating workload, the dependency and pension adjustments that decide whether a spouse gets paid, has no backlog measure at all, and 291,804 of those actions were older than 125 days in June. [20] And the rating backlog itself, 73,868 claims on September 19, has drifted up about 3,500 since late July, a small move against a large decline and close to VA's own FY2027 projection of about 75,000. [7][21][9]

So the speed promise has been kept and the accuracy promise has been renegotiated once and is still short, and the second fact does not cancel the first. It says where the next decade of work goes. VA spent this decade making the evidence arrive. The next number is whether the decision made from it is right the first time, and the VFW put the cost of getting it wrong in a sentence: a claim that ends up in remands and appeals because of poor quality gains nothing. [3]

## Who is standing in line

Digitize the intake, automate the evidence gathering, route the work, and only then speed the decision. Three systems need that sequence now.

The nearest is the Department of War's side of the same claim. The order's 30-day clock runs out October 8, and the measure that matters afterward is the share of separating service members whose treatment record arrives complete inside that window. [16] VBA's evidence supply chain is the model, and the receiving end already gets a private hospital's records in under ten days. [9] There is no technical reason a federal record should take longer than a private one.

The second is Social Security, whose initial disability backlog stood at 853,000 in June and which is targeting an average of 140 days by FY2027. [22][23] SSA's long pole is the same one, medical evidence retrieval, and VA's budget already describes joint planning with SSA to move records over TEFCA. [9] SSA has the one asset VA lacked in 2012, a claim that arrives digital from the first day.

The third is the Integrated Disability Evaluation System, where a VA exam and a VA rating sit inside a Department of War timeline and the published schedule gives the exam alone 31 days. [24] A summary document at the claim-development stage is the obvious pilot. My read, not a program.

## Monday

Inside VBA, publish the phase times. The budget already contains assignment, development, and decision baselines, and the Monday Morning Workload Report is the right place for a weekly version, because the 125-day clock hides exactly the variance the VFW described between a sexual trauma claim and a gastrointestinal one. [9][3] Give the non-rating inventory a backlog measure and apply the same playbook to it. [20] Publish the issue and claim accuracy figures side by side with their sample windows, so the 94 never needs explaining after the fact. [8]

Inside the Department of War, treat October 8 as the start of a metric and borrow VBA's. Count the records that arrive complete, publish the number monthly, and hold the sending systems to the standard a private hospital already meets. [16][9]

Inside any agency buying automation for a benefits queue, buy the mailroom first, then the evidence layer, then the summary. Require every generated summary to link to its source, score automated work separately from day one, and name the owner of the exception queue before go-live. [14]

## The sixth floor

After the 2012 report, Winston-Salem moved about 60,000 folders that had not been touched in a year to storage off site, and the office director told PBS the next spring that any one of them could be back in three to five days if a veteran filed again. [25] Three to five days to retrieve a folder was, in 2013, the improvement. It is longer than the decision phase of a claim today.

A veteran who filed in Winston-Salem in 2012 had a folder on a floor that was failing under the weight of everyone else's. The rater who finally opened it read what was there, sent for what was missing, and waited. A veteran who files this fall has no folder. The images are everywhere, the summary is written before anyone opens the file, the exam is ordered, the private records are back in nine days, and the rater reads, checks, and signs, on average about eleven weeks after the claim came in. [4][7] The signature is the same act it was on the sixth floor. Everything in front of it changed, in an order, and the one number left from the promise that started it is the one about whether the signature is right.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue follows the folder from a bowing floor to a 76-day average. The companion Capture Corner works the money and the records underneath it: the $130 million the FY2027 budget proposes for VBA automation and AI and the $47.8 million enterprise line it sits beside, the $425.5 million intake requirement, the AI claims-evaluation pilot whose award record ends October 2, the Deloitte intake task order with a March 2027 end date, the unresolved question of who holds the ADS development work today, and the five acceptance criteria a team needs to clear before VBA will let a tool near a rater.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] VA Office of Inspector General, "VBA's Claims Folder Storage at the VA Regional Office Winston-Salem, North Carolina," Management Advisory Memorandum, August 9, 2012. Source for: the May 2012 inspection, approximately 37,000 claims folders stored on top of file cabinets two feet high and two rows deep, folders in boxes on the floor and along the walls, cabinets too close for drawers to open fully, floors bowing with cabinet tops visibly unlevel, the 2011 employee injury from falling folders, the GSA notification on June 13, 2012 that the sixth-floor load was estimated at 164 pounds per square foot against a 125 capacity, and the finding that the storage appeared to have the potential to compromise the integrity of the building. https://www.vaoig.gov/reports/audit/vbas-claims-folder-storage-va-regional-office-winston-salem-north-carolina

[2] NBC News, "VA office stacked 37,000 files on cabinets after running out of room," August 2012. Source for: the 680-employee, 770,000-veteran figures for the Winston-Salem office and the 39-pounds-per-square-foot excess, quoting the Inspector General's report. Secondary; the report at [1] is primary. https://www.nbcnews.com/news/us-news/va-office-stacked-37-000-files-cabinets-after-running-out-flna942379

[3] Ryan Gallucci, Executive Director, Washington Office, Veterans of Foreign Wars of the United States, statement for the record, House Committee on Veterans' Affairs, April 15, 2026. Source for: the 378-day FY2013 average, 152 days at the FY2024 peak, 121 days in FY2025, and 81 days through FY2026 at the time of the statement; the PACT Act backlog projection of about 600,000 in March 2024 and the actual peak of about 400,000 in January 2024; the diagnosis that today's bottlenecks are almost exclusive to development while intake, rating, and award are automated or take days; the description of 2013's paper-based, single-office processing; the National Work Queue assessment; the VFW's power of attorney figures; the hardest-to-obtain evidence; the digitization credit for ending the 2013 backlog; the request for phase-level transparency; and the warnings on burnout and on quality. https://www.vfw.org/advocacy/national-legislative-service/congressional-testimony/2026/4/faster-decisions-stronger-outcomes-vas-work-to-streamline-the-disability-claims-backlog

[4] U.S. Department of Veterans Affairs, "VA processes 3 million disability benefits claims in record time – again," September 22, 2026. Source for: more than 3 million claims completed in FY2026 as of September 18; the 75.6-day average against 141.5 days on January 20, 2025; the backlog reduction of more than 70 percent; and the 94 percent accuracy figure described as the highest in two years. https://news.va.gov/press-room/va-processes-3-million-disability-benefits-claims-in-record-time-again/

[5] Allison A. Hickey, Under Secretary for Benefits, statement before the Senate Committee on Veterans' Affairs, March 13, 2013. Source for: the goal of claims completed in 125 days at 98 percent accuracy in pursuit of eliminating the backlog in 2015, and the Transformation Plan's move from paper to electronic processing. https://www.veterans.senate.gov/services/files/F9D65B7A-31DA-4ACA-98B7-1C2C4A44AD50

[6] Nextgov, "VA's Backlog of Paper Claims Could Cause a Building Collapse," August 2012. Source for: VA CIO Roger Baker's statement that paperless claims processing would be installed in all regional offices the following year. https://www.nextgov.com/digital-government/2012/08/vas-backlog-paper-claims-could-cause-building-collapse/57348/

[7] Veterans Benefits Administration, "Monday Morning Workload Report," national rating bundle for the week ending September 19, 2026. Source for: 664,263 rating claims pending, 73,868 older than 125 days, 3,009,832 completions fiscal year to date, and the 75.57-day fiscal-year-to-date average days to complete. https://www.benefits.va.gov/REPORTS/mmwr/2026/MMWR-09-19-2026.xlsx

[8] Veterans Benefits Administration, "Detailed Claims Data," dashboard marked updated September 21, 2026. Source for: 93.94 percent twelve-month issue-based accuracy, 83.53 percent twelve-month claim-based accuracy, the 96 percent issue-based target, and the note that the original FY2014 to FY2015 goal of 98 percent was revised to 96 percent after FY2015. https://www.benefits.va.gov/reports/detailed_claims_data.asp

[9] U.S. Department of Veterans Affairs, "FY 2027 Budget Submission, Volume 3: Benefits and Burial Programs and Departmental Administration," April 2026. Source for: the September 2025 phase baselines and the NWQ modernization projection; VCIP volumes; ADS growth from 26 to 202 diagnostic codes, more than 540,000 claims touched in 2025, and 50 percent coverage; ADS claims closing about 33 days faster and scoring 96.4 percent against 95.5 percent; private medical record responses in under 10 days; HIE expansion and TEFCA planning with SSA; more than 43 percent of claims requiring a TERA memo; $67.0 million in overtime; and the approximately 75,000-claim FY2027 backlog projection. https://department.va.gov/wp-content/uploads/2026/04/Volume-3.pdf

[10] Robert Orifici, Veterans Benefits Administration, statement before the House Committee on Veterans' Affairs, Subcommittee on Disability Assistance and Memorial Affairs, July 13, 2026. Source for: more than 1.2 billion claim documents digitized; the VBMS search capability; ADS described as helping processors obtain, review, and synthesize evidence; TERA memos auto-populated using verified data with links to source documents, cutting production time by up to 40 percent; and the statement that a trained claims processor makes the final decision on every disability compensation claim. https://docs.house.gov/meetings/VR/VR11/20260713/119443/HHRG-119-VR11-Wstate-OrificiR-20260713.pdf

[11] Tennessee Department of Veterans Services, "VSO Automated Decision Support Toolkit: Frequently Asked Questions," December 29, 2022. Source for: the description of ADS pulling federal records, generating the Automated Review Summary Document, and ordering or drafting exams. https://www.tn.gov/content/dam/tn/veteranservices/learning/vso-tools/tools/vso-automated-decision-support-toolkit-/VSO_Toolkit_FAQ-29Dec22_Final_508c.pdf

[12] VA Office of Inspector General, "Improvements Needed in VBA's Claims Automation Project," 2023. Source for: 16 of 60 sampled automated hypertension claims found inaccurate, and the recommendation that VBA compare automated and traditional claims processing. https://www.vaoig.gov/reports/review/improvements-needed-vbas-claims-automation-project

[13] VA Office of Inspector General, "Review of Automated Decisions for Veterans' Service-Connected Death Claims," April 2026. Source for: dependency and indemnity compensation decisions automated without human involvement, legal errors in about 2 percent of cases, and approximately $2.7 million in improper payments. https://www.vaoig.gov/reports/review/review-automated-decisions-veterans-service-connected-death-claims

[14] U.S. Department of Veterans Affairs, "Artificial Intelligence Claims Evaluation System (AICES) Privacy Impact Assessment," FY2026, May 2026. Source for: source-system interfaces, upload of completed disability benefit questionnaires to VBMS, and the off-ramp of data that cannot be accurately extracted and validated to human review. https://department.va.gov/privacy/wp-content/uploads/sites/5/2026/05/FY26ArtificialIntelligenceClaimsEvaluationSystemAICESPIA.pdf

[15] USAspending.gov, award record CONT_AWD_36C10X25P0051, SteerBridge Strategies LLC, Department of Veterans Affairs. Source for: the ACE AI proof-of-concept pilot, $4,998,352.63 obligated and base plus options, award date August 4, 2025, and current and potential end date October 2, 2026. https://api.usaspending.gov/api/v2/awards/CONT_AWD_36C10X25P0051_3600_-NONE-_-NONE-/

[16] Executive Order 14426, September 8, 2026, 91 FR 58003, published September 11, 2026. Source for: the 30-day requirement for the Department of War to transfer separating service members' records to VA, and the October 8, 2026 deadline. See also Mission Meets Tech, "VA's Manual Tells Raters to Enter Service That Never Happened," September 18, 2026.

[17] Margarita Devlin, Principal Deputy Under Secretary for Benefits, statement before the House Committee on Veterans' Affairs, April 15, 2026. Source for: attribution of the improvement to the targeted use of overtime and automation assist tools, and the National Work Queue routing goal. https://www.congress.gov/119/meeting/house/119134/witnesses/HHRG-119-VR00-Wstate-DevlinM-20260415.pdf

[18] Federal Hiring Data, "VA disability claims, AI, and the workforce in 2026." Source for: the reduction of 2,950 claims examiners, about 14 percent, between September 2024 and June 2026. Third-party analysis of Office of Personnel Management data; not a VA publication. https://www.federalhiringdata.com/articles/va-disability-claims-ai-workforce-2026

[19] Rep. Steve Cohen, letter to VA Secretary Doug Collins, March 9, 2026. Source for: the citation of zero VBA hires in FY2026 to that date. https://cohen.house.gov/sites/evo-subsites/cohen.house.gov/files/evo-media-document/2026.03.09-va-collins-claims-backlog.pdf

[20] U.S. Department of Veterans Affairs, response to questions for the record, House Committee on Veterans' Affairs hearing of April 15, 2026, posted July 15, 2026. Source for: 848,793 non-rating actions pending and 291,804 older than 125 days as of June 2026, and the absence of a non-rating backlog measure. https://docs.house.gov/meetings/VR/VR00/20260415/119134/HHRG-119-VR00-20260415-QFR002.pdf

[21] Veteran Benefit Desk, "VA Claims Backlog Tracker," reading of September 19, 2026. Source for: the increase of 3,576 since July 25, 2026, computed from VBA's weekly reports. Third-party tracker; the September 19 level in this issue is taken from the official workbook at [7]. https://veteranbenefitdesk.com/va-claims-backlog

[22] Social Security Administration, press release, June 29, 2026. Source for: the initial disability claims backlog of about 853,000. https://www.ssa.gov/news/en/press/releases/2026-06-29.html

[23] Social Security Administration, "FY 2027 President's Budget Overview." Source for: the target of a 140-day average for initial disability decisions by FY2027. https://www.ssa.gov/budget/assets/materials/2027/FY27_President's_Budget_Overview.pdf

[24] Tripler Army Medical Center, "IDES Timeline Overview." Source for: the 31 days allotted to the VA examination within the Integrated Disability Evaluation System schedule. https://tripler.tricare.mil/Portals/138/IDES%20Timeline%20Overview.pdf

[25] PBS NewsHour, "Veterans Affairs Backlog Files Stacked So High, They Posed Safety Risk to Staff," April 2, 2013. Source for: the office's statement that about 60,000 records not referenced in the prior year were moved to off-site storage and could be retrieved in three to five days. https://www.pbs.org/newshour/nation/veterans-affairs-backlog-files-were-stacked-so-high-they-posed-a-safety-risk-to-va-staff-1

[26] Molly Gatti, Acting Director, VBA Automated Benefits Delivery, Office of Business Integration, "VBA Automation Helps Serve Veterans More Efficiently & Equitably," briefing to the USSOCOM Warrior Care Program, April 2024. Source for: the technology inventory of robotic process automation, intelligent form recognition, optical character recognition, natural language processing models, medical annotators and summarizers, rules engine, process management, and reporting and analytics; the automation timeline from mail automation in 2019 and 2020 through the Benefits Transformation Platform, presumptive claim automation pilot, and private medical record retrieval in 2023 and 2024; more than 70 percent of claims established within 24 hours of mail receipt; automatic priority flashes; more than 10 million packets processed; extraction trained on typed and handwritten text; the eligibility gates for automated processing; retrieval from the VHA Health Data Repository via API with about 10 minutes saved per claim and scanned images via the SCIP service with about 70 minutes saved per claim; more than 800 million pages of medical records reviewed; exams ordered within one day of claim establishment; and the planned generative AI assistants and free-text capabilities. https://www.socom.mil/care-coalition/SiteAssets/Conference-2024/20240401%20Final%20Automation%20Presentation.pdf

[27] GovConWire, "VA Awards 4 Spots on Medical Disability Exam Support IDIQ," January 7, 2025. Source for: VA's award of follow-on IDIQ contracts to four vendors for medical disability examination services in Regions 1 through 4, supporting VBA's Medical Disability Examination Office. Secondary; award records are primary. https://www.govconwire.com/articles/va-awards-4-spots-medical-disability-exam-support-idiq

[28] Leidos, "Veterans Benefits Administration awards medical disability examination services contract to Leidos QTC Health Services," January 6, 2025. Source for: Leidos QTC Health Services' support to VBA since 1998, an average of 63,000 veterans served per month, the use of artificial intelligence and machine learning to augment exam processing, system interfaces with VBA IT systems, and the one-year base with one option year. Company release; claims are the company's own. https://www.leidos.com/insights/veterans-benefits-administration-awards-medical-disability-examination-services-contract

Sources verified as of September 28, 2026.
