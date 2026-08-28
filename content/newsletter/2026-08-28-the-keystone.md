---
title: "The Keystone"
date: 2026-08-28
slug: the-keystone
description: "On October 3, 2025, three days after a Navy reservist finished more than 1,400 consecutive days on active duty, the Defense Health Agency told him he was no longer eligible for TRICARE, as determined by information in DEERS. Congress had deleted the words that disqualified him eight years earlier. The benefit he lost includes the dental coverage that decides, more than any other single factor, whether a reserve soldier can deploy."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "TRICARE"
  - "DEERS"
  - "Reserve Component"
  - "TAMP"
  - "Benefits Eligibility"
  - "Dental Readiness"
  - "Feliciano v. DOT"
  - "Duty Status Reform"
  - "Defense Health Program"
  - "Capture Strategy"
agencies:
  - "DHA"
  - "DoD"
  - "Navy"
  - "Army"
  - "VA"
  - "DMDC"
canonical_url: "https://missionmeetstech.com/newsletter/the-keystone/"
source: claude_newsletter_project
capture_corner_teaser: "This issue reads the authority chain and the artifacts that carry it. The companion Capture Corner works the money and the market: the three independent methods for pricing a 180-day TAMP period and where each one breaks, the forward and retroactive exposure ranges against the $15 million reprogramming threshold in the FY2026 act, why no reprogramming action has appeared, the FY2027 split of the Defense Health Program into the Combat and Operational Medicine Program and the new Private Sector Care Program account and what an unscored obligation does inside it, the eligibility provenance requirement that duty status consolidation will create across DEERS-dependent systems, and the questions to put to a contracting officer during market research on any benefits eligibility modernization work. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "A 180-day TAMP period prices out at $1,240 to $4,500 per member depending on which of three independent methods you use, and every method rests on a number the Department does not publish. Back out the statutory 28 percent premium, take CBO's $25 per person per day, or divide the Private Sector Care request by the non-Medicare beneficiary count, and the answers diverge by a factor of nearly four. Carry the method with the number or do not carry the number."
  - "Forward exposure runs roughly $50M to $465M a year gross, and the FY2026 act sets a $15,000,000 reprogramming threshold. Every scenario above the lowest crosses it, no TAMP action appears among implemented FY2026 reprogrammings, and ROA's August 20 question about which appropriation pays for this has no published answer. That gap resolves as a reprogramming with congressional notification, an FY2028 line, or an absorbed workload with no announcement, and only the first two are visible in a pipeline."
  - "The requirement nobody has written yet is eligibility provenance. Duty status consolidation would collapse 29 Reserve Component statuses into four with a briefing due January 31, 2027, which re-maps the authority values every DEERS-dependent benefit reads, and today the governing regulation resolves an empty field by presuming ineligibility. Rule externalization and versioning, determination audit trail with source-field lineage, retroactive re-adjudication against a historical rule set, null-value exception handling. Put that language in the capability statement before the requirement posts."
---

![A carved stone keystone stands on a dark pedestal with THE KEYSTONE cut into its face. Set into the stone is a glowing amber terminal window labeled DEERS ELIGIBILITY CODE, and the value field beneath it reads [EMPTY]. A jagged red crack splits the stone from that window down to the base. On the left, a cool teal and blue arch of circuitry runs into the keystone under a green tag reading CONGRESSIONAL LAW: 180 DAYS. On the right, an amber arch marked DEERS carries a red line out of the crack, and it falls away into a red tag reading RESERVIST BENEFITS. A dental mirror and a brass compass rest on the pedestal below. The law arrives on one side and the benefit fails on the other, because the field in the middle is empty.](/images/newsletter/2026-08-28/cover-the-keystone.png)

# The Keystone

*On October 3, 2025, three days after a Navy reservist finished more than 1,400 consecutive days on active duty, the Defense Health Agency told him he was no longer eligible for TRICARE, as determined by information in DEERS. Congress had deleted the words that disqualified him eight years earlier. The benefit he lost includes the dental coverage that decides, more than any other single factor, whether a reserve soldier can deploy.*

Friends,

Lieutenant Commander Anthony Gontarz enlisted in the Navy as a seaman on August 31, 2004, commissioned through officer candidate school, and joined the Selected Reserve in 2014. On November 15, 2021 he went back on active duty under Title 10, section 12301(d), assigned to the Military Sealift Command Ship Support Unit in Yokohama, Japan, and then on follow-on orders to the Naval Surface Warfare Center at Port Hueneme with no break in service in between. He picked up a Navy and Marine Corps Achievement Medal along the way and a Commendation Medal at the end of the Port Hueneme tour, and he separated on September 30, 2025, after more than 1,400 consecutive days. [1]

Three days later, the Defense Health Agency wrote to tell him he had been disenrolled from TRICARE effective the day he separated, because DHA's records indicated he was no longer eligible as determined by information in DEERS. [1]

He asked the Navy Reserve about it in October. The DEERS and RAPIDS project office told him his orders did not qualify, citing a 2008 manual. On October 28 he was told by phone that no further action was available to him, including no appeal to the Board for Correction of Naval Records. [1]

