---
title: "VA's Manual Tells Raters to Enter Service That Never Happened"
date: 2026-09-15
slug: vas-manual-tells-raters-to-enter-service-that-never-happened
description: "Executive Order 14426 gives the Department of War 30 days to send every separating service member's records to VA the moment they leave, to fix a delay the White House puts at 90 to 180 days and sources to nothing. The record breaks in three places the order never names: where it is written, how it is certified, and whether the rater can open it. Each has a fix with a number attached, and the contract review due January 6 is where the three lines could go."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "EO 14426"
  - "VA"
  - "DEERS"
  - "IPPS-A"
  - "Service Treatment Records"
  - "HAIMS"
  - "VBMS"
  - "Oracle EHRM"
  - "MHS GENESIS"
  - "Records Interoperability"
  - "Capture Strategy"
agencies:
  - "VA"
  - "DoW"
  - "Army"
  - "DHA"
canonical_url: "https://missionmeetstech.com/newsletter/vas-manual-tells-raters-to-enter-service-that-never-happened/"
source: claude_newsletter_project
capture_corner_teaser: "This issue names the three places the record breaks. The companion Capture Corner works the clause that opens on January 6: which contracts Section 2(b) of EO 14426 reaches, from the Oracle EHRM ceiling through IPPS-A, NP2, AFIPPS, DMDC's DEERS support and VBMS; how a mandatory interoperability requirement gets added to a live IDIQ and who prices it; the identity reconciliation seam across DEERS, VADIR and the Master Person Index that no incumbent owns; the 180-day AI clause read as a buy; and every dated event between now and March 7, 2027. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "The definition is the competition. Section 2(b) orders every existing medical and personnel IT contract modified to add the word interoperable, with no metric, no owner, no reporting, and no standard behind it, and the same word goes into every future contract. The modifications will be bilateral, so each incumbent writes the first draft for its own system. If you hold a contract on the list, deliver a two-page proposed clause to the contracting officer before January 6: a named standard on the health side, USCDI version and exchange participation, and a precedence rule with a mismatch metric on the personnel side. The government has 120 days and no text."
  - "The seam has no contract. DEERS is authoritative for identity, the service personnel systems are definitive and feed it, VADIR holds VA's copy, and the Master Person Index carries the crosswalk. Nobody owns the reconciliation across the four, and a targeted search found no current enterprise-level prime on HAIMS, VBMS, DMDC's DEERS and RAPIDS support, VADIR, or FEHRM support. A white paper under the DHA enterprise CSO HT003826SC005, or a task order under a VA OIT or DMDC vehicle, that offers the precedence rulebook and a monthly mismatch report as a fixed-price recurring service is a small bid with a large forward position."
  - "Watch four documents and price the work as a service. The two departments' list of contracts in scope, the OFPP memo or class deviation carrying the clause text, the forward clause in the first post-January solicitation for medical or personnel IT, and the DHA direct-award justification for the Oracle Health platform contract, which will be the first future contract to carry the requirement. Section 4(b) makes the whole order subject to appropriations in a fiscal year that starts October 1 under a continuing resolution or close to it. A recurring monthly report with a named owner is what the departments can fund inside a CR. A system build is not."
---

![A conveyor of paper records runs from a military hangar on the left, with an aircraft and ground vehicles inside, to a stone-columned VA building on the right. Three magnifying circles above the belt mark where the record fails: a folder strapped down and bent under a red arrow at the first junction, a folder with an empty dashed circle where its certification should be, and a translucent record locked inside a dark cabinet at the last station before the steps.](/images/newsletter/2026-09-15/cover-vas-manual-tells-raters-to-enter-service-that-never-happened.png)

# VA's Manual Tells Raters to Enter Service That Never Happened

*Executive Order 14426 gives the Department of War 30 days to send every separating service member's records to VA the moment they leave, to fix a delay the White House puts at 90 to 180 days and sources to nothing. The record breaks in three places the order never names: where it is written, how it is certified, and whether the rater can open it. Each has a fix with a number attached, and the contract review due January 6 is where the three lines could go.*

Friends,

A sergeant reenlisted in June 2022 to leave active duty for the Reserve. He ETS'd on November 15. His Reserve contract started November 16. In between, IPPS-A, the Army's new personnel and pay system, went dark for its cutover, and his packet never got processed. The Army put him in the Individual Ready Reserve instead. His gaining unit's S1 told him they could not do anything because he did not show up in the system. [1]

