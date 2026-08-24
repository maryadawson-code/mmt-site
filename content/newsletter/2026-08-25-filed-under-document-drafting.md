---
title: "Filed Under Document Drafting"
date: 2026-08-25
slug: filed-under-document-drafting
description: "VA's Inspector General reported in June that clinicians were drafting patient notes with two generative AI chat tools, neither designated high-impact under federal AI policy. One of those tools does not appear in VA's 367-record AI use case inventory at all. It reached the department inside a $4.65 billion Microsoft enterprise agreement, and it is logged in a separate spreadsheet with three columns, under the heading of generating first drafts of documents."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "Artificial Intelligence"
  - "VA OIG"
  - "AI Governance"
  - "Clinical Documentation"
  - "Microsoft Copilot"
  - "OMB M-25-21"
  - "GSAR 552.239-7001"
  - "Ambient Scribe"
  - "Patient Safety"
  - "Capture Strategy"
agencies:
  - "VA"
  - "VHA"
  - "DHA"
  - "GSA"
  - "OMB"
  - "CMS"
canonical_url: "https://missionmeetstech.com/newsletter/filed-under-document-drafting/"
source: claude_newsletter_project
capture_corner_teaser: "This issue reads the inventory files against the Inspector General's findings. The companion Capture Corner works the buy: the $4.65 billion VA Microsoft enterprise agreement and the GSA OneGov terms sitting under the Copilot license band, the ambient scribe contracts and the enterprise IDIQ with a dismissed protest behind it, the two AI RFIs the Chief AI Officer closed this summer and what a follow-on solicitation would have to contain, the four flowdown roles and government benchmarking rights in proposed GSAR clause 552.239-7001, the disclosure artifacts M-26-04 now requires with any procured LLM, and how a classification decision made by a contracting officer changes your bid cost before a single requirement is written. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "The classification decision happens before you see the solicitation, and it moves your delivery cost by a factor you can calculate. A capability recorded as a commercial license lands in a three-column file with no risk fields. The same capability recorded as a use case lands in a pipeline with seven attestations, an impact assessment, and an independent review by an office outside development. Ask the contracting officer in writing during market research which file it goes in, and price both paths until you get an answer."
  - "The Copilot money is already spent, so the play is adjacent rather than displacement. A 50,000-plus license band sits inside a $4.65 billion VA enterprise agreement placed with Dell Federal Systems, and GSA OneGov made Copilot free for up to twelve months for G5 customers. Governance, assurance, monitoring, and the interface layer are where the buys are. Two Chief AI Officer instruments closed in June with no award reported, and the ambient scribe portfolio is six fragmented pilots waiting on one enterprise IDIQ whose protest is already dismissed."
  - "Proposed GSAR 552.239-7001 assigns obligations by teaming role, and three of them are engineering work. Four flowdown roles map to NIST AI RMF actor categories, so who holds which seat on your team now carries a compliance bill you sign at the teaming agreement. Price government-run benchmarking against your production model, certified permanent deletion, and open-format export with documented APIs before the final rule lands, because a benchmark interface takes longer to build than a proposal takes to write."
---

![In an exam room, a clinician in a white coat sits at a desk with her back to the viewer, typing at a monitor while an older veteran patient in a ball cap waits on the exam table behind her. A second translucent window floats above her screen, and a long ribbon of generated text pours out of it and down into a navy file box packed with patient charts. A red dashed line arcs away from that window, skips past a set of broken red brackets on the floor, and lands instead in a small three-column table propped on a stand at right. The generated draft reaches the patient record while the review gate it should have passed through sits broken and bypassed, and the only place the tool is logged is a spreadsheet with three columns.](/images/newsletter/2026-08-25/cover-filed-under-document-drafting.png)

# Filed Under Document Drafting

*VA's Inspector General reported in June that clinicians were drafting patient notes with two generative AI chat tools, neither designated high-impact under federal AI policy. One of those tools does not appear in VA's 367-record AI use case inventory at all. It reached the department inside a $4.65 billion Microsoft enterprise agreement, and it is logged in a separate spreadsheet with three columns, under the heading of generating first drafts of documents.*