## The machine, in plain terms

Strip out the citations and this is a simple mechanism.

Congress promised that a reservist who serves more than 30 days on federal active duty gets 180 days of free medical and dental coverage on the way out. It is called the Transitional Assistance Management Program, and it covers the member and the family. To pay it, the Department has to decide who qualifies, and it answers that question by reading one field in a personnel database rather than by reading the orders.

The field is a project code in DEERS, the system of record for military health eligibility. Nobody types that code onto anybody's orders. RAND put it plainly: project codes are not written into activation orders, so they must be determined using a combination of other data fields. [18] The code gets derived after the fact.

Then comes the part that turns a data problem into a denial. The regulation governing TRICARE eligibility says that ineligibility may be presumed when the expected evidence is missing from the DEERS file. [5] An empty field is a no. A managed care contractor confirms the no against DEERS. And there is no appeals process for a database value, which is what Gontarz found out on the phone in October.

What follows is the story of which words that code was built from, when Congress changed those words, and how long the code went on enforcing the old ones.

## What 180 days of dental is for

TAMP covers medical and dental, and the dental half is where this stops being an administrative story.

A member on active duty for operational support carries TRICARE Prime dental for the length of those orders, which is the active-duty standard. [29] TAMP is the bridge that carries that coverage 180 days into civilian life, roughly the window a returning member needs to finish a course of treatment. Without it, a drilling reservist's option is the TRICARE Dental Program, which has a monthly premium, a deductible, copays, and an annual cap. The Army Surgeon General's assessment is that 12 percent of drilling soldiers enroll. [29]

Dental is the single largest reason a reserve soldier cannot deploy. Medical Readiness Reporting data cited by three Army dental officers puts it this way: of Army Reserve Component soldiers judged not medically or dentally ready to deploy, 60.5 percent are deficient in the dental requirement. [29]

The gap between the components is measured and current. Between May and August 2025, 5.1 percent of active duty members carried the lowest dental readiness classification against 9.9 percent of reserve members, with the Army Reserve highest at 12.6 percent. [30] The Army's own dental readiness goal is 95 percent. Army National Guard stood at 89.3 percent in June 2023, and Army Reserve at 81.6 percent. [29]

The bill comes due downrange. The Department told Senator Elizabeth Warren that dental emergencies account for 20 to 30 percent of all disease non-battle injuries during deployments, citing a 2024 analysis putting the rate at 264 per 1,000 deployed personnel per year. [30] Across Iraq and Afghanistan between May 2009 and December 2012 the measured rate ran 152 per 1,000 Army National Guard soldiers and 184 per 1,000 Army Reserve soldiers, and roughly 20 percent of those were severe enough to limit operational capability. [29] In theater the dental assets are thin and the logistics of reaching them are worse, which is why the treatment is supposed to happen at home.

The readiness programs that exist do not close this. The Army Selected Reserve Dental Readiness System and the Reserve Health Readiness Program pay to fix deployment-limiting conditions in soldiers who have not been alerted, and they pay for nothing routine or preventive. [29] They catch the emergency. TAMP is one of the few instruments covering the six months in which the cause gets treated.

## The second classification

DoD Instruction 1332.45 provides that a member in the two lowest dental readiness classes is not medically ready to deploy, and will not be reported in the non-deployable population. [31] Both halves sit in the same paragraph of the same issuance.

So in a late September 2025 memorandum to Senator Warren, the Department was able to report accurately that no service members are currently reported as nondeployable due to dental problems. [30] Those responses went out over the signature of Anthony J. Tata, the Under Secretary of War for Personnel and Readiness, and eleven months later the same signature dropped the DEERS coding requirement. [13][14][30]

A coding rule decided who kept dental coverage. A reporting rule decides whether the consequence ever shows up in the readiness numbers. Both are classification decisions, and neither one is in the statute.

## The sentence the Department wrote down in 2011

On September 15, 2011, Clifford L. Stanley, then Under Secretary of Defense for Personnel and Readiness, wrote to Senator Ron Wyden about TAMP. Wyden had written on September 13, the two had met on April 8, and the Department's review of how it assigned TAMP benefits to Reserve Component members finished at the end of August. Stanley attached a memorandum of the same date, addressed to the Service Secretaries, Health Affairs, Reserve Affairs, and the TRICARE Management Activity, with copies to the Defense Manpower Data Center and every Reserve chief. [8]

That memorandum fixed a start-date problem. If a qualifying period was followed by other active duty with no break in service, TAMP would begin at release from the whole run instead of expiring while the member was still serving. That is Gontarz's fact pattern in shape, and it did not reach him, because it only helped members who already had one qualifying period on the books.

The last paragraph is the one worth reading twice:

> An accurate and complete daily submission of personnel data for RC Service members performing active service required by Enclosure 8 is the keystone for ensuring TAMP eligibility. These data, reported to the RCCPDS, will be used for the timely assignment of TAMP health benefits maintained by the Defense Manpower Data Center in the Defense Enrollment Eligibility Reporting System. [8]