"I lost Tricare prime coverage for myself and my family," he wrote on RallyPoint that January. [1]

On September 8 the President signed Executive Order 14426. It gives the Department of War 30 days to send every separating service member's Official Military Personnel File, health record, and Service Treatment Record to VA "immediately when a service member is discharged or released from the Armed Forces." [2] Thirty days from September 8 is October 8. The White House fact sheet says the transfer takes 90 to 180 days today. It cites nothing for that. [3] VA says continuous access could take another 20 to 30 days off an average that is already down to 76.1, from 141.5 on January 20, 2025. [4] The claims average is real and published. The transfer figure and the savings are claims with no method behind them.

The sergeant's record moved fine. It moved him into the wrong status, and everything downstream believed it. Speed was never his problem. It is not VA's either. The record breaks in three places the order never names, and each one has a fix that costs less than the order.

## Where it is written

DoD Instruction 1341.02 makes DEERS the authoritative source for who a person is, what they are affiliated with, and what care they are eligible for. The same instruction tells the services to feed DEERS from their own personnel systems, which it calls definitive. [5] DEERS is authoritative for the answer. The services own the question. On Friday I wrote that DHA's data strategy promises designated authoritative sources and names none. DEERS is the one DoD named forty years ago, and this is what the word means once it leaves the memo.

An officer who ran a data trace for DHA's enterprise data program told me what his team found when they followed errors downstream. The services' personnel systems were overwriting DEERS. Correct a record at the ID card office, and the next feed from the personnel system put the old value back. DEERS was the carrier. The services were the source. Read the instruction again and the overwrite is the design.

That is one officer's trace. The Army said the same thing in public in the month the sergeant lost his coverage.

IPPS-A went live for the whole Army in January 2023. Less than a week after it was integrated with DEERS, 25,000 TRICARE beneficiaries were disenrolled. Senators Tester and Moran put that number in a letter to the Secretary of Defense on February 1. [6] Two days later the Army confirmed another 600 officers and warrant officers had been dropped. [7] Army Reserve Pay Message 23-01, dated January 19, explained the mechanism in a sentence written for clerks: the DEERS/IPPS-A interface was not working properly, IPPS-A did not have a baseline from DEERS for all soldiers, dependency data did not match, and orders could not be paid. [8] Eighteen months later the flow failed in the other direction. DEERS had not been sending all dependent changes to IPPS-A, including divorces in dual-military marriages and adult children coming off benefits. The first corrected file ran on May 10, 2024. It carried about 50,000 dependent updates. [9]

![Infographic titled Where It Is Written. Two stacks of record cards, labeled Service personnel systems and DEERS, each carrying Status, Dates, and Dependents, feed a single red crossover switch that outputs a TRICARE eligibility card with a warning icon and glitching text. Three figures across the bottom: 25,000 disenrolled, 600 officers dropped, 50,000 dependent updates.](/images/newsletter/2026-09-15/where-it-is-written.png)



The Navy does not call it a defect. It calls it a lag, and it prints the workaround. Its Individual Augmentee report tells sailors that NSIPS takes 24 to 48 hours to update RAPIDS, that they will "frequently experience an apparent lapse in Tricare coverage," and that they should carry a copy of their orders in case they need medical attention in the gap. [10]

The director of the Defense Manpower Data Center saw the shape of this in 2013, when DEERS entry moved from ID card offices to personnel offices so the two records would stop disagreeing. "Data quality is an issue that's a continuing journey and process," Mary Dixon said. [11] Ten years later the journey ran through a $600 million personnel system that took 25,000 people off their health plan in a week. [7]

**The fix.** Write down which system wins. For every field in the record, the rulebook says whether the personnel system or DEERS is the source, and the other one yields. The personnel system owns status, dates, and dependents. DEERS owns eligibility. Updates move when the event happens instead of on the overnight batch, so a correction at the ID card office survives until morning. DMDC reports the mismatch count by service every month. The number already exists. Someone counted 50,000 dependent corrections in one file. Nobody is required to publish the count.

## How it is certified

The medical half of this order was signed once before.

In February 2013 DoD and VA agreed that DoD would send complete, certified Service Treatment Records to VA, electronically, by December 31, 2013. VA called it a game-changer. [12] It went live on January 1, 2014. Paper STRs stopped, HAIMS took the scans, and a form, DD 2963, certified each record complete. [13]