Friends,

A clinical note starts as a conversation.

The patient talks. The clinician listens, asks, examines, decides, and scratches something down. The visit ends and the next one is already waiting, and at some point that afternoon or that night the clinician sits in front of a screen and turns twelve minutes of a person's life into a paragraph the chart will accept. Assessment. Plan. The words a coder can read and a lawyer can defend.

Somewhere in the last two years, a number of them started opening a second window first.

They typed what happened, or pasted their own shorthand, and a paragraph came back with the headings already in it. They fixed what was wrong. They pasted it into the record and signed their name to it, which is what federal rules require and all that federal rules require.

Enough clinicians did this that two VHA staff built an app so people could share the prompts that worked. Of the 135 prompts uploaded to it, 79 were clinical. Fifty-six of those drafted clinical notes. [1]

VA publishes what artificial intelligence it uses. The 2025 inventory carries 367 individual records, each with an owning office, a development stage, a high-impact designation, and a set of risk management attestations. I searched all 367 for Microsoft 365 Copilot Chat. [3]

Zero rows.

The tool exists in a different file. VA's consolidated commercial inventory lists Microsoft Copilot Chat under the use case description "Generating first drafts of documents, briefing, or communication materials using AI," grouped with Power Automate AI Builder and Microsoft Dynamics D365 CoPilot, at an estimated license band of 50,000 or more. [4] That file has three columns: the use case, the product name, the number of licenses. No development stage. No high-impact status. No owning office. No risk management attestation, because there is no field to put one in.

VHA authorizes Copilot Chat for use with patient health information. [2][19] The Inspector General's report faults VA for failing to designate the chat tools high-impact, and it does not identify the mechanism sitting underneath that finding. One of the two tools never entered the pipeline where designation happens. It was filed as a productivity license, and productivity licenses do not get designated.

## The number that traveled

Coverage of this report in June settled on a headline: more than 15,000 VA staff using ungoverned chatbots. I used that figure myself before I read the primary document, and it is wrong.

It comes from two Microsoft Teams collaboration sites, 10,997 active users on the Chief AI Officer team's VA GPT feedback site and 4,835 on the National AI Institute's AI@VA site, measured across a ninety-day window running October 9, 2025 to January 6, 2026. [1] The Inspector General calls those numbers an indicator of the popularity of AI chat tool use. They count VA staff rather than VHA clinicians, the two figures may overlap, and the report says plainly that there is no means to measure the breadth of use for clinical care and documentation.

The population actually exposed is larger. VA's own compliance plan puts VA GPT at about 100,000 users onboarded, the inventory page says over 95,000, and the Copilot Chat license band of 50,000 or more sits on top of that. [4][5][7] The reported figure understated the exposure by roughly six times, and the trade press repeated the smaller number for two months.

## How it reached that many desks

VA buys Microsoft through a reseller. Delivery order 36C10B25F0093, placed with Dell Federal Systems against GSA Multiple Award Schedule contract 47QTCA22D003G, carries a total value of $4,650,679,410.16 across a period running April 1, 2025 through March 31, 2030, with an action obligation of $465,772,965.92 at award. The VA Technology Acquisition Center ran it and two companies bid. [9]

Five months later GSA announced its OneGov agreement with Microsoft, which put Microsoft 365 Copilot in front of Microsoft 365 G5 customers at no cost for up to twelve months, opt-in open through September 2026. [10]

There was no solicitation for a clinical documentation tool. No requirement document, no evaluation criteria, no technical volume, no protest window, and no moment at which a contracting officer or a source selection board was asked whether this thing was fit to write into a patient's chart. The capability arrived as a feature of a license the department already held, free for the first year, and it spread the way software spreads when it is already installed and it saves somebody an hour.

VA GPT took a different road to the same place. It runs at $1.25 per user per month in pilot, and VA reports about 100,000 users onboarded. [5][8] No contract, task order, or vehicle specific to VA GPT appears in the award records. The inventory records it as developed with both contracting and in-house resources, and VA has described it as co-developed with Microsoft. [3]