The Department told a United States senator, in writing, that a daily data feed was the keystone of a statutory health benefit. It named the governing manual and the personnel transaction file inside it. [8][9] That reporting line runs forward into DoD Manual 7730.69, effective September 1, 2023, whose file layouts list the call-up authorities by section number. [7]

Fifteen years later the same office fixed TAMP the same way, by memorandum, after a lawsuit instead of a letter from a senator. Neither instrument touched the regulation.

## What Congress did in 2017

Until 2017 the law asked what the service was for. A reservist qualified if the active duty was "in support of a contingency operation," and the regulation implementing it used those same words. So did Stanley's memorandum. [8]

The FY2018 National Defense Authorization Act changed the question being asked. Public Law 115-91, section 511(b), struck "in support of a contingency operation" out of the eligibility provision and replaced it with a list of the legal authorities a member can be called up under. [3] The old test asked about purpose. The new test asks which authority is on the orders.

One authority matters most here. Section 12301(d) is voluntary active duty, and it carries most of the reserve force's full-time work: active duty for operational support, active duty for special work, and the operational support billets that keep headquarters running. Congress did not name it in the new list. It qualifies through a catch-all reaching service under any other law "during a war or during a national emergency declared by the President or Congress." [4] The national emergency declared on September 14, 2001 has been renewed every year since. [1]

Congress kept the contingency language in the neighboring subparagraphs and removed it only from this one, which the class complaint reads as deliberate. [1][3]

So when the Navy told Gontarz his orders did not qualify unless written specifically per the Title 10 guidelines, it was applying the purpose test. Congress deleted that test in 2017. [1]

## Where the decision actually lived

Three documents carried the old words forward, and the statute is not one of them.

The regulation. Title 32 of the Code of Federal Regulations, section 199.3, still conditions Reserve Component eligibility on service in support of a contingency operation for more than 30 consecutive days. It was last amended in September 2015, two years before Congress rewrote the language it mirrors, and it reads the same way today. [5]

The policy manual. The TRICARE Policy Manual repeats the contingency condition and adds the operative instruction: coverage must be based on DEERS determinations, and contractors are responsible for confirming DEERS status. That language survived into the August 11, 2025 update. [6]

The coding table. DoD Manual 7730.69 controls which project codes may be entered in a member's active service file. The version effective September 1, 2023 assigns the reporting code for sections 12301(a), (b), and (g), 12302, 12304, and 688. Section 12301(d) is absent. So is section 12304b, the authority Congress named expressly in 2017. [7]

The Guard and Reserve carry 29 separate duty statuses, which the House Military Personnel Subcommittee has asked the Department to study consolidating into four. [25] Twenty-nine statuses is why one derived code could decide health coverage.

## Fifteen months after the Supreme Court answered

On April 30, 2025, the Supreme Court decided Feliciano v. Department of Transportation. Nick Feliciano was an FAA air traffic controller and a Coast Guard reservist serving under section 12301(d), and the question was whether the catch-all requires service to be substantively connected to a particular emergency, or only to overlap with a declared one. The Court held that overlap is enough, 5 to 4, Gorsuch writing. [10]

Feliciano was a differential pay case under a different title, so carrying it into health care eligibility took a step no court had taken. It was still the same catch-all and the same question. Between that decision and the August 10, 2026 memorandum, the coding screen stayed in place for fifteen months, and Gontarz separated inside that window.

## What the memorandum did, and what it left

On August 10, 2026, the Under Secretary of War for Personnel and Readiness signed a one-page memorandum removing the requirement that a Reserve Component member show the active duty was substantively connected to a war, a contingency operation, or a national emergency, and directing that DEERS coding be adjusted. Members denied on or after April 24, 2020 may seek reimbursement of premiums and out-of-pocket costs. [13][14][15]

Gontarz had an updated TAMP eligibility letter within eight days. [14]

The regulation is unamended, and no Federal Register action conforming it has appeared. [5] The policy manual carries the contingency language as of its last published change. [6] The memorandum itself has not been posted on war.gov, health.mil, the Washington Headquarters Services issuance site, or tricare.mil, so every quotation of it in circulation is somebody's account of a document the public cannot read. [13][15]

The retroactive process is an email inbox. The Reserve Organization of America, which sent the Under Secretary 38 questions on August 20, reports that the memorandum sets no acknowledgment standard, no adjudication timeline, and no appeal route, and identifies no point of contact above a DHA eligibility adjustment address. ROA also reads it as saying "at least 30 days" where the statute says "more than 30 days." [13] That is an interested party's rendering of an unpublished document, and it is all anyone outside the building has.

The burden runs the wrong direction. The Department is asking members separated as long as six years ago to produce receipts for a coding error the Department made. When VA and the Navy have been made to fix classwide errors before, the courts and settlements required the agency to go find the affected people and write to them. [11] An agency that knows which records it miscoded can query them.

## The date with no statute behind it

April 24, 2020 is six years before the complaint was filed. Six years is the default deadline for suing the federal government, counted backward from one plaintiff's filing date and applied to everybody. [12] The statute contains no such date, and ROA reports that the memorandum offers no basis for it. [13]