The DoD Inspector General audited the first year. Of 96,224 Army STRs sent to VA in 2013, 74,470 were late and 26,901 were incomplete. Seventy-seven percent. Twenty-eight percent. The Air Force ran 35 and 11. The Navy and Marine Corps kept no data that could answer the question. After the paperless system went live, Army timeliness fell to 17 percent. [13]

The reasons were procedural. The DoD instruction never picked up the certification procedure the two departments had agreed on, so hospitals kept using a letter VA did not accept. Dental was the largest single gap: 14,174 of the 26,901 incomplete Army records were missing it, and Air Force cells said they left it out because dental claims were rare. Guard and Reserve records sat in a readiness system with no interface to HAIMS. And the audit says this about its own scope: it "focused on the transfer of STRs and did not review the process for personnel records." [13]

Twelve years later, the personnel file has still never been audited that way.

The Guard and Reserve path still runs on its own track. VA's adjudication manual, in a section changed on May 6, 2026, says VBMS requests the record from HAIMS automatically, waits out a 45-day suspense, and then, if the certified record is visible in JLV but never arrived, tells the claims processor to enter a period of active duty into VBMS that ends today, click Request STR Again, and delete the invented service immediately after the request goes through. If that fails, a central division files a records request with the service under a code built for the purpose: RV1 for Reserve, NG1 for Guard. [21]

The IG came back in 2018. For FY2016 claims, 86 percent of Army STRs were timely and 92 percent were complete, against 17 and 67 in 2014. What changed was an instruction rewritten to say what complete means, and a program office assigned to own the number. [14]

![Infographic titled How It Is Certified. A Service Treatment Record moves along a conveyor with tabs for Medical, Personnel, Treatment, and Immunizations, while Dental and Guard and Reserve folders sit as red dashed outlines that never board. The record passes under a press stamped Certify, into a building marked HAIMS, and on to a columned VA building. Two bar charts compare the Army in 2014, 17 percent timely and 67 percent complete, with FY2016, 86 percent timely and 92 percent complete.](/images/newsletter/2026-09-15/how-it-is-certified.png)



**The fix.** Certification generated by the system at separation instead of a signature on a form. HAIMS is still the authoritative repository for the STR, and MHS GENESIS content lands in it under its own heading, next to a separate heading for Army Guard and Reserve readiness records. [21][22] Complete becomes a query across both, and it fails when the Guard record is missing or the reservist's dental exam from a civilian provider never arrived, because that is the record least likely to be in either place. VA's rejection rate by service goes on a page every quarter. That is the mechanism that moved 17 to 86, and it has never once been pointed at the personnel file.

## Whether the rater can open it

Both departments run Oracle Health now. That sentence is doing a lot of work in the coverage of this order, and it does not do what people think.

Disability claims run in VBMS, the Veterans Benefits Management System, a different system from the health record. The rater's window into VA medical records is a tool called CAPRI that claims processors have used since 2004, and it cannot read the new Oracle system. [15] So in October 2020 VBA sent an email: find claims from veterans whose records live in the new system and tag them with a flash, so they route to the few staff who can see those records. [16]

VA's Inspector General checked. The new system was live at five facilities then, with 132,770 veterans' records in it. Between August 2021 and July 2022, VBA completed 21,057 rating decisions for those veterans. In 5,605 of them the flash was missing, or added after the decision was made. Twenty-seven percent. More than a dozen managers and employees told the IG they had never heard of the memo. Two of them searched their inbox during the interview and found it. [16]

![Infographic titled Whether the Rater Can Open It. A dark cabinet labeled Oracle record on the left connects across a short conveyor, broken by a red dashed tag labeled Routing flash, to a rack labeled VBMS and CAPRI on the right, where a C&P exam report is readable and a specialist report sits locked behind frosted glass. Three figures across the bottom: 132,770 veterans, 21,057 rating decisions, and 5,605 missing or late flashes, 27 percent, in red.](/images/newsletter/2026-09-15/whether-the-rater-can-open-it.png)



In a sample of 30 of those claims, the IG found no effect on any veteran's benefits. Anyone at VA will say that sentence first, and it is true. The sample was 30. The population was 132,770, at five facilities, before the rollout restarted. [16]