Two general-purpose language tools, one at roughly 100,000 onboarded accounts and one in a license band of 50,000 or more, both authorized for protected health information, neither of them bought through a procurement that asked a clinical question.

## What the file says the tool is for

The one chat tool that does appear in the individual inventory is VA GPT, record VA-24-3086, Office of Information and Technology, development stage Deployed, high-impact status "c) Not high-impact," topic area Administrative Functions. Its stated purpose is basic administrative tasks: drafting emails, summarizing documents, summarizing meeting notes. [3]

That classification is identical in the January 2026 publication and in the April 2026 compliance update, and the April file went out three months after the Inspector General's preliminary memo of January 15 had already flagged the patient safety concern. [2] The designation did not move.

The prompt-sharing app says what the tool was for in practice. Fifty-six clinical notes, seventeen summarizations, six other, out of 135 uploads on the Chief AI Officer's own Teams site. [1]

A cleaner comparison sits inside the same file and it needs no interpretation. The VA.gov public-facing chatbot, record VA-24-2717, same office, same inventory, deployed, carries a high-impact designation. VA GPT does not, though it is approved for PHI and was demonstrably used to draft clinical notes. [3] The chatbot that answers a veteran's question about filling out a form got the safeguards. The tool that writes what goes in his chart got none.

## Why the machinery missed it

An explanation exists here that involves nobody acting badly, and it is visible in what the inventory is made of.

Across the 367 records the technology breakdown runs 80 computer vision, 72 classical or predictive machine learning, 55 generative AI, 55 natural language processing, 25 agentic, 1 reinforcement learning. Of the 55 generative use cases only 13 carry a high-impact designation and only 8 are deployed. Inside VHA's 172 high-impact records, 126 sit in the Health and Medical topic area, dominated by imaging and monitoring. [3]

VA built this regime around FDA-cleared imaging models, where pre-deployment testing means something concrete. A radiology algorithm arrives with a labeled dataset, a ground truth, a sensitivity and a specificity, and a device pathway that already exists to check them. Somebody can run the test and write down the number.

A free-text tool that drafts a paragraph has no equivalent. There is no ground truth for a well-written assessment, no published test method in federal health for whether a generated note is safe, and no number to write in the box. The regime was calibrated for a kind of AI that shows up carrying its own proof, and language tools showed up without any.

That explains the gap. It does not close it, and it describes a product requirement rather than a personnel failure.

## The deadline VA set for itself

VA's compliance plan for M-25-21 is public, and it is more specific about consequences than the Inspector General's report is.

High-impact use cases already in operations, the plan says, have until April 3, 2026 to meet the minimum risk management requirements. For a use case that cannot meet them, reviewers determine whether to submit a waiver or remove the use case from operations until the requirements can be met. The plan names the termination mechanisms: a Risk Management Framework denial of authority to operate, or blocking the connection at the VA boundary. It also states that VA has issued no waivers. [5]

January 15, 2026. The Inspector General tells VA in writing that clinicians are using undesignated chat tools with patient information, eleven weeks ahead of the deadline. [2] April 2026, VA publishes a compliance-updated inventory and VA GPT is still Administrative Functions, still not high-impact. [3] April 3 passes. No waiver is requested. Nothing comes out of operations. June 11, the report publishes. The date VHA commits to for all three recommendations is April 2027. [1]

Twelve months past a deadline the department wrote for itself, under a plan that names two remedies and reports zero use of either.

If the second recommendation is honored and the chat tools turn out to warrant high-impact treatment, VA's own written rules leave a waiver or removal from operations. The plan describes no third option. Two questions follow and neither takes a clearance to ask. Has a waiver been requested for VA GPT or Copilot Chat since June 11. And what authority permits a twelve-month overrun of the department's own OMB deadline.

A scheduling problem sits underneath both questions. April 2027 lands inside the RISE reorganization, which consolidates eighteen VISNs into five and is projected to finish around mid-2027. [15] The National AI Institute sits in the Digital Health Office, inside the structure being rebuilt. The office that owes the work is the office being taken apart and put back together while it does it.