Two reservists denied under identical text for identical reasons now get different answers depending on which side of that line they fall on.

The law points the other way. The Supreme Court held in 2024 that this kind of claim does not start running until the person is actually injured, which would put each member's clock at that member's own denial. [12] And in June 2025, in Soto v. United States, the Court struck down an administratively imposed six-year cap on retroactive Combat-Related Special Compensation, 9 to 0. The Department re-imposed that cap by guidance in August 2025 and again in January 2026, and did not retract it until May 14, 2026, three months before this memorandum issued. [11]

The case is live. On the docket of Gontarz v. Hegseth, No. 1:26-cv-01396, before Judge Reggie B. Walton in the District of Columbia, there is no answer, no motion to dismiss, no mootness motion, and no ruling on class certification. Plaintiffs moved to certify the class on July 23, and the memorandum issued on August 10.

Counsel said they agreed to pause the case for 60 days while they assess whether the new policy addresses their claims, and that they have not agreed to dismiss. [2][15]

## The honest counterargument

Four defenses of the Department are real, and one of them is strong enough that this issue has to concede it before going further.

The Department moved fast and gave more than was asked. One hundred and eight days ran from complaint to memorandum, and in that window the government filed no answer and no merits defense of the coding rule. [2] The complaint states that the plaintiff and the proposed class seek no monetary damages. [1] The memorandum authorized reimbursement anyway, and the plaintiffs' own counsel called it what they were asking for. [15]

The regulation was a defensible reading, and this is the strongest point against everything above. When section 199.3(e)(1)(ii) was last amended in September 2015, it mirrored the statute exactly, and it became wrong by operation of a later amendment. What the 2017 amendment substituted was hard to apply: a cross-reference chain ending in a catch-all that sits inside Congress's own definition of "contingency operation." Feliciano split 5 to 4, and the split was scrambled, with Thomas dissenting joined by Alito, Kagan, and Jackson. The dissent argued that everything else named in the definition involves a genuine emergency, that a catch-all should reach only operations of the same kind, and that reading it as pure overlap would let any call-up during the 2001 emergency count as a contingency operation whether or not any contingency exists. [10] That is the Department's position stated better than the Department stated it. Anyone claiming the answer was obvious before April 30, 2025 has to reckon with the number four.

Memorandum first, rule second, is the faster path to relief. An agency may change this kind of rule without going through notice and comment, and the plaintiffs never claimed otherwise. [1][17] Conforming the regulation takes a proposed rule, a comment period, and a final rule. A reservist separating in October 2026 is helped by a memorandum now. And the unbudgeted-liability critique cuts both ways, since an agency that declines to fix a statutory entitlement until the fix is scored in a budget request is behaving exactly the way that produced the eight-and-a-half-year gap.

Three things survive all of that.

The regulation is still on the books, and it is what a court, a managed care support contractor, or a future administration reads. The April 24, 2020 line has no statutory foundation and the Department has not offered one.

And the Feliciano defense only covers the hard part. That dissent is about how broadly to read a catch-all, and it says nothing about section 12304b, which Congress wrote into the statute by name in 2017. The coding table that leaves 12304b out took effect September 1, 2023, nearly six years later. [7] A document written after Congress acted is harder to call a stale rule than a re-issued one. My read, marked as analysis.

## The numbers the Department does not publish

Reserve Component end strength for FY2026 was authorized at 773,400, and actual Selected Reserve strength on September 30, 2025 was 760,210. [23] Past that, the flow data does not exist in public. Separations from active duty by year, counts of members serving more than 30 consecutive days, breakouts by activation authority, and TAMP denial counts from FY2018 forward are absent from DMDC workforce reports, CRS products, the annual manpower profile, the most recent TRICARE program evaluation report, and the FY2026 and FY2027 justification books. ROA has formally asked for the denial counts and the total fiscal exposure. [13]

GAO published the shape of it in 2011. At the end of 2010, with a Selected Reserve of 858,997 and roughly 284,000 called to active duty, about 40,000 were enrolled in TAMP. [19] Five percent, at the peak of two wars.

The closest current proxy is DHA's FY2024 report to Congress, counting 188,185 activated Guard and Reserve beneficiaries and 286,402 activated dependents. [28] Cost per beneficiary is unpublished. [22] Any exposure figure in circulation, including one this newsletter could build, rests on unverified flow assumptions. [16]

What the FY2027 request does contain is a claimed $233 million in efficiencies from military tour lengths and reserve health readiness program reforms. [21] I searched the MHS FY2027 justification material for a TAMP line, a transitional health care line, or any Reserve Component eligibility expansion. There is none. [22] The Department is booking readiness savings in the program area where it just created an obligation it has not scored, and it is doing so with no enacted appropriation behind it: defense appropriations cleared full committee on June 24 with no floor action, and the two chambers hold unreconciled continuing resolutions running to December 4 and December 11. [24]

## What to do Monday

