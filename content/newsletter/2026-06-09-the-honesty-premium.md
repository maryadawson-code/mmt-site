---
title: "The Honesty Premium"
date: 2026-06-09
slug: the-honesty-premium
description: "Six Army captains audited a fleet of dozer maintenance records, found more than 82% of the entries useless, and published it under their own names. A firm priced a job with real AI productivity and got told the price was too low to be credible. Two cases this spring, one about data and one about price, and the system marked both honest parties down. Here is why the machinery underneath speed, innovation, and small business still pays out to the old model, and what it means for the military health enterprise that has the most at stake."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "Army"
  - "Department of War"
  - "Defense Health Agency"
  - "Data Quality"
  - "AI Governance"
  - "Dirty Data"
  - "Vantage"
  - "Cost Realism"
  - "Acquisition Reform"
  - "Small Business"
  - "FY2027 NDAA"
  - "Medical Readiness"
  - "Federal Health IT"
  - "Section 809 Panel"
  - "PPBE Reform"
agencies:
  - Army
  - DoW
  - DHA
canonical_url: "https://missionmeetstech.com/newsletter/the-honesty-premium/"
source: claude_newsletter_project
capture_corner_teaser: "The most investable signal in federal AI right now is not a model or a platform, it is which organizations will admit how dirty their data is. Premium subscribers get the companion Capture Corner that names where that translates into work: the FY2027 NDAA provisions that fund it (Sec. 1501, 1512, 1513), the platforms and incumbents that own the surface (Vantage, Advana into the War Data Platform), the cost-realism machinery that will price an AI-efficient bid as too-low-to-be-credible, the speed-versus-governance bifurcation pitch, the DHA instance with its named procurement signal, and the trigger points between now and the June 11 appropriations mark."
capture_corner:
  - "The legislative sequence — authorized June 4, funded (maybe) June 11. The FY2027 NDAA's AI-governance core (Sec. 1512 30-day deployment framework, Sec. 1501 AI incident reporting, Sec. 1513 DoDD 3000.09 revision) is intent, not obligation authority, until the House defense appropriations markup converts it. Plus the reconciliation lane that opportunity tracking on the discretionary bills alone will miss."
  - "The platforms and incumbents — Army Vantage (Palantir), OSD Advana restructuring into the War Data Platform with an audit-driven financial-management carve-out, the commoditized model layer (OneGov, USAi), and the leadership-turnover signal at the Pentagon AI office."
  - "Where the money actually is — six buy signals that follow from the public thesis: data-quality remediation and provenance, incentive-aligned reporting redesign, the 30-day deployment pipeline, incident infrastructure, the speed-versus-governance bifurcation pitch, and the audit-driven financial line."
  - "The cost-realism trap — how the IGCE prices an AI-efficient bid as too-low-to-be-credible, and four positioning moves where the offeror has control: make the productivity assumption explicit, run cost and technical as one argument, pre-build the evaluation-notice answer, and know whether realism even applies."
  - "The MHS instance — the DHA running the Army's exact playbook on a clock, the FY2026-FY2030 Data Strategy's five lines of effort, and the named procurement signal (HT001125RE019) to confirm on SAM.gov before it anchors a pursuit."
  - "Trigger points and action windows — the post-June 11 appropriations summary, the Army CIO succession, Vantage migration confirmation, high-impact-AI enforcement, and the Advana financial-management split."
---

# The Honesty Premium
### The administration is pushing speed, innovation, and small business. Two cases this spring ask whether the machinery underneath was built to deliver it, or only to announce it.

![The Authoritative Wrong Number. The cover image for the issue. Hand-held paper records — a maintenance log with meter readings struck through in red, a readiness record with mission-capable boxes checked and unchecked, a cost estimate with figures crossed out and trailing question marks — feed into a heavy steel Platform of Record machine whose binder spines read Maintenance, Supply, Logistics, Finance, Acquisition, Readiness, and Health. A central screen runs an ingest, validate, aggregate, normalize, certify pipeline inside a Trusted Data Environment stamped Verified. A red signal line leaves the machine and degrades as it travels toward a giant clean number 1 rolling off a conveyor belt, the Capitol faint in the background. The messy truth goes in; the authoritative wrong number comes out.](/images/newsletter/2026-06-09/cover-authoritative-wrong-number.png)