## Who signed it

John Bartrum, the confirmed Under Secretary for Health, signed VA's concurrence on May 19, 2026. He announced his departure to staff on June 30 and resigned effective July 6, three weeks after the report published. [13]

Since January 2025 four individuals have held that office across five appointments. Shereef Elnahal resigned January 20, 2025. Steven Lieberman served acting until November 14. John Figueroa performed the duties as senior advisor until January 9, 2026, when Bartrum took office following a 53 to 43 confirmation the prior month. Bartrum held it until July 6. Lee Payne was reported into the acting role in early July, and VA's own Veterans Health Administration page currently lists Figueroa as acting. [13]

The technology side moved the same way. Charles Worthington held both Chief Technology Officer and Chief AI Officer, and on September 15, 2025 he told a House subcommittee that all VA employees now have access to a secure generative AI tool. [11] He announced his departure in March 2026 and Kimberly McManus became acting Chief AI Officer. [12] VA has cycled three CIO nominees since January 2025, with Gary Shatswell nominated April 22, 2026. [14]

So the recommendations went to an office that emptied within a month of publication, the commitment runs twelve months, and the signature on it belongs to somebody who was gone in three weeks. April 2027 is a date on a document. Everything that turns a date into a delivery is currently in motion.

## The honest counterargument

Five defenses of VA's position are real, and a senior official raises them before the coffee gets cold.

The Inspector General documented risk and did not document harm. Its search of the Joint Patient Safety Reporting system returned zero AI-related reports across a system taking roughly 180,000 submissions a year. [1] No documented incident anywhere attributes a clinical documentation error specifically to a general-purpose chatbot, inside VA or outside it.

VA's posture also tracks the memo it is being measured against. M-25-21 tells agencies to strip out bureaucratic requirements that inhibit innovation, and a VA AI leader told the Inspector General the guidance is to minimize unnecessary oversight and push risk management down to the lowest reasonable level. [1][6] The counter is narrow and specific. The same memo requires practices proportionate to anticipated risk.

The productivity case is real and VA has put numbers on it. Two to three hours saved per user per week, over 70 percent of users reporting better job satisfaction, at $1.25 per user per month. [7][8] In a system carrying the clinical vacancies VHA carries, two hours a week per clinician is not a rounding error, and anyone who has watched a physician chart at nine at night understands why the tools spread without a memo.

VA also acted during the inspection rather than after it. The National Center for Patient Safety was added to the VHA AI Assessment Subcommittee and a VHA AI in Healthcare Workgroup stood up in January 2026, both credited by the Inspector General in its own impact section. [1]

And the Inspector General used Microsoft Copilot Chat to analyze the interview transcripts and evidence for this report, then argued in its appendix that its own use does not meet the M-25-21 high-impact definition because AI was not the principal basis for decision-making. [1] That is the same argument VA made about clinicians, made by the office grading VA on it.

The strongest counter comes out of VA's own file rather than out of any of that. Across all 90 deployed high-impact use cases, the April 2026 compliance columns show pre-deployment testing, impact assessment, independent review, ongoing monitoring, and operator training each attested "Yes" ninety times out of ninety. Fail-safe reads 86 yes and 4 not applicable. Appeal process reads 79 and 11. [3] There is not one "No" anywhere in the deployed high-impact portfolio.

Reclassifying the chat tools moves them into a regime that has never recorded a failure across 90 systems spanning imaging, cardiac monitoring, benefits automation, and a public chatbot. Uniform perfect compliance across a portfolio that size is an attestation, and an attestation is a document. The fix the Inspector General wants may well be the right fix. Its evidentiary value has not been tested.

The weak point in VA's defense is buried in its own response. VHA's action plan commits to pre-deployment performance assessments, impact assessments, ongoing monitoring, use-case-specific education, transparency mechanisms, and penalties for inappropriate use of generative AI tools. [1] An organization that believed these tools were low risk would not be planning penalties.

## Why this lands on the Military Health System