Inside DHA, Health Affairs, or Personnel and Readiness, the question that matters is the artifact. A memorandum asserts a fix; the CFR paragraph, the policy manual section, the coding table, and the public eligibility page are what a contractor and a court will read. Ask which of those four is scheduled for change, on what date, under whose signature. Then ask whether the Department will establish retroactive eligibility in DEERS so contractors can re-adjudicate the underlying claims directly, instead of asking six-year-old separatees to mail receipts to an inbox.

Inside a Reserve component personnel shop, pull the numbers before anyone asks for them. How many members separated from more than 30 days of federal active duty in the last six years, broken out by call-up authority, how many carried a project code that would have cleared the old screen, and what the dental readiness class distribution looks like for that population today. The Department has never published that breakout. Your shop holds the source records.

If you build or operate benefits eligibility systems for the government, the requirement is in the open. Every derived eligibility field in a system of record needs a provenance answer: what wrote this value, from which source fields, under which issuance, and what happens when the field is empty. Section 199.3(j)(2) presumes ineligibility from an empty field, and any system that inherits that presumption without an exception path will produce this outcome again.

And there is one thing any reservist can do this week. Pull your DD-214 or your orders, check the authority you were called under, and if you served more than 30 days and separated on or after April 24, 2020, put the reimbursement request in writing. The process has no published timeline, so start the clock.

## What this costs in practice

Roughly 50,000 Reserve Component members carry no health insurance at all, an overall uninsured rate of 7.7 percent that runs to 15.3 percent among enlisted members against 4.3 percent among officers. [27] TAMP exists because a member who loses coverage on the day the orders end stops going to appointments, and the appointments are where deployability is manufactured.

The Inspector General audited DEERS reliability in 2023 and found the beneficiary fields supporting eligibility generally complete, while inconsistent guidance produced unreliable contact data. Two admissions in it matter here: DMDC said correcting inaccurate dates of birth was not cost-effective, and DMDC officials acknowledged that incomplete data caused beneficiaries to miss pharmacy benefits and incur out-of-pocket costs. Two recommendations remain unresolved. [20] The audit never examined the contingency-operation code.

A live deadline sits on the same system right now. Army MILPER Message 26-280, dated August 21, 2026, gives soldiers until November 1 to get two identity documents scanned into DEERS, warning of interruption in the soldier's DEERS benefits. [26] Ten weeks out.

Somebody separates in October. The orders were written under 12301(d), the way most operational support orders are written. Nobody types a project code, because project codes are derived. The memorandum says that no longer matters, and the memorandum is not published anywhere that person can read it. The regulation is published, and it says what it said in 2015.

In 2011 the Department wrote a sentence to a senator naming the keystone of the whole arrangement, and it was accurate. It stayed accurate for fifteen years. A statutory entitlement should not have a keystone in a daily data feed.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

---

## MMT Premium

This issue reads the authority chain and the artifacts that carry it. The companion Capture Corner works the money and the market: the three independent methods for pricing a 180-day TAMP period and where each one breaks, the forward and retroactive exposure ranges against the $15 million reprogramming threshold in the FY2026 act, why no reprogramming action has appeared, the FY2027 split of the Defense Health Program into the Combat and Operational Medicine Program and the new Private Sector Care Program account and what an unscored obligation does inside it, the eligibility-provenance requirement that duty status consolidation will create across DEERS-dependent systems, and the four questions to put to a contracting officer during market research on any benefits eligibility modernization work.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

---

## Sources

[1] Class Action Complaint, *Gontarz v. Hegseth*, No. 1:26-cv-01396 (D.D.C., filed April 24, 2026), National Veterans Legal Services Program and Dechert LLP. Source for: Gontarz's service history at ¶¶35–37; the November 15, 2021 start of orders under 10 U.S.C. § 12301(d) and the Military Sealift Command Yokohama and Naval Surface Warfare Center Port Hueneme assignments at ¶¶38–39; the September 30, 2025 separation after more than 1,400 consecutive days at ¶¶6, 40–41, 63; the October 3, 2025 DHA disenrollment letter and its DEERS basis at ¶41; the October 21–22 Navy Reserve DEERS/RAPIDS response and its citation to the 2008 manual at ¶¶42–43; the October 28 denial of appellate review including no BCNR route at ¶44; the reading of the 2017 amendment as deliberate at ¶26; the governing artifacts at ¶¶28–30; the two counts under 5 U.S.C. § 706(2)(A) and (C) at ¶¶62–67; and the statement that the plaintiff and proposed class seek no monetary damages at ¶54. Note that the complaint cites the DoDM 7730.69 coding table by a table number that does not match the current manual. https://nvlsp.org/wp-content/uploads/TAMP-Class-Action-Complaint.pdf

[2] CourtListener docket 73240279, *Gontarz v. Hegseth*, No. 1:26-cv-01396 (D.D.C.). Source for: the April 24, 2026 filing, the April 27 assignment to Judge Reggie B. Walton, the July 23 motion to appoint lead counsel and certify the class, the August 13 motion to stay and the August 14 order, and the absence of any answer, motion to dismiss, mootness motion, or class certification ruling as of the last update on August 14, 2026. The terms of the August 14 order are not in the public docket text. https://www.courtlistener.com/docket/73240279/gontarz-v-hegseth/