Friends,

Six Army captains pulled the maintenance records for a fleet of Caterpillar D7 dozers. 4,097 records. 196,516 entries. They checked the numbers against the machines.

More than 82% of the entries were useless. Roughly 62% of the dozers carried readings that cannot exist. Odometers running backward. Mileage no engine had turned.

Then they published it. On the Army's own website, in Army Sustainment, under their own names. They titled it "Dirty Data: Vantage is Not Enough." Their conclusion ran one sentence, and it belongs on the wall of every program office in the building: the center of gravity for AI is the quality of the data the model trains on, not the sophistication of the model.

## The grade that should worry everyone else

Read that report as an embarrassment for the Army and you have misread it.

Every service runs on data this messy. Personnel files, readiness rolls, supply counts, fuel logs, maintenance entries, typed in at the end of long days by people with somewhere else to be, rarely checked against the physical world the way these six captains checked their dozers. The mess is the federal baseline. The Army is the one that measured it, wrote it down, and signed its name.

![What the Captains Found. An Army audit of Caterpillar D7 dozer maintenance records. 4,097 maintenance records reviewed, 196,516 entries checked, laid out as a grid in which each small square stands for 500 entries. More than 82 percent of the entries, shown in red and marked with an X, were useless; the thin band of usable entries, 17 percent or less, sits in teal at the bottom. Two callouts: more than 82 percent useless entries, and roughly 62 percent of dozers carrying readings that cannot exist. Source: Army Sustainment, "Dirty Data: Vantage is Not Enough."](/images/newsletter/2026-06-09/what-the-captains-found.png)

That is the honesty premium. The most useful thing a military service has done in the AI race this year is a confession. It is worth more than the platforms and partnerships announced beside it, because it is the only one that tells you whether the thing underneath the slide is real.

Hold that against the year it landed in. The administration has bet the modernization story on three words: speed, innovation, small business. Field the newest models within 30 days. Reward the firm that redesigns the work instead of repeating it. Open the door to the small, fast company over the slow incumbent. The promise is a government that finally moves at the pace of the technology.

The captains' report is the first hard test of that promise, and it asks a plain question. Is the machinery underneath built to deliver the promise, or only to announce it? Two cases this spring answer it. The first is about data. The second is about price. Both reward the same thing, and it is not honesty.

## Why speed makes this worse

In January, the Department of War told its AI office to field the newest commercial models within 30 days of release and to treat that speed as a primary buying criterion. The civilian side passed an April deadline to put risk controls around its highest-impact systems. The whole government has its foot on the accelerator at once.

A model is only as good as what you feed it. Feed it garbage and it does not break. It does not throw an error or refuse to answer. It answers fast. It sounds certain. It is wrong. The confidence is the danger, because a wrong answer delivered with a clean interface and a quick turnaround is the kind a busy commander acts on.

Speed multiplies whatever is already in the data. Point a 30-day model-refresh cadence at records that are 82% unusable and you have built a fast way to reach the wrong conclusion. The accelerator and the dirty tank are the same story from two ends.

## What the platform cannot fix

Every service has built the machinery to look ready. The Army assigned a named owner to every category of data, stood up a hierarchy of stewards from headquarters to the command, and ordered its business and readiness data onto a single platform of record. The other services built their versions: implementation plans with deadlines, stewardship rules, enterprise data environments. On paper, the structure is impressive across the board.

The structure is real. Whether the number under it is true is a separate question, and a harder one. In the Army, someone signs for the rifle, the truck, the radio. Accountability carries a name and a person who answers when the count is wrong. Putting a name on every dataset applied that logic to information, which is overdue and genuine progress. It still does not make the number true. A platform makes data findable. Making it true happens at the keyboard, at the moment a tired soldier enters a figure no system will check and no supervisor will reward him for getting right.

Consolidating bad data onto a trusted platform leaves you with data that is trusted and bad, which is worse than bad alone, because now the wrong number wears the badge of the authoritative source.