DoD is categorically exempt from M-25-21's AI strategy requirement under Section 2(a), footnote 9, and from the annual AI use case inventory and public posting requirement, including high-impact designation, under Section 3(b)(v). [6] DHA began full enterprise deployment of ambient listening in February 2026 and has fielded a Clinical AI Agent inside MHS GENESIS. [21][17] Neither carries a high-impact designation process to fail, because the process does not reach them.

VA is being criticized for imperfect use of an accountability apparatus its closest institutional peer is not required to operate.

The Joint Patient Safety Reporting system makes that concrete. JPSR is jointly owned and operated by DHA and VHA and funded through the Joint Incentive Fund. [18] VA's National Center for Patient Safety asked DHA in 2025 to add an AI cause code to the reporting drop-down, and no formal decision came back. [1] So a nurse at a VA medical center who suspects a generated note contributed to a bad outcome opens a reporting form with no box that says so, and the reason there is no box is that the fix requires two departments to agree. The Inspector General's third recommendation asks VHA to improve AI-related patient safety reporting. It is an interagency negotiation wearing the clothes of an action item.

DHA earns credit on the other side of this. In fall 2024, DHA and the DoD Chief Digital and Artificial Intelligence Office ran a generative AI red-teaming exercise with more than 200 clinician and analyst participants across DHA, the Uniformed Services University, and the services, producing more than 800 bias and vulnerability findings on clinical note summarization and medical advisory chatbot use cases. [1] That is the pre-deployment evidence VA does not appear to have generated for its chat tools, and DHA generated it while exempt from any requirement to.

The exemption relieves DHA of reporting. It does not relieve a corpsman of the consequences of a bad note, and the difference matters most to the people who will never see either inventory.

## Nothing requires the note to say

No government-wide requirement exists to label or watermark AI-generated content in federal records. The only binding labeling rule located in this space applies to DoD public affairs, and NARA's August 21, 2026 guidance is scoped to records management. [6]

CMS is directly on point and cuts against everybody. Its signature guidance states that if a provider uses a scribe, including artificial intelligence technology, the provider must sign the entry to authenticate the document, and the scribe need not sign or date it. [16] Authentication is mandatory. Attribution is not.

So the Inspector General's finding that VA has no process to label AI-generated clinical documentation describes a hole in federal policy rather than a VA compliance failure. Fixing it inside VA alone would make VA the only health system in the federal government that tells a veteran what wrote his note.

## What to do Monday

Three moves, depending on the seat.

Inside VA or VHA, the two questions in the deadline section are the ones to put in writing, and the answers are either very short or very interesting. The durable move underneath them is to make the classification decision deliberately instead of by default. A capability recorded as a commercial license lands in a file with three columns and no risk fields. The same capability recorded as a use case lands in a pipeline with seven attestations and an independent review by an office outside development. Right now that routing follows from how somebody wrote a requirement. It should follow from what the software does to a patient record.

Inside DHA or a service medical command, the exemption is reporting relief and not an answer. Take the fielded ambient and chat capabilities and score them against the seven minimum practices as though M-25-21 applied. Either the answers exist, which is worth knowing before a committee asks, or the same gap VA has is sitting there and it gets found privately instead of in a report. Then go get a decision on the JPSR cause code, because the request has been open since 2025 and DHA holds it.

Selling into either enterprise, the classification path determines what evidence gets asked for, and it moves delivery cost before the solicitation posts. Ask the contracting officer during market research which file the capability goes in. One email, and it changes a bid estimate.

There is one question anybody can answer this week without a meeting. Take a note in your own record, or one you wrote last Tuesday, and find out what drafted the first version and where that answer is written down.

## What this costs in practice

In Australia this month a patient read his own post-operative letter and found a sentence in it saying he had micro-dosed psychedelic mushrooms. He had not. An AI documentation tool produced the text, and the reporting on that case sits alongside errors involving the wrong breast in a cancer diagnosis and a false notation of epilepsy. [20]

Nothing in American federal policy requires a clinical note to record what drafted it. The provider signs, which authenticates the content and satisfies CMS, and the signature says nothing about where the first draft came from. [16]