VBA concurred. The first recommendation was refresher training. The second was a change to the quality manual. Both closed by September 2024, and neither requires the number to be computed again. [16] On January 2, 2026 the Board of Veterans' Appeals sent a hearing loss claim back to the regional office because the full report of a November 2023 VA hearing test was, in the file's own words, in "Cerner Millennium," and never reached the file. The Board called it a pre-decisional duty to assist error. [23]

The pieces that could fix this mostly exist. FEHRM's joint health information exchange went live in April 2020 and, after joining Carequality in 2023, reaches more than 90 percent of U.S. hospitals. [17] JLV shows a rater both departments' records, with limits the IG wrote down: some new-system records cannot be opened from it, a Cerner defect kept PowerForms from loading, and a May 2023 manual update told staff to get "equivalents" through JLV without defining the word. [16] And VBMS already fires an automatic request the moment a claim is established. It fires at HAIMS. [21] Nothing fires at the Oracle record. VA told the IG the tool for that was Chart Search, which would let VBA pull Cerner and CAPRI records into VBMS. The February 2023 pilot did not happen and moved to early fiscal 2024. [16] I can find no public record that it shipped.

**The fix.** Point the trigger that already exists at the second repository, and set the flash from the Master Person Index so no one has to remember an email. Then compute the number the IG computed once, every quarter, with an owner. Measurement without an owner decays. The 2023 report is what that looks like.

## The line that could go in the contracts

Congress ordered full interoperability by September 30, 2009. Then it ordered it again by December 31, 2016. The STR deadline was December 31, 2013. This order is the fourth time. [18][19][12]

The word every one of them used is "interoperable," and nobody can fail it. Section 2(b) of the new order sends the Secretaries of War and Veterans Affairs into every existing personnel and health IT contract within 120 days to add that same word. [2] January 6, 2027. The contracts in scope include Oracle's VA EHRM agreement, which VA extended in August by up to $17 billion without competition, to a ceiling near $27 billion running through May 2031. [20] The program itself, deployment and sustainment through 2031, is now estimated at about $48 billion, against the $10 billion it started at in 2018. [26] Six days before the order was signed, the House Veterans' Affairs Committee voted 19 to 0 to subpoena Oracle's chairman and chief executive over that extension after the company declined to appear, and GAO told the committee that VA had not fully implemented 14 of its 18 recommendations on the program. [24][25] That is the contract the review reaches first. They also include IPPS-A, the Navy and Air Force pay-and-personnel systems, DMDC's DEERS support, and VBMS.

My read: the mods could carry three lines instead of one word. A precedence rulebook for identity data, with a mismatch count. A system-generated certification, with a rejection rate. A claims-side pull, with a completeness rate. Each reported quarterly. None of them requires a new system. All of them require someone to own a number, which is the one thing the 2018 audit proved works. Section 4(b) makes the whole order subject to appropriations, and the fiscal year starts October 1 under whatever Congress produces. [2] Three numbers on a page are cheaper than a fifth order.

The first deadline comes sooner. Section 2(a)(iii) requires the immediate transfer to be in place by October 8, and nothing in the order requires anyone to report whether it was. [2]

The sergeant's file will reach VA in a day after that. It will say whatever IPPS-A said about him in November 2022. Nothing in the order asks whether that was true.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue names the three places the record breaks. The companion Capture Corner works the clause that opens on January 6: which contracts Section 2(b) reaches, from the Oracle EHRM ceiling through IPPS-A, NP2, AFIPPS, DMDC's DEERS support and VBMS; how a mandatory interoperability requirement gets added to a live IDIQ and who prices it; the identity reconciliation seam across DEERS, VADIR and the Master Person Index that no incumbent owns; and the three deliverables a bilateral mod could carry, with sourced action windows in the monthly Capture Intelligence Sheets.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] RallyPoint, "Can I reenlist for active duty if my reserves reenlistment contract was never processed?", January 21, 2023. Source for: the sergeant's account of reenlisting in June 2022, ETS on November 15, 2022, Reserve contract start November 16, the IPPS-A brownout, transfer to the IRR, the gaining unit S1 unable to act because he did not appear in the system, the unanswered HRC request, and the loss of TRICARE Prime for himself and his family. Poster's name withheld by MMT. https://www.rallypoint.com/answers/can-i-reenlist-for-active-duty-if-my-reserves-reenlistment-contract-was-never-processed