![Trusted and Bad. A four-step systems flow showing how a bad number gains authority as it moves. Step 1, Bad Record: messy, inconsistent, human maintenance logs and readiness forms with crossed-out and contradictory entries. Step 2, Platform of Record: the records are ingested, standardized, consolidated, and governed and certified into one source, one version, institutional authority. Step 3, Trusted Output: a clean, official System Readiness Report stamped Status Ready, all checks complete, compliant, verified, approved, authorized. Step 4, Operational Call: an Operational Decision card reading Proceed, Mission Authorized, Risks Accepted. A red truth line runs the length of the flow degrading while a blue authority line accumulates, under the caption: authority increases, truth does not, and the error continues.](/images/newsletter/2026-06-09/trusted-and-bad.png)

The Army built the most structure of any service. It is also the only one that published the grade. That second act is the one a buyer can trust, because a service that will tell you its data is broken is a service you can sell the fix to. The quiet ones are the harder bet. Silence could mean clean. It could mean hidden. From the outside you cannot tell which.

## The fix is incentives, not dashboards

The captains did not stop at the diagnosis. They pointed to the counter-model inside their own house: an aviation maintenance platform where accurate reporting got easier and carried a tangible benefit, and where the data improved for a simple reason. The people entering it finally had a reason to get it right. Lower the cost of accuracy. Attach a reward to it. The numbers got better because the incentives changed, not because anyone bought a better dashboard.

That is the whole game, and most modernization money misses it. The dollars chase platforms and models, the visible layer, the part that demos well. Data quality is decided one layer down, in the workflow, where a sergeant weighs the honest entry against the ninety seconds it costs him. No model reaches that decision. No platform reaches it either. A leader who redesigns the reporting so the honest entry is the easy one reaches it. Capability is downstream of incentives.

## The same trap, one layer up

The incentive trap does not stop at the data. It runs straight up into how the government buys.

A company priced a piece of work the honest way. It used AI for the drafting, the first-pass analysis, the document assembly. Work that took a team six weeks took a smaller team two. The firm priced the job at what it cost to deliver, plus a fair margin, well below what the same scope ran three years ago. The government came back and said the price was too low, that the firm did not understand the scope.

That verdict came out of a cost-realism check, the analysis that governs cost-reimbursement bids and any fixed-price competition where the solicitation calls for it. The bid gets measured against an independent government estimate built the way those estimates are always built. Count the labor categories. Count the hours. Apply the burdened rates. Add overhead and fee. The model assumes the work gets done by people billing by the hour, the way it has been done for thirty years. A bid that prices in real AI productivity does not fit the model. The low number reads as low understanding. The firm that solved the efficiency problem gets marked down for solving it.

Staff the job with bodies, bill the burdened hours, price to the historical baseline, and you clear the check without a question. Deliver the same outcome for less and you get a letter asking whether you read the requirement. One firm passes the savings to the government. The other keeps charging for them. The system selects for the second.

None of this is bad faith. The realism rule exists to stop the contractor who buys in cheap and reprices later through change orders, and that protection is worth keeping. The rule just cannot tell a lowball apart from a genuine productivity gain. Both show up as a number below the baseline, and the evaluator has no model for the honest version, so the honest number gets treated as the dishonest one. The government has run this experiment before, and the record is public. When commercial cloud arrived, agencies kept scoring proposals against on-premise baselines for years, and the savings sat on the table while the old model kept getting funded. The company above is the same story with a faster engine.

The honest read is harder than a modeling lag. Granting every evaluation good faith is generous. A finding that the level of effort is too low can be the door someone wanted to close anyway. Solicitations get written with enough traps to thin the field to a chosen answer. The award lands with a large firm wearing a small firm's badge. The reformers push, and the old guard waits the round out, because waiting has always worked. Change in federal contracting is hard for the same reason the dozer data is dirty. The people with their hands on the process have no incentive to change it.

Keep realism. Update what it measures against: treat AI-augmented delivery as a legitimate path, ask the offeror to show the productivity assumption, and test whether it holds, the same way any technical approach gets tested. The capability gap is the tell. The same government that can stand up an AI to screen imagery across a theater of operations still cannot buy a routine modernization in a way that credits the vendor for using AI to deliver it. It told Congress it was finding savings. It is spending them to keep the old delivery model alive.

## What the two cases share

Put them side by side. A service that measures its data honestly gets read as the service with a problem. A firm that prices its work honestly gets read as the firm that does not understand the job. In both, the system rewards the polished version over the true one and calls the reward prudence.