The evidence base is thin and it is prospective. It stays thin as long as there is no cause code to report against and no label to report about, which is the part that ought to bother a reader more than the absence of a body count.

Go back to the clinician at the screen at nine at night, turning twelve minutes into a paragraph. The paragraph is going into a record a veteran can request ten years from now, and it will carry a clinician's name and a date and nothing else. What wrote the first version is recorded in a spreadsheet with three columns, filed under document drafting.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue reads the inventory files against the Inspector General's findings. The companion Capture Corner works the buy: the $4.65 billion VA Microsoft enterprise agreement and the GSA OneGov terms sitting under the Copilot license band, the ambient scribe contracts and the enterprise IDIQ with a dismissed protest behind it, the two AI RFIs the Chief AI Officer closed this summer and what a follow-on solicitation would have to contain, the four flowdown roles and government benchmarking rights in proposed GSAR clause 552.239-7001, the disclosure artifacts M-26-04 now requires with any procured LLM, and how a classification decision made by a contracting officer changes your bid cost before a single requirement is written.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] Department of Veterans Affairs, Office of Inspector General, "Review of Generative Artificial Intelligence Chat Tools for Clinical Use," Report 26-00182-140, June 11, 2026. Source for: the review period of October 14, 2025 to February 5, 2026 and the October 9, 2025 to January 6, 2026 Teams analytics window; the 10,997 and 4,835 Teams site active user figures and the characterization of them as an indicator of popularity; the statement that there is no means to measure breadth of use for clinical care and documentation; the 135 shared prompts with 79 clinical, broken into 56 clinical notes, 17 summarization, and 6 other; the prompt sharing app built by two VHA staff; the three recommendations, concurrences, and April 2027 target dates; the zero AI-related results from the Joint Patient Safety Reporting search and the approximately 180,000 annual submissions; the VA AI leader quotation on minimizing bureaucratic oversight; the National Center for Patient Safety addition to the VHA AI Assessment Subcommittee and the January 2026 AI in Healthcare Workgroup; VHA's action plan commitments including penalties for inappropriate use; the OIG's own use of Microsoft Copilot Chat and its appendix reasoning; the 2025 NCPS request to DHA for an AI cause code in JPSR; and the fall 2024 DHA and CDAO generative AI red-teaming exercise participant and findings counts. https://www.vaoig.gov/sites/default/files/reports/2026-06/vaoig-26-00182-140_-_final.pdf

[2] Department of Veterans Affairs, Office of Inspector General, Preliminary Result Advisory Memorandum 26-00182-42, January 15, 2026. Source for the preliminary patient safety concern raised eleven weeks before the April 3, 2026 compliance deadline, and for the finding that VHA authorizes VA GPT and Microsoft 365 Copilot Chat for use with patient health information. https://www.vaoig.gov/sites/default/files/reports/2026-01/vaoig-26-00182-42_final.pdf

[3] Department of Veterans Affairs, "VA AI Use Case Inventory 2025," compliance-updated file published April 2026. Source for: record VA-24-3086 VA GPT, Office of Information and Technology, Deployed, "c) Not high-impact," topic area Administrative Functions, its stated administrative purpose, and its development type of developed with both contracting and in-house resources; the absence of any Microsoft 365 Copilot Chat record across all 367 individual use cases; record VA-24-2717 VA.gov Chatbot designated high-impact; the technology classification counts (80 computer vision, 72 classical or predictive machine learning, 55 generative AI, 55 natural language processing, 25 agentic, 1 reinforcement learning); the 55 generative use cases of which 13 are high-impact and 8 deployed; VHA's 172 high-impact records with 126 in the Health and Medical topic area; and the minimum risk management practice attestation counts across all 90 deployed high-impact use cases. https://department.va.gov/ai/wp-content/uploads/sites/26/2026/04/VA-AI-Use-Case-Inventory-2025-Web-Compliance-Updates.xlsx