[2] Executive Order 14426, "Accelerating Access to Veterans' Benefits and Employment Opportunities," signed September 8, 2026, 91 FR 58003, published September 11, 2026. Source for: Section 2(a)(iii) 30-day immediate transfer requirement, Section 2(a)(i) 180-day continuous sharing, Section 2(b) 120-day contract review and future interoperability requirement, Section 3 TAP provisions, Section 4(b) availability of appropriations, and Section 4(d) publication costs borne by VA. https://www.federalregister.gov/documents/2026/09/11/2026-18738/accelerating-access-to-veterans-benefits-and-employment-opportunities

[3] The White House, "Fact Sheet: President Donald J. Trump Accelerates Veterans' Access to Benefits and Employment Opportunities," September 8, 2026. Source for: the statement that records transfer takes an average of 90 to 180 days and the 20 to 30 day projected reduction. https://www.whitehouse.gov/fact-sheets/2026/09/fact-sheet-president-donald-j-trump-accelerates-veterans-access-to-benefits-and-employment-opportunities/

[4] Department of Veterans Affairs, "President Trump's executive order means faster access to VA healthcare, benefits than ever before," September 8, 2026. Source for: Secretary Collins' statement on continuous access, the 141.5 to 76.1 day average claims processing figures, and the 20 to 30 day projection. https://news.va.gov/press-room/president-trumps-executive-order-means-faster-access-to-va-healthcare-benefits-than-ever-before/

[5] DoD Instruction 1341.02, "Defense Enrollment Eligibility Reporting System (DEERS) Program and Procedures," August 18, 2016. Source for: DEERS as the authoritative data source for identity, DoD affiliation, and TRICARE eligibility, and the requirement that the uniformed services provide personnel information from their definitive personnel systems to DEERS. https://www.cac.mil/Portals/53/Documents/DODI-1341.2.pdf

[6] Senators Jon Tester and Jerry Moran, letter to Secretary of Defense Lloyd Austin, February 1, 2023. Source for: the disenrollment of 25,000 TRICARE beneficiaries less than a week after IPPS-A was integrated with DEERS. https://www.veterans.senate.gov/services/files/EE3C0457-C4C4-44C0-8FB4-887CD2D2AB11

[7] Military.com, Steve Beynon, "Hundreds More Soldiers Kicked off Tricare in Yet Another IT Blunder," February 3, 2023. Source for: the 600 active duty officers and warrant officers removed from TRICARE per Army spokesperson Lt. Col. Joseph Payton, the $600 million IPPS-A figure, and the attribution of the January disenrollment to a DEERS update and its relationship to IPPS-A. https://www.military.com/daily-news/2023/02/03/hundreds-more-soldiers-kicked-off-tricare-yet-another-it-blunder.html

[8] S1Net message summary, January 19, 2023, item 6, Army Reserve Pay Message 23-01, "Temporary Resolution for Dependency Mismatch When Paying Orders in RADARS." Source for: the statement that the DEERS/IPPS-A interface was not working properly and IPPS-A did not have a baseline from DEERS for all soldiers, causing a dependency data mismatch that prevented orders from being paid. Mirror of the milSuite posting. https://www.armyng.com/2023/01/s1net-message-summary-19-jan-23.html

[9] Integrated Personnel and Pay System-Army, COL Rebekah S. Lust, "IPPS-A UPDATE: Orders Framework Updates, Inbound DEERS Data, Attachments, New Validator SUBCAT, COT/IPCOT Absences, Roadmap and Resources," June 24, 2024. Source for: DEERS not sending all required dependent changes to IPPS-A, the dual-military separation and adult child examples, the May 10, 2024 first corrected file, and the approximately 50,000 dependent updates. https://ipps-a.army.mil/Resources/News/Article/3814839/ipps-a-update-orders-framework-updates-inbound-deers-data-attachments-new-valid/

[10] U.S. Fleet Forces Command, "IA Joint Report," 11th edition, October 2020. Source for: the 24 to 48 hour NSIPS to RAPIDS update lag, the "apparent lapse in Tricare coverage" language, the instruction to carry a copy of orders as proof of coverage, and the virtual pay packet opened during the 14-day restriction of movement. https://media.defense.gov/2021/Jul/29/2002815640/-1/-1/0/IAJOINTREPORT11THEDOCT2020.PDF