![The Honesty Penalty. Two cases, same system, same outcome. On the left, what was true: the Service disclosed dirty data — Army captains audited maintenance records and published the truth that the data was largely unusable and full of impossible readings; the Firm priced AI savings in — a small business built real efficiencies into its bid and its price reflected the lower cost to deliver. In the middle, truth enters the system. On the right, how the system scored it: the program looks risky because it admits problems and signals weakness, and the bid looks unrealistic because it is too low to be credible — both penalized. At the bottom, the polished old model wins: legacy labor model, familiar cost structure, no surprises, perceived as safe, because system incentives reward conformity and punish honesty while truthful disclosure, though more accurate and more useful, is marked down.](/images/newsletter/2026-06-09/the-honesty-penalty.png)

That is the honesty premium: the price you pay for telling the truth in a building built to reward the opposite. Speed, innovation, small business. The words are real and the money behind them is real. The machinery underneath still pays out to the old model.

## The reform graveyard

The honest question under all of this is whether any of it sticks. The administration has a clock. The bureaucracy and the vendor base do not.

Acquisition reform arrives in waves, and the system has a long record of outlasting it. In 2016 Congress stood up the Section 809 Panel, sixteen experts charged with rebuilding defense buying so the Pentagon could purchase the way commercial companies do and bring in nontraditional firms. Over three years they wrote 98 recommendations. By the time the panel closed in 2019, fifteen had been implemented. Most of the rest went on a shelf.

The machinery underneath is older. The process that decides what gets funded, PPBE, was built in the 1960s for a different kind of war. A bipartisan commission studied it for two years and in 2024 made 28 recommendations to overhaul it. The Pentagon is already acting on more than two dozen of the initiatives that followed. The structural rewrite, the part that would change how the money actually flows, needs Congress to change the law, and Congress has trouble passing a budget on time, never mind reinventing how one gets built.

That record is what the entrenched are counting on. The way to beat a reform is to outlast it. Run the clock. Bridge the contract. Recompete on the old terms. Score the bid against the baseline that survives a protest, because the novel evaluation is the one that draws a challenge and the safe one is the one that does not. A contracting officer gets no reward for taking a chance on an AI-productivity case and carries all the risk if it goes wrong. The defensible move and the stale move are the same move, and the system was built to reward it.

Something is different this time, and it has little to do with how loud the push is. The graveyard shows volume counts for almost nothing. What changed is the size of the gap. When efficiency meant trimming ten or twenty percent, the old model absorbed it and no one looked twice. A tool that turns six weeks of work into two opens a gap too wide to keep hiding, and at some point a comptroller staring at a deficit stops calling the low bid a pricing error and starts calling it money left on the table. The firms winning in the meantime are the ones routing around the machinery instead of waiting for it to change, building a record through other-transaction and commercial pathways until the standard has to move to where they already stand.

Both of those forces come from outside the rhetoric: pressure from above the system, proof from beside it. What lasts is the reform written into the rules the workforce has to follow no matter who is in the building. The kind that lives only in a memo gets waited out, the way the last waves did.

## Congress arrived at part of the same conclusion

Congress has started writing some of it into the rules. The defense authorization bill the House Armed Services Committee advanced on June 4 does two things at once. One section directs the Pentagon to build a framework for deploying AI models within 30 days. Another directs a program to report every AI incident and vulnerability when something breaks, with protection for the people who report in good faith. Deploy faster, and build the mechanism that tells you what fails.

The defense world runs its own track, stricter on ethics than the civilian rulebook, with five published AI principles and a test-and-evaluation toolkit, and faster on deployment than anything on the civilian side. The open question of the year is whether that review stays a gate or becomes a stamp under a 30-day clock. The incident-reporting program is Congress hedging against the second outcome, honesty written into the speed statute. Part of that discipline is already in force. The autonomy directive the bill revises, last updated in 2023, requires a system to go back through test and evaluation when its machine learning changes, the safety version of the honesty premium already written into doctrine. The buying side has no equivalent yet. Nothing in the acquisition rules rewards the vendor who tells the truth about what AI made cheaper.

## Where the wrong number has a face