[4] Department of Veterans Affairs, "VA AI Consolidated Inventory 2025." Source for the three-column structure of the consolidated commercial inventory, the Microsoft Copilot Chat entry grouped with Power Automate AI Builder and Microsoft Dynamics D365 CoPilot under the use case description "Generating first drafts of documents, briefing, or communication materials using AI," and the 50,000-plus estimated license band. https://department.va.gov/ai/wp-content/uploads/sites/26/2026/01/VA-AI-Consolidated-Inventory-2025-Web.xlsx

[5] Department of Veterans Affairs, "Compliance Plan for OMB Memorandum M-25-21." Source for the April 3, 2026 deadline applying to high-impact use cases already in operations; the two named remedies of waiver submission or removal from operations; the Risk Management Framework denial of authority to operate and VA boundary connection blocking as termination mechanisms; VA's statement that it has issued no waivers; and the approximately 100,000 VA GPT users onboarded figure. https://department.va.gov/ai/department-of-veterans-affairs-compliance-plan-for-omb-memorandum-m-25-21/

[6] Office of Management and Budget, Memorandum M-25-21, "Accelerating Federal Use of AI through Innovation, Governance, and Public Trust," April 3, 2025. Source for the high-impact framework replacing the prior rights-impacting and safety-impacting categories; the direction to remove unnecessary and bureaucratic requirements that inhibit innovation alongside the requirement that practices be proportionate to anticipated risks; the DoD exemption from the AI strategy requirement at Section 2(a) footnote 9; and the DoD exemption from the annual inventory and public posting requirement at Section 3(b)(v). The absence of any government-wide AI labeling requirement is a finding across M-25-21, M-25-22, and M-26-04; the only binding labeling rule located applies to DoD public affairs under DoDI 5400.19, and NARA's August 21, 2026 guidance is scoped to records management. https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf

[7] Department of Veterans Affairs, AI Use Case Inventory page. Source for over 95,000 VA GPT users onboarded, the 2 to 3 hours per week saved figure, and the over 70 percent improved job satisfaction figure. https://department.va.gov/ai/ai-use-case-inventory/

[8] Department of Veterans Affairs, "Building the Future: VA's Strategy for Adopting High-Impact Artificial Intelligence to Improve Services for Veterans." Source for the VA GPT pilot cost of $1.25 per user per month. https://department.va.gov/ai/building-the-future-vas-strategy-for-adopting-high-impact-artificial-intelligence-to-improve-services-for-veterans/

[9] OrangeSlices AI, "Veterans Affairs inks a 5-year $4.7B Microsoft Enterprise Agreement," and the HigherGov contract record for 47QTCA22D003G-36C10B25F0093. Source for the $4,650,679,410.16 total value, the $465,772,965.92 action obligation, Dell Federal Systems L.P. as awardee, delivery order 36C10B25F0093 against GSA Multiple Award Schedule contract 47QTCA22D003G, the April 1, 2025 to March 31, 2030 period of performance, the VA Technology Acquisition Center as contracting office, and two bidders. These figures come from trade coverage of the award record rather than from the contract document; verify in the federal award record before relying on them. https://orangeslices.ai/veterans-affairs-inks-a-5-year-4-7b-microsoft-enterprise-agreement/

[10] General Services Administration, "Multibillion dollar GSA OneGov agreement with Microsoft brings steep discounts," September 2, 2025. Source for Microsoft 365 Copilot at no cost for up to twelve months for Microsoft 365 G5 customers and the opt-in period running through September 2026. https://www.gsa.gov/about-gsa/newsroom/news-releases/multibillion-dollar-gsa-onegov-agreement-with-microsoft-brings-steep-discounts-09022025

[11] Charles Worthington, written testimony before the House Committee on Veterans' Affairs, September 15, 2025. Source for the statement that all VA employees now have access to a secure generative AI tool, and for the contemporaneous VA GPT user and productivity figures. https://www.congress.gov/119/meeting/house/118596/witnesses/HHRG-119-VR11-Wstate-WorthingtonC-20250915.pdf