[3] 10 U.S.C. § 1145 and its amendment notes. Source for the current text of subsection (a)(2)(B), the 180-day transitional period at (a)(4), and the note recording that Pub. L. 115-91 § 511(b) substituted "under section 12304b of this title or a provision of law referred to in section 101(a)(13)(B) of this title" for "in support of a contingency operation." https://www.govinfo.gov/content/pkg/USCODE-2023-title10/html/USCODE-2023-title10-subtitleA-partII-chap58-sec1145.htm

[4] 10 U.S.C. § 101(a)(13). Source for the enumerated call-up authorities and the catch-all reaching service under any other provision of law during a war or during a national emergency declared by the President or Congress, and for the absence of § 12301(d) from the enumerated list. https://www.law.cornell.edu/uscode/text/10/101

[5] 32 C.F.R. § 199.3. Source for subsection (e)(1)(ii) conditioning Reserve Component eligibility on active duty in support of a contingency operation for more than 30 consecutive days; subsection (a) providing that the program relies primarily on DEERS for eligibility verification; and subsection (j)(2) providing that ineligibility may be presumed in the absence of prescribed eligibility evidence in the DEERS file. The provision was last amended September 15, 2015. https://www.law.cornell.edu/cfr/text/32/199.3

[6] TRICARE Policy Manual 6010.63-M, Chapter 10, Section 5.1, as of the August 11, 2025 change. Source for the Reserve Component eligibility paragraph conditioning coverage on service in support of a contingency operation or a preplanned mission, and for the provisions that coverage must be based on DEERS determinations and that contractors are responsible for confirming DEERS eligibility status. https://manuals.health.mil/pages/DisplayManualHtmlFile/2025-08-11/AsOf/TP15/C10S5_1.html

[7] DoD Manual 7730.69, Volume 1, "Uniformed Services Human Resources Information," effective September 1, 2023. Source for the project code and reporting code tables restricting entries to §§ 12301(a), (b), and (g), 12302, 12304, and 688, and for the absence of § 12301(d) and § 12304b from those tables. https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodm/773069_vol1.pdf

[8] Clifford L. Stanley, Under Secretary of Defense for Personnel and Readiness, letter to Senator Ron Wyden and attached memorandum, "Clarification of Procedures to Identify Eligibility for Assignment of Transition Assistance Management Program (TAMP) Health Benefits," September 15, 2011. Source for: the April 8 meeting and Wyden's September 13 letter; the departmental review completed at the end of August 2011; the composite-period start-date change; the statement that eligibility is based on completion of active duty for more than 30 days in support of contingency operations pursuant to 10 U.S.C. § 101(a)(13)(B); the alignment to S. 1253 § 712; the addressee and copy list; and the quoted passage identifying accurate daily personnel data submission as the keystone for ensuring TAMP eligibility, reported to the RCCPDS and used by the Defense Manpower Data Center in DEERS. Document obtained directly. https://www.wyden.senate.gov/download/dod-letter-addressing-tamp-policy-concerns

[9] DoD Manual 7730.54-M, Volume 1, "Reserve Components Common Personnel Data Systems (RCCPDS): Reporting Procedures," May 27, 2011, and the RC Active Service Transaction File DD-RA(D)2170 described in it. Cited in the 2011 memorandum at [8]. The reporting line runs forward into DoDM 7730.69 at [7]; a formal cancellation notice was not located, so this is stated as lineage rather than supersession. https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/773054p.pdf

[10] *Feliciano v. Department of Transportation*, 605 U.S. 38 (2025), No. 23-861, decided April 30, 2025. Source for the holding that service under the § 101(a)(13)(B) catch-all need only temporally coincide with a declared national emergency; the 5–4 split with Gorsuch writing and Thomas dissenting joined by Alito, Kagan, and Jackson; the dissent's reasoning that the enumerated companions sound in exigency and that a purely temporal construction would let any operation requiring a call to active duty qualify; and the case's posture as a differential pay case under 5 U.S.C. § 5538 rather than a § 1145 case. Subsequent MSPB application appears in the MSPB Case Report of January 23, 2026. https://www.law.cornell.edu/supremecourt/text/23-861

[11] *Soto v. United States*, 605 U.S. 360 (2025), decided June 12, 2025, 9–0, striking an administratively imposed six-year cap on retroactive Combat-Related Special Compensation; and NVLSP's class action practice page, source for the Department's re-imposition of that cap by interim guidance dated August 20, 2025 and clarifying guidance dated January 30, 2026, its retraction on May 14, 2026, and for the *Nehmer*, *Springs v. Del Toro*, and *Beaudette v. McDonough* remedies requiring agencies to identify, review, or notify affected claimants. https://nvlsp.org/what-we-do/class-actions/

[12] *Corner Post, Inc. v. Board of Governors*, 603 U.S. 799 (2024), holding that an APA claim does not accrue until the plaintiff is injured by final agency action; and 28 U.S.C. § 2401(a), the six-year default limitations period for civil actions against the United States, as summarized in CRS Legal Sidebar LSB11197. https://www.congress.gov/crs-product/LSB11197