[11] American Forces Press Service, Terri Moon Cronk, "Streamlined DEERS Procedures Provide Better Efficiency," April 10, 2013. Source for: DMDC Director Mary Dixon's statements that DEERS entry would move from ID card offices to personnel offices, that data quality is "a continuing journey and process," and that mismatched entries created "a lot of work" to reconcile. https://www.globalsecurity.org/military/library/news/2013/04/mil-130410-afps02.htm

[12] House Committee on Veterans' Affairs, bipartisan letter to Secretary of Defense Chuck Hagel, April 16, 2013, as released by Rep. Dina Titus. Source for: the February 2013 DoD-VA agreement to transfer complete and certified STRs with electronic capability by December 31, 2013, and VA's description of the agreement as a "game-changer." https://titus.house.gov/press-releases/titus-pushes-dod-on-va-claims-backlog-game-changer

[13] Department of Defense Inspector General, DODIG-2014-097, "Audit of the Transfer of DoD Service Treatment Records to the Department of Veterans Affairs," July 31, 2014. Source for: the January 1, 2014 paperless STR process and HAIMS, DD Form 2963 certification, the Army figures of 96,224 STRs with 74,470 (77 percent) not timely and 26,901 (28 percent) not complete, the Air Force figures of 35 and 11 percent, the Navy and Marine Corps lack of data, the post go-live Army timeliness of 17 percent, the guidance and certification procedure gap, 14,174 of the 26,901 incomplete Army records missing a dental record, the Air Force explanation for omitting dental, Guard and Reserve records without an interface to HAIMS, and the scope statement excluding personnel records. https://media.defense.gov/2014/Jul/31/2001713386/-1/-1/1/DODIG-2014-097.pdf

[14] Department of Defense Inspector General, DODIG-2018-079, "Followup Audit: Transfer of Service Treatment Records to the Department of Veterans Affairs," February 22, 2018. Source for: the FY2016 Army figures of 70,069 STRs with 86 percent timely and 92 percent complete against 17 and 67 percent in 2014, the revision of DoDI 6040.45, and the program management office. https://media.defense.gov/2018/Feb/26/2001881878/-1/-1/1/DODIG%E2%80%902018%E2%80%90079.PDF

[15] HadIt.com, Theresa "Tbird" Aldrich, "Your Medical Records Moved to VA's New System. Your Claims File May Not Have.", July 2026. Source for: CAPRI as the rater's tool since 2004 and its inability to read the Oracle system, the JLV and flash routing, and the January 2026 Board of Veterans' Appeals remand of a hearing loss claim over a November 2023 audiology exam held in the Oracle record. Secondary source citing VA OIG 22-03806-162 and M21-1. https://hadit.com/va-new-health-record-system-claims-file-records-gap/

[16] Department of Veterans Affairs Office of Inspector General, Report 22-03806-162, "VA Should Ensure Veterans' Records in the New Electronic Health System Are Reviewed before Deciding Benefits Claims," August 30, 2023. Source for: the October 2020 VBA routing memo, the 21,057 rating decisions from August 1, 2021 through July 31, 2022, the 5,605 (27 percent) missing or late flashes, the five deployed facilities and 132,770 unique veterans with data in the new system as of August 23, 2022, the 30-case sample with no effect on benefits found, staff unaware of the memo, the two employees who found it in their email during interviews, the JLV limits (records that cannot be opened from JLV, the PowerForms defect, and the May 2023 manual language on "equivalents" with no definition), the Chart Search application with a February 2023 pilot that did not occur and moved to early FY2024, VBA's concurrence, and the two recommendations (national refresher training; consider updating VA Manual 21-4) closed on September 26, 2024 and January 2, 2024. https://www.vaoig.gov/sites/default/files/reports/2023-08/VAOIG-22-03806-162.pdf

[17] Federal Electronic Health Record Modernization office, "The Joint HIE Now Participates in Carequality," 2023, and "Joint Health Information Exchange" program page. Source for: the April 2020 launch of the joint HIE and the expansion from 75 percent to more than 90 percent of U.S. hospitals through Carequality. https://www.fehrm.gov/the-joint-hie-now-participates-in-carequality/

[18] National Defense Authorization Act for Fiscal Year 2008, Public Law 110-181, Section 1635. Source for: the requirement for full interoperability of DoD and VA electronic health records by September 30, 2009 and the creation of the Interagency Program Office. https://www.govinfo.gov/content/pkg/PLAW-110publ181/pdf/PLAW-110publ181.pdf