Run all of this to the system with the most at stake. The Defense Health Agency has spent the last year building the Army's playbook, almost line for line. Its data strategy for 2026 through 2030 runs on five lines of effort: name the data owners, name the authoritative sources, treat data as a product with an owner and a lifecycle, keep an enterprise catalog, and build trust through data quality and transparency. Its chief data and analytics officer, Jesus Caban, calls data maturity his top priority. The military health enterprise wrote the honesty premium into its strategy as a formal pillar. Six Army captains went one step further and published the audit that shows what the pillar costs to keep.

That step is the one that matters here, because the DHA is already pointing AI at readiness. Its teams have built prototypes on readiness data to model who in the force is medically able to deploy, and its leaders describe the goal as a live picture of the things that decide a fight: blood on hand, beds available, trauma expertise on call. That is the mission in the MHS's own words, a medically ready force and a ready medical force.

Now set the dozers underneath it. A dozer with a backward odometer is a bad row in a spreadsheet. A service member with a stale immunization record, an unlogged deployment-limiting condition, or a health assessment that someone clicked through at the end of a shift is a readiness call about a human being. Feed that to a model and it does what the captains warned. It answers fast. It sounds certain. It tells a commander a unit is green when part of it is not, or holds back a soldier who was fit to go. In the motor pool, the wrong number is a maintenance surprise. In military medicine, the wrong number has a face.

![The Wrong Number Reaches a Person. A dim records office at a military treatment facility. A soldier in uniform sits at a service window, back to the camera, waiting. Through the glass, clinical staff move around a patient bed under a readiness board that tracks beds available, blood supply, trauma expertise, and a unit deployability status reading Conditional. In the foreground, clipped to a stack of folders beside a records tray, a paper Medical Readiness Record is stamped in red: status Deployable crossed out and overridden to NON-DEPLOYABLE, reason Medical History Inconsistent. The bad row in the database has become a call about the person at the window.](/images/newsletter/2026-06-09/wrong-number-reaches-a-person.png)

Which is why the MHS, of all enterprises, should be first to run the dozer audit on itself, and first to refuse the false economy that scores the cheaper, honest delivery as the suspect one. The strategy does not stop at promising trust. Its fourth line of effort names the work directly: institutionalize data quality remediation, build a data quality scorecard. The fix is already in the doctrine. What is missing is the published number, the readiness data checked against the people it describes, the way the captains did with their dozers. Precision about weakness reads as strength, and in a system that holds people's lives it reads as something closer to duty.

## The hands on the keyboard

Picture the soldier at the end of a fourteen-hour day, logging a dozer's hours into a system that will not check his entry and will not thank him for getting it right. Then picture the clinic tech closing out a health assessment the same way, on a service member whose deployability gets read straight off that record. Then picture the estimator inside the firm, deleting the AI productivity line from the bid because the honest number will only draw a letter. All three are doing the math the system taught them. The honest entry costs more than the round one, and nothing at the keyboard rewards the difference.

They are the center of gravity for every AI ambition above them. The number on the commander's screen, the readiness flag on the record, the price the government pays, are true or distorted depending on what those hands type, and on whether anyone built them a reason to tell the truth. Every strategy memo, every 30-day cadence, every billion-dollar platform resolves down to that choice.

So, is it working? The announcements are working. The speed is real, the innovation is real, the door to the small firm is open. What has not moved is the thing underneath, the set of incentives that still rewards the contractor who staffs the old way and the program that buries the bad number. The old guard has seen reform arrive and leave before, and it is betting this round runs out the way the last ones did. For thirty years that bet has paid.

The Army told the truth about its data. A firm told the truth about its price. The system marked both of them down. Whether that changes comes down to a plain race: the new rules getting written into law and evaluation before the clock the old guard has always outlasted runs out again. The people who pay if the clock wins are not in the room. They are the soldier whose readiness was a guess and the patient whose record the system trusted because it sat on the right platform. For the military health enterprise, that is reason enough to stop waiting for the machinery to fix itself.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

The most investable signal in federal AI right now is not a model or a platform, it is which organizations will admit how dirty their data is. Premium subscribers get the companion Capture Corner that names where that translates into work: the FY2027 NDAA provisions that fund it (Sec. 1501, 1512, 1513), the platforms and incumbents that own the surface (Vantage, Advana into the War Data Platform), the cost-realism machinery that will price an AI-efficient bid as too-low-to-be-credible, the speed-versus-governance bifurcation pitch, the DHA instance with its named procurement signal, and the trigger points between now and the June 11 appropriations mark.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.
**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] CPT Gage Callahan, CPT Thomas Canchola, CPT Timothy Naudet, CPT Olivia Beattie, CPT Bonvie Fosam, and CPT Adam Knapp, "Dirty Data: Vantage is Not Enough," *Army Sustainment* (Winter 2026), Army.mil, May 15, 2026, https://www.army.mil/article/291270/dirty_data_vantage_is_not_enough