[13] Reserve Organization of America, TAMP resource site. Source for ROA's rendering of the August 10, 2026 memorandum's operative holdings, including the "at least 30 days" and § 101(a)(13) discrepancies against the statute; the absence of any stated basis for the April 24, 2020 date; the observation that the memorandum sets no acknowledgment standard, adjudication timeline, or appeal route and identifies no point of contact above the DHA eligibility adjustment mailbox; the 38 questions in seven categories sent to the Under Secretary on August 20, 2026, including whether the Department will initiate rulemaking to conform 32 C.F.R. § 199.3(e)(1)(ii) and what the denial counts and fiscal exposure have been since FY2018; and the September 15, 2015 last-amendment date for the regulation. This is an interested party's account of a memorandum that has not been published; treat it accordingly. The tricare.mil TAMP eligibility page could not be re-verified on August 28, 2026 due to site blocking; the prior retrieval showed the contingency requirement with a last-updated date of May 15, 2025. https://tamp.roa.org/

[14] National Veterans Legal Services Program, "New Military Policy Expands Entitlement of Reservists to Transitional Assistance Management Program Benefits," August 2026. Source for the description of the August 10, 2026 policy change, the removal of the substantive-connection showing, the direction to adjust DEERS coding, the reimbursement provision, and the statement that Gontarz received an updated TAMP eligibility letter. https://nvlsp.org/new-military-policy-expands-entitlement-of-reservists-to-transitional-assistance-management-program-benefits/

[15] Federal News Network, "DoD changes transitional health care eligibility for reservists following lawsuit," August 2026. Source for the memorandum's date and effect as described to the outlet, the characterization that the memorandum was shared with the outlet rather than published, and counsel Rochelle Bobroff's statements that the plaintiffs agreed to pause the case for 60 days, have not agreed to dismiss, and have not made a final decision. https://federalnewsnetwork.com/defense-news/2026/08/dod-changes-transitional-health-care-eligibility-for-reservists-following-lawsuit/

[16] Task & Purpose, "Sailor's lawsuit leads to expanded healthcare for Reserve, Guard troops," August 2026, and Stars and Stripes, "Class action case challenges DOD benefits restrictions for Reserve and National Guard members," May 4, 2026. Source for the Department's posture that it does not comment on ongoing litigation in both May and August, the statement that officials confirmed the memorandum without giving a reason for the change, and for the scale claims attributed to Steve Minyard, a former advisor to the Assistant Secretary of Defense for Manpower and Reserve Affairs now serving as a program director at the Reserve Organization of America. https://taskandpurpose.com/news/reserve-national-guard-healthcare-expansion/

[17] *Perez v. Mortgage Bankers Association*, 575 U.S. 92 (2015), holding that an agency may amend or repeal an interpretive rule without notice-and-comment rulemaking. https://supreme.justia.com/cases/federal/us/575/92/

[18] RAND Corporation, Report RR-A1228-1, p. 19. Source for the finding that DEERS project codes are not written into activation orders and must be determined using a combination of other data fields. https://www.rand.org/content/dam/rand/pubs/research_reports/RRA1200/RRA1228-1/RAND_RRA1228-1.pdf

[19] Government Accountability Office, GAO-11-551. Source for the statement that members activated other than in support of a contingency operation are not eligible for TAMP, and for the December 31, 2010 figures: Selected Reserve 858,997, approximately 284,000 called to active duty, and approximately 40,000 enrolled in TAMP. https://www.gao.gov/assets/a319195.html

[20] Department of Defense Office of Inspector General, DODIG-2023-089, "Management Advisory: Reliability of the Defense Enrollment Eligibility Reporting System." Source for the finding that beneficiary fields supporting eligibility were generally complete while contact data was unreliable; DMDC's statement that correcting inaccurate dates of birth was not cost-effective; DMDC officials' acknowledgment that incomplete data caused beneficiaries to miss pharmacy benefits and incur out-of-pocket costs; and the two unresolved recommendations. https://www.oversight.gov/sites/default/files/documents/reports/2023-07/DODIG-2023-089.pdf

[21] Department of War, Office of the Under Secretary (Comptroller), "FY2027 Budget Request Overview Book." Source for the $233 million in claimed FY2027 efficiencies from military tour lengths and reserve health readiness program reforms. https://comptroller.war.gov/Portals/45/Documents/defbudget/FY2027/FY2027_Budget_Request_Overview_Book.pdf

[22] "Military Health System Fiscal Year 2027 Budget Estimates, Volume 1," Combat and Operational Medicine Program and Private Sector Care Program. Source for the absence of any TAMP, transitional health care, or Reserve Component eligibility expansion line, and for medical cost per member per year appearing only as a growth rate. https://comptroller.war.gov/Portals/45/Documents/defbudget/FY2027/budget_justification/pdfs/09_Military_Health_System/MHS_PB27_J-Book-Vol1-COMP_PSCP.pdf