[19] National Defense Authorization Act for Fiscal Year 2014, Public Law 113-66, Section 713. Source for: the requirement for an interoperable electronic health record with an integrated display of data, or a single record, by December 31, 2016. https://www.govinfo.gov/content/pkg/PLAW-113publ66/pdf/PLAW-113publ66.pdf

[20] Nextgov/FCW, "VA boosts EHR modernization contract with Oracle by $17B," August 2026. Source for: the addition of up to approximately $17 billion, the total potential value near $27 billion, and the extension of the period of performance to May 16, 2031. https://www.nextgov.com/modernization/2026/08/va-boosts-ehr-modernization-contract-oracle-17b/415548/

[21] Department of Veterans Affairs, M21-1 Adjudication Procedures Manual, Part III, Subpart ii, Chapter 2, Section B, "Procedures for Obtaining Service Treatment Records," change date May 6, 2026. Source for: the automatic VBMS request to HAIMS at claim establishment for service ending on or after January 1, 2014, the 45-day suspense, the Reserve and National Guard workflow in III.ii.2.B.1.b including the instruction to enter a period of active duty with today's release date, click Request STR Again, and remove the added period immediately, the RV1 and NG1 request codes to the service single point of entry, and the eFolder headings "STR MHS GENESIS" and "STR HRR (medical records for Army National Guard and Army Reserves)." Official text at https://www.knowva.ebenefits.va.gov/system/templates/selfservice/va_ssnew/help/customer/locale/en-US/portal/554400000001018/content/554400000014119 ; mirror with the same text at https://claimraven.com/m21-1/III.ii.2.B

[22] Military Health System, "HAIMS Fact Sheet," March 13, 2025. Source for: HAIMS as the authoritative data repository for the Service Treatment Record. https://health.mil/Reference-Center/Fact-Sheets/2025/03/13/HAIMS-Fact-Sheet

[23] Board of Veterans' Appeals, Citation Nr. A26000111, Docket No. 241104-492938, decided January 2, 2026, Veterans Law Judge Marjorie A. Auer. Source for: the remand of an initial compensable rating for bilateral hearing loss, the November 2023 VA hearing test whose full report was noted to be in "Cerner Millennium" and did not appear in the file, and the finding of a pre-decisional duty to assist error. https://www.va.gov/vetapp26/files1/A26000111.txt

[24] Office of Rep. Maxine Dexter, "House Veterans' Affairs Committee Unanimously Passes Rep. Maxine Dexter's Motion to Subpoena Oracle Leaders Over $27 Billion VA Contract," September 2, 2026. Source for: the unanimous committee vote to subpoena Oracle Executive Chairman Larry Ellison and CEO Mike Sicilia, Oracle's acceptance and then withdrawal from the hearing, the ceiling increase from $10 billion to over $27 billion by no-bid extension, and GAO's finding that VA had not fully implemented 14 of 18 recommendations as of August 2026. https://dexter.house.gov/media/press-releases/house-veterans-affairs-committee-unanimously-passes-rep-maxine-dexters-motion

[25] Nextgov/FCW, "House panel subpoenas Oracle heads over VA health record overhaul's ballooning costs," September 2, 2026. Source for: the 19 to 0 vote, the $17 billion ceiling and three option periods, GAO's Carol Harris on the missing complete cost estimate and integrated master schedule, and Sicilia's July 2022 Senate testimony committing to fix performance issues at Oracle's expense. https://www.nextgov.com/modernization/2026/09/house-panel-subpoenas-oracle-heads-over-va-health-record-overhauls-ballooning-costs/415791/

[26] Military Times, "VA said electronic health record modernization would cost $10 billion. Now it's $48 billion," September 3, 2026. Source for: the total program estimate near $48 billion through 2031, roughly $37 billion to complete deployment and $11 billion in sustainment, against the original $10 billion, and the distinction between that lifecycle figure and the $27 billion contract ceiling. https://www.militarytimes.com/news/pentagon-congress/2026/09/03/va-said-electronic-health-record-modernization-would-cost-10-billion-now-its-48-billion/

Sources verified as of September 13, 2026. Items [1], [2], [6], [7], [8], [9], [10], [11], [12], [13], [14], [16], [21], [23], [24], [25] were re-checked against the cited page. Items [5], [15], [17], [18], [19], [20], [22], [26] were confirmed against primary sources in the September 13 fact-check.