[12] Nextgov, "VA's top tech and AI official announces departure," March 2026. Source for Charles Worthington holding both Chief Technology Officer and Chief AI Officer roles, his March 2026 departure announcement, and Kimberly McManus becoming acting Chief AI Officer. https://www.nextgov.com/people/2026/03/vas-top-tech-and-ai-official-announces-departure/412112/

[13] Federal News Network, "VA's top healthcare official is stepping down," July 2026; Department of Veterans Affairs, Veterans Health Administration leadership page; ExecutiveGov reporting on the acting appointment, July 2026; Military Times reporting on Shereef Elnahal's January 20, 2025 resignation; Steven Lieberman's own account of serving as acting through November 14, 2025; Congress.gov nomination record for the December 18, 2025 confirmation of John Bartrum by a vote of 53 to 43. Source for the succession chain of four individuals across five appointments since January 2025, Bartrum's June 30 announcement to staff and July 6, 2026 effective resignation, the report of Lee Payne in the acting role in early July, and VA's current listing of John Figueroa as acting. The May 19, 2026 concurrence date and Bartrum's signature come from the response memorandum in the OIG report at [1]. Note that VA's press secretary characterized Bartrum's total department service as seventeen months, a separate figure from the nineteen-month span referenced here. https://federalnewsnetwork.com/veterans-affairs/2026/07/vas-top-healthcare-official-is-stepping-down/

[14] Nextgov, "Trump nominates third VA CIO to start his administration," April 2026. Source for the three CIO nominees cycled since January 2025 and the April 22, 2026 nomination of Gary Shatswell. https://www.nextgov.com/people/2026/04/trump-nominates-third-va-cio-start-his-administration/413050/

[15] Department of Veterans Affairs, RISE program page, and Military Times, "Veterans health shake-up: reforms to get underway in coming months," January 30, 2026. Source for the consolidation of eighteen VISNs into five and the projected mid-2027 completion. https://digital.va.gov/rise/

[16] Centers for Medicare and Medicaid Services, "Complying with Medicare Signature Requirements," MLN905364. Source for the requirement that a provider using a scribe, including artificial intelligence technology, must sign the entry to authenticate the document, and that the scribe need not sign or date it. https://www.cms.gov/files/document/mln905364-complying-medicare-signature-requirements.pdf

[17] Defense Health Agency, "Ambient listening to support warfighters," July 6, 2026. Source for the Clinical AI Agent fielded within MHS GENESIS. Vendor and governance details for the Clinical AI Agent are not disclosed in the source. https://dha.mil/News/2026/07/06/13/20/Ambient-listening-to-support-warfighters

[18] Defense Health Agency and Veterans Health Administration, "Defense Health Agency, Veterans Health Administration collaboration standardizes patient safety reporting," DVIDS. Source for JPSR being jointly owned and operated by DHA and VHA and funded through the Joint Incentive Fund. https://www.dvidshub.net/news/472733/defense-health-agency-veterans-health-administration-collaboration-standardizes-patient-safety-reporting

[19] Department of Veterans Affairs, "Guidance for Generative AI Use at VA." Source for VA's approval of VA GPT and Microsoft 365 Copilot Chat for use with PHI and PII. https://department.va.gov/ai/guidance-for-generative-ai-use-at-va/

[20] ABC News (Australia), "AI medical scribe error leaves patient devastated," August 14, 2026. Source for the post-operative letter falsely stating a patient had micro-dosed psychedelic mushrooms, and for the reported errors involving the wrong breast in a cancer diagnosis and a false epilepsy notation. This is Australian reporting; no equivalent documented U.S. incident attributing a clinical documentation error to a general-purpose chatbot was located. https://www.abc.net.au/news/2026-08-14/ai-medical-scribe-error-leaves-patient-devastated/107031672

[21] Defense Healthcare Management Systems, "DOD Healthcare Management System Modernization Fact Sheet," as of February 2026, Distribution A. Source for the February 2026 start of full DoD enterprise deployment of Ambient Listening. https://www.health.mil/Reference-Center/Fact-Sheets/2026/03/24/DOD-Healthcare-Management-System-Modernization-Fact-Sheet

Sources verified as of August 24, 2026.