[23] Congressional Research Service, IF10540, and Senate Armed Services Committee FY2027 report language. Source for the FY2026 authorized Reserve Component end strength of 773,400 across seven components, actual DoD Selected Reserve strength of 760,210 on September 30, 2025, and the absence of a published Ready Reserve breakout since July 31, 2021. https://www.congress.gov/crs_external_products/IF/PDF/IF10540/IF10540.22.pdf

[24] Center for Strategic and International Studies, FY2027 defense appropriations tracker, and CRS Insight IN12704. Source for the June 24, 2026 full committee action on defense appropriations with no floor or Senate committee action; the July 22, 2026 House passage of the FY2027 NDAA 216 to 212; the July 14, 2026 cloture failure on the Senate companion, 50 to 46; the unreconciled continuing resolutions running to December 4 and December 11; and the count of 21 of 27 fiscal years since FY2000 begun under a continuing resolution or shutdown. https://www.csis.org/analysis/tracking-fy-2027-defense-appropriations-reconciliation-and-supplemental-request

[25] Military Officers Association of America, "NDAA First Look: TRICARE Coverage Changes, Duty Status Reform, and More," 2026, reporting the House Military Personnel Subcommittee request for a briefing by January 31, 2027 on consolidating 29 Reserve Component duty statuses into four. https://www.moaa.org/content/publications-and-media/news-articles/2026-news-articles/benefits/ndaa-first-look-tricare-coverage-changes,-duty-status-reform,-and-more/

[26] Army MILPER Message 26-280, dated August 21, 2026, requiring two identity documents scanned into DEERS by November 1, 2026 and warning of interruption in the soldier's DEERS benefits. https://www.armyng.com/milper/26-280

[27] "Improving Reserve Component Medical Readiness," DTIC AD1200223. Source for the 7.7 percent overall Reserve Component uninsured rate, the 14.3 percent Marine Corps Reserve and 15.3 percent enlisted figures against 4.3 percent for officers, the approximate 50,000 uninsured members, and the Army Reserve fully-medically-ready rate of 62 percent. https://apps.dtic.mil/sti/trecms/pdf/AD1200223.pdf

[28] Defense Health Agency, "Annual Evaluation of the TRICARE Program, Fiscal Year 2024," report to Congress. Source for 188,185 activated Guard and Reserve beneficiaries and 286,402 activated dependents, and for the fact that only members on orders of more than 30 days appear in that category. FY2025 and FY2026 equivalents have not been published. https://www.health.mil/Reference-Center/Reports/2025/09/23/Annual-Evaluation-of-the-TRICARE-Program-FY24

[29] Joel A. Bachman, T. Robert Tempel Jr., and Elizabeth R. Oates, "Army Reserve Component Dental Health and Readiness," North Carolina Medical Journal, Vol. 84, Issue 6, November 6, 2023. Source for: the Medical Readiness Reporting finding that 60.5 percent of Army Reserve Component soldiers deemed medically or dentally not ready to deploy are deficient in the dental requirement; the statement that full-time AGR, active duty for operational support, and deployed and alerted soldiers carry TRICARE Prime dental; the Army Surgeon General's assessment that 12 percent of drilling soldiers enroll in the TRICARE Dental Program and that program's premium, deductible, copay, and annual maximum structure; June 2023 dental readiness of 89.3 percent Army National Guard and 81.6 percent Army Reserve against the Army's 95 percent goal; the finding that ASDRS and RHRP fund treatment of deployment-limiting conditions for non-alerted soldiers and do not fund routine or preventive care; and the D-DNBI rates of 152 per 1,000 Army National Guard and 184 per 1,000 Army Reserve soldiers deployed annually to Iraq and Afghanistan between May 2009 and December 2012, of which roughly 20 percent were severe enough to limit operational capabilities. https://ncmedicaljournal.com/article/89202-army-reserve-component-dental-health-and-readiness

[30] Karen Jowers, "Troops' dental readiness showing some improvement, some decay," Military Times, November 7, 2025, reporting on a late September 2025 Department memorandum to Senator Elizabeth Warren. Source for: the May to August 2025 figures of 5.1 percent Class 4 among active duty members against 9.9 percent among reserve members, with Army Reserve highest at 12.6 percent; the statement that no service members are currently reported as nondeployable due to dental problems and that the responses were provided by Anthony J. Tata, whose title Military Times renders as under secretary of defense for personnel and readiness and who is referred to here by the Department of War designation used for the August 10, 2026 memorandum; the 2018 reporting change under which Class 3 and Class 4 members are categorized as not medically ready to deploy without appearing in the nondeployable population; and the Department's statement that dental emergencies account for 20 to 30 percent of all disease non-battle injuries during deployments, citing a 2024 analysis of 264 dental emergencies per 1,000 deployed personnel per year. https://www.militarytimes.com/pay-benefits/military-benefits/health-care/2025/11/07/troops-dental-readiness-showing-some-improvement-some-decay/

[31] DoD Instruction 1332.45, "Retention Determinations for Non-Deployable Service Members." Source for the provision that service members whose dental readiness assessment is classified as Dental Class 3 or Dental Class 4 are not medically ready to deploy and will not be reported in the non-deployable population. https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/133245p.pdf

Sources verified as of August 28, 2026.