[2] "Artificial Intelligence Strategy for the Department of War," Department of War, signed Jan. 9, 2026 (posted Jan. 12, 2026), https://media.defense.gov/2026/Jan/12/2003855671/-1/-1/0/artificial-intelligence-strategy-for-the-department-of-war.pdf

[3] FY2027 National Defense Authorization Act (H.R. 8800), House Armed Services Committee, advanced June 4, 2026 (44-12). Cyber, Innovative Technologies, and Information Systems title: Sec. 1501 (DoD AI Incident and Vulnerability Reporting Program), Sec. 1512 (AI Model Rapid Deployment Framework, 30-day deployment objective), Sec. 1513 (Update of Policy on Autonomous and AI-Enabled Systems). https://armedservices.house.gov/uploadedfiles/fy27_ndaa_citi_print_-_final.pdf

[4] OMB Memorandum M-25-21, "Accelerating Federal Use of AI through Innovation, Governance, and Public Trust," April 3, 2025 (minimum risk-management practices for high-impact AI due within 365 days, approximately April 3, 2026), https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf

[5] Sydney J. Freedberg Jr., "Army's chief data officer outlines plan for new hierarchy of 'data stewards,'" Breaking Defense, April 2024, https://breakingdefense.com/2024/04/armys-chief-data-officer-outlines-plan-for-new-hierarchy-of-data-stewards/

[6] "Army Directs Full Data Migration to Vantage to Boost Readiness, AI Integration," ExecutiveGov, Sept. 30, 2025, https://www.executivegov.com/articles/us-army-data-migration-vantage-ai-integration

[7] Sydney J. Freedberg Jr., "Border mission drives joint data sharing: Army Data Chief," Breaking Defense, Oct. 30, 2025, https://breakingdefense.com/2025/10/border-mission-drives-joint-data-sharing-army-data-chief/

[8] "DoD Adopts Ethical Principles for Artificial Intelligence," U.S. Department of Defense, Feb. 24, 2020; "Responsible AI Strategy and Implementation Pathway," June 2022 (2024 update), https://media.defense.gov/2024/Oct/26/2003571790/-1/-1/0/2024-06-RAI-STRATEGY-IMPLEMENTATION-PATHWAY.PDF

[9] "DHA Rolls Out Data Strategy to Boost Medical Readiness, Interoperability," MeriTalk, March 2026, https://www.meritalk.com/articles/dha-rolls-out-data-strategy-to-boost-medical-readiness-interoperability/; "Defense Health Agency Data Strategy, Fiscal Years 2026-2030," DHA.mil, https://dha.mil/Reference-Library/d/e/f/Defense-Health-Agency-Data-Strategy

[10] "From simulation to solution: Defense Health Agency team advances warfighter readiness with AI," DHA.mil, Dec. 17, 2025, https://dha.mil/News/2025/12/17/17/46/From-simulation-to-solution

[11] "Section 809 Panel" (Advisory Panel on Streamlining and Codifying Acquisition Regulations, created by Sec. 809 of the FY2016 NDAA, P.L. 114-92): 98 recommendations across an interim report and three-volume final report, 2016-2019; 15 implemented by Congress or DoD as of July 2019, Defense Technical Information Center, https://discover.dtic.mil/section-809-panel/

[12] Commission on Planning, Programming, Budgeting, and Execution (PPBE) Reform, "Defense Resourcing for the Future: Final Report," March 6, 2024 (28 recommendations, including replacement of the 1960s-era PPBE process), https://ppbereform.senate.gov/finalreport; Brendan W. McGarry, "PPBE Reform Commission Final Report Recommendations: Issues for Congress," Congressional Research Service IN12372, May 31, 2024, https://www.congress.gov/crs-product/IN12372

[13] DoD Directive 3000.09, "Autonomy in Weapon Systems," updated January 25, 2023, https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodd/300009p.pdf
