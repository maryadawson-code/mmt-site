---
title: "A Plate Read Launches an Aircraft"
date: 2026-08-11
slug: a-plate-read-launches-an-aircraft
description: "Flock's drone lifts off a dock on three triggers, and the third is a license plate hit. VA has bought the plate readers. The records notice that governs VA Police data was rewritten from top to bottom in April 2024 and does not contain the word camera."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "License Plate Readers"
  - "Drone as First Responder"
  - "VA Police"
  - "Privacy Act"
  - "Flock Safety"
  - "Chatrie v. United States"
  - "Fourth Amendment"
  - "Physical Security"
  - "Surveillance"
  - "Autonomous Weapons"
  - "Capture Strategy"
agencies:
  - "VA"
  - "DoW"
  - "Interior"
  - "DHS"
canonical_url: "https://missionmeetstech.com/newsletter/a-plate-read-launches-an-aircraft/"
source: claude_newsletter_project
capture_corner_teaser: "This issue reads the documents and the trajectory. The companion Capture Corner works the buy: which federal and state grant programs now pay for plate readers and drone-as-first-responder systems, where false-positive acceptance criteria become a protestable term, the audit-log language to demand as a deliverable instead of a reported feature, the data ownership and termination clauses worth pricing before award, the retention-period language that stopped being a privacy control on June 29, and the federal-access opt-out that has to be a contract term because a setting is not a control. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "Where the money comes from. The FY2026 NDAA made unmanned aircraft systems and counter-UAS grant-eligible under the Omnibus Crime Control and Safe Streets Act, routing plate-reader and drone buys through DOJ Byrne JAG, COPS, and DHS/FEMA HSGP. That converts a local surveillance purchase into a federally reimbursable line item, and the no-cost pilot that converts to a paid multi-year contract unless the buyer withdraws is how incumbency forms outside a federal program's view."
  - "The six terms to price before award. Audit-log export as a deliverable rather than a vendor-generated report, enumerated query authorities, a federal-access opt-out written as a contract term instead of a setting, data ownership and certified deletion at termination, retention as a records provision, and a false-positive threshold in the acceptance criteria. Every one has a documented failure behind it, and the false-positive term is the protestable one."
  - "What Chatrie changed, and the name most competitive files have wrong. The June 29 decision took retention windows out of service as a privacy control, so a five-year DFR program without a change-in-law clause is taking a regulatory position you were not paid to take. And SignalTrace device-signal collection is Leonardo's, not Flock's, so a requirement aimed at the wrong vendor is worse than no requirement."
---

![A pole-mounted automated license plate reader camera photographs a California plate reading 7ABC123 in the foreground at dusk, while an autonomous quad-rotor drone lifts off from a weatherproof dock at right, a glowing data line arcing between them over a hillside city grid of lights and a faint network mesh in the sky. The image shows a plate read triggering an aircraft.](/images/newsletter/2026-08-11/cover-a-plate-read-launches-an-aircraft.png)

# A Plate Read Launches an Aircraft

*Flock's drone lifts off a dock on three triggers, and the third is a license plate hit. VA has bought the plate readers. The records notice that governs VA Police data was rewritten from top to bottom in April 2024 and does not contain the word camera.*

Friends,

Flock Safety sells an autonomous drone called Alpha, and per the company's own product page an operator deploys it from a weatherproof dock to the coordinates of a 911 call, a gunshot detection alert, or a license plate reader hit. [1]

The third trigger is the one that matters. A camera on a pole photographs a car, software matches the plate against a list, an alert reaches an operator, and the operator taps a phone that sends an aircraft toward the coordinates at sixty miles an hour, where it streams thermal and high-definition video and reads plates from as high as two thousand feet, feeding those reads back into the same hot lists the pole-mounted cameras already populate. [1] There is a person in that chain, and the tap is what the architecture calls human control, which is a claim worth testing before anyone builds more of it.

The Department of Veterans Affairs has bought license plate readers on that platform, two contracts at named facilities, one in 2023 and one renewed last September. [2] The document that is supposed to govern what VA Police collect was republished in its entirety on April 4, 2024, at 89 FR 23638, and it does not contain the word camera. [3]

## What the cameras do, and what they do not

Flock Safety is an Atlanta company founded in 2017 that sells solar-powered, pole-mounted plate readers to police departments, homeowner associations, school districts, and hospitals. More than five thousand law enforcement agencies use the platform. [4] The device photographs every vehicle that passes and records what the company calls a vehicle fingerprint: make, model, color, roof rack, bumper damage, decals. Images go to the company's cloud, where the buying agency searches them and, depending on a setting, other agencies search them too. One camera at one intersection is an investigative tool, while five thousand agencies on one searchable platform is a national record of vehicle movement that got there one municipal contract at a time.

Which brings up the claim circulating on every feed this month, the one that holds that Flock cameras sniff the Bluetooth and Wi-Fi radios in your pocket and tie your phone to your plate. It is mostly wrong, and the accurate version is worse. The product that does what people think Flock is doing is called SignalTrace, and it belongs to Leonardo, the defense contractor, sold under its ELSAG plate-reader brand. Joseph Cox reported it for 404 Media on June 8, 2026, from a Leonardo product sheet: sensors added to plate readers that collect Bluetooth, Wi-Fi, and RFID identifiers from phones, wearables, and vehicle systems, then link devices that consistently travel together to a plate and a timestamped location. [5] Leonardo's US arm holds contracts with US Special Operations Command and GSA. [5]

Flock cameras do emit Bluetooth and Wi-Fi. That signal is the unit reporting its own battery health and the field radio an installer uses to aim it, and it is precisely how privacy researchers have mapped where the cameras are. [6] The radios point outward. Getting this backwards matters, because a buyer who writes a contract term banning device collection from a vendor that does not do device collection has bought nothing, while the vendor that does sell it goes unnamed in the requirement.

What Flock does sell is the other half of the same idea. Nova is a people-lookup platform built to move from a plate to a person and then to that person's relatives and associates, running roughly twenty data sources an agency can toggle. [7] After reporting on internal dissent about breached data, Flock stated in May 2025 that Nova supplies public records, open-source intelligence, and plate reader data, and would not supply dark web data. [8] An independent analysis of the Nova codebase later reported finding a search type built for exactly that. [9] That dispute is unresolved in public, and it belongs in this issue as unresolved.

One more cuts the other way. In July 2026 Flock ended a pilot that used its acoustic devices to detect signs of human distress, [10] which is a vendor responding to governance pressure and belongs in a piece otherwise spent on what governance failed to specify.

## The practice

In May 2025, according to the Oxnard Police Department's own statement on its audit, the VA Police Department at Loma Linda Medical Center ran two nationwide queries that reached Oxnard's plate data. [11] Oxnard had set its system to California only when the cameras went in, in December 2023. A vendor-enabled nationwide query capability sat above that setting and reached through it. Oxnard learned about the queries from an audit more than a year later, noted that both were tied to criminal investigations with no connection to immigration enforcement, and suspended all nineteen of its fixed cameras. Its system had absorbed more than five million queries in 2025. [11]

Pasadena is the harder instance.

VA Police queried the Pasadena Police Department's plate reader database twice. Pasadena initially reported that no federal agency had touched its data, then corrected the record. The reason for the original error, per NBC News reporting cited in local coverage, is that Flock had the VA agency classified in its own system as a state agency. [12] That label lived inside a vendor's access-control metadata, where it decided which agencies a city believed had reached its records, so Pasadena's public accounting of federal access was wrong because the vendor's label was wrong, and Pasadena had no way to see the label.

The pattern extends past those two cities. Ventura County's Sheriff disabled the National Lookup feature in June 2023 and logged roughly 364,000 out-of-state queries in a single month afterward. [6] San Francisco's audit found federal and out-of-state agencies had queried the city's cameras 1.6 million times across seven months. [13] Three jurisdictions set a restriction, and in all three the restriction turned out to be a preference the platform's architecture did not enforce. Flock's position, stated in January, is that sharing with federal agencies is disabled by default and that any federal access must be explicitly granted by the local customer and comply with federal law. [14] Set that next to Oxnard, which had chosen California only, and Pasadena, which did not know a federal agency had been in its data until it corrected its own public statement. Each of those departments could have shown you a policy. The control was a sharing default, and a sharing default is a product decision that a contract either specifies or leaves to the vendor.

## The document

VA maintains a published Privacy Act system of records called Police and Security Records-VA, numbered 103VA07B, owned by the Office of Security and Law Enforcement inside the Office of Operations, Security, and Preparedness. [15] A full republication is the moment an agency states on the record what it collects and who may receive it. VA did that in April 2024, nine months after buying a plate reader in July 2023. [2][3]

Start with who the notice says it covers, because that is a closed list of seven categories and every one of them requires something to have happened. A complainant, witness, victim, or subject of an investigation of a violation on VA property. A witness or victim in a police response to a missing patient. Someone involved in a traffic accident on the grounds, someone who registered a motor vehicle with VA Police, someone whose property was confiscated or held for safekeeping, someone for whom an identification card was prepared. [3] A veteran who drives into the lot to keep an appointment is none of those seven.

The categories of records run to thirteen items and describe a filing cabinet: digital video and security surveillance television recordings, on-station vehicle registration records used for identifying vehicle owners at a facility, motor vehicle registrations with driver's license and insurance data. [3] Photographs appear exactly once, at item seven, described as photographs of any scenes pertinent to an incident or investigation. [3]

The retrieval provision runs one line. Records are retrieved by name, by partial or full social security number, or by other personal identifiers. [3] A plate capture is retrieved by plate, by time, and by place, which is how a query network works and is not how this notice says this system works.

No routine use in the notice contemplates a commercial nationwide query network. The nearest is Routine Use 4, which permits disclosure to federal, state, local, territorial, tribal, or foreign law enforcement authorities, provided the disclosure is limited to information that indicates a violation or potential violation of law, and which then states that disclosure of veterans' names and addresses under it must comply with 38 U.S.C. 5701. [3] Read the limiter. A database that answers any authorized query about any vehicle is not a disclosure limited to information indicating a violation, and the notice writes 5701 into the routine use itself instead of leaving it to be inferred.

103VA07B does not say camera. It does not say drone, aircraft, unmanned, or aerial either. [3]

All of that is checkable in ninety seconds at govinfo.gov. None of it makes the collection unlawful, and four real counters get their turn below. The finding is a gap between a document and a practice, which is a smaller claim than illegality and a considerably harder one to wave away.

## What is different about a hospital lot

Flock Group Inc. holds three prime contract awards in the federal record: $231,600 to Interior in September 2025 for US Park Police deployment around Washington, and VA's two, $44,450 in July 2023 and $21,000 in September 2025. [2] The platform has held FedRAMP Certified status at 20x Class B, the Low baseline, since July 2025. [16] Flock's public position is that it has no contracts with ICE or DHS sub agencies, which is accurate and bounded. [17] VA and Interior are neither. Those contracts buy cameras at named facilities and do not buy a nationwide network, because network reach is a property of the platform, arrives with the product, and is governed by settings. Anyone writing that $65,450 purchased VA a seat in a surveillance apparatus has the mechanism pointed the wrong way.

What changes at a VA medical center is the ground the camera watches.

A plate read on an interstate records that a vehicle passed a point. A plate read in a medical center lot, repeated across weeks, describes a pattern of visits to a treatment facility. That distinction is why VA records law exists as a separate body of law. 38 U.S.C. 5701 protects the names and addresses of veterans seeking care. 38 U.S.C. 7332 goes further, making confidential the records of identity, diagnosis, prognosis, or treatment maintained in connection with any VA program relating to drug abuse, alcoholism or alcohol abuse, HIV infection, or sickle cell anemia, and it does so notwithstanding 5701. [18] Subsection (c) is the sharp one. No record covered by 7332 may be used to initiate or substantiate criminal charges against a patient, or to conduct an investigation of one, absent a court order. [18]

This sits outside HIPAA, and the exclusion is written down. 42 CFR Part 2 states that its rules do not apply to substance use disorder information maintained in connection with VA's provision of hospital care, and routes those records to 38 U.S.C. 7332, [19] and VA's own privacy training tells staff that VHA may disclose health information to law enforcement without authorization while excluding 7332-protected information. [20] VA's implementing regulations do carve out law enforcement communications, and the carve-out has boundaries in its own text: disclosures directly related to a patient's commission of a crime on the premises of the facility, limited to the circumstances of the incident. [21] A nationwide plate query executed from a VA medical center is not, on its face, limited to the circumstances of an incident on the premises.

## The floor moved in June

Six weeks ago the Supreme Court decided its first digital surveillance case since Carpenter, and almost nothing in the plate reader world has moved in response. In Chatrie v. United States, decided June 29, 2026, the Court held 6 to 3, in an opinion by Justice Kagan, that police conduct a Fourth Amendment search when they acquire a person's cell-phone location history from Google, because a person has a reasonable expectation of privacy in that information. [22] The government had argued that two hours of location data fell outside the Fourth Amendment. The Court rejected the premise that a short window is a zone the Constitution does not reach, and did so while the data sat on a third party's servers. [22] Gorsuch, concurring in the judgment, would have treated location data as the user's own effects; Alito dissented, warning the majority's rule has no obvious stopping point. [23][22]

The plate reader cases sit awkwardly beside that. In January, Judge Mark Davis of the Eastern District of Virginia granted summary judgment to the City of Norfolk over its 176-camera Flock network, reasoning across fifty-one pages that a rolling 21-day retention window and roughly seventy-five camera clusters did not capture enough of a person's life to be the exhaustive surveillance Carpenter contemplated. [24] Davis wrote that plate reader surveillance could become too intrusive at some point, and that in Norfolk the answer was not today. [25] The complaint in that case alleges the cameras logged one plaintiff's location 849 times across roughly five months. [26]

Schmidt v. City of Norfolk is now at the Fourth Circuit, which is the court Chatrie came out of. After the Supreme Court ruled, Norfolk asked for additional time to respond to it, and the Institute for Justice reads the decision as shifting the analysis toward what a system is capable of collecting instead of what officers pulled in a given case. [26] Oral argument is expected late this year or early next. The duration theory holding the district court opinion up is the argument the Supreme Court declined to endorse six weeks ago, and the parties are briefing that right now.

The limit matters more than the holding does. Chatrie is about data a person generates on a device he carries, held by a company he chose, which the Court described as functioning like a personal journal of movements that the user consults and can edit. A plate read is none of that. It is produced by a camera the driver never touched, held by a vendor the driver never selected, recording a plate the state requires be displayed in public. A court could distinguish it in a paragraph, and some will.

What survives the distinction is the reasoning about time. If two hours of movement data is inside the Fourth Amendment, a retention window is no longer a safe harbor, and every ALPR defense built on how briefly the data is kept now rests on ground the Court has moved. That is a live question in litigation and a settled one in acquisition: a requirement that treats a retention period as the privacy control is a requirement written before June 29.

Congress is moving on the federal access question from an angle worth noticing. On July 15, Representative Keith Self, a Texas Republican, introduced the Protecting Rights in Video and Equipment Acquired Discovery Act, which would require a warrant before federal law enforcement queries state or local surveillance data, purge warrant-obtained data after thirty days, direct a federal list of covered surveillance technologies, and bar federal funds from buying or installing them, with exceptions. [27] It sits in House Judiciary and House Oversight. Self's framing was four words: get a warrant. [28]

Set the funding provision against the three contracts above. Federal money bought plate readers at a VA medical center and for the US Park Police, and a pending bill would put that category on a list and restrict the money paying for it. Whatever happens to the bill, a federal list of covered surveillance technologies is a procurement instrument before it is a privacy one, which makes the designation mechanism the part a program office should be watching.

## The case against this piece

Four counters, and all four have weight.

The first is item seven itself, photographs of any scenes pertinent to an incident or investigation. [3] A plate image is a photograph and a parking lot is a scene, so read generously, that item stretches over a camera. Read as written, the qualifier does the work, because a photograph pertinent to an incident presumes an incident, and a plate reader photographs every car whether or not anything has happened.

The second is that Record Source Categories in 103VA07B includes other law enforcement agencies, [3] which is true and quoted here for that reason, though a source category describes where VA gets information while disclosure outward runs on the published routine uses, a separate list in the same notice.

Third, and this is the one a lawyer raises: 103VA07B carries Privacy Act exemptions, and certain records are exempt under 5 U.S.C. 552a(j)(2) and (k)(2) from a long list of provisions. [3][29] What the list leaves alone is the point. The exemption reaches (e)(4)(G) through (I), meaning the notification procedure, the access procedure, and the record source categories, and it does not reach (e)(4)(C), categories of records, or (e)(4)(D), routine uses. The obligation to publish accurately what is collected and to whom it goes is the part that survives.

The fourth is the one a reasonable person raises first. A parking lot camera is a physical security system, not a treatment program. VA Police have a real law enforcement mission at medical centers, where assaults, vehicle thefts, and drug diversion are ordinary problems, and plate readers are ordinary equipment for that mission. Two queries out of five million is not a program. On the most natural reading of 7332, a plate captured by a security camera in a lot is nowhere near a record maintained in connection with a substance use disorder program. It is a plate.

That reading is probably right, which is the reason to publish rather than to hold. If it is right, someone at VA can say so in writing, cite the determination, and the question closes in a paragraph. This research did not locate a published VA determination on the point, which means the most likely correct answer is also an undocumented one, and undocumented is a different condition from settled.

## The questions

Two questions belong to the Office of Security and Law Enforcement, which holds VA Police program oversight, policy development, and physical security standards, and to VA Privacy Service, which publishes VA's systems of records. [30][31] I am putting both on the record here:

Is VA Police plate reader collection maintained under 103VA07B, and if so, under which published category of records, and which routine use authorizes participation in a nationwide query network?

Does VA treat a plate record captured on medical center grounds as subject to 38 U.S.C. 7332, and if not, on what published determination?

Neither office has published an answer to either question that this research could locate, and any response to this issue runs in a follow-up, in full. There are only a few possible answers: VA reads 103VA07B's categories more broadly than I do, a different notice covers it, the notice needs amending and VA is amending it, or a determination exists in an internal directive and has stayed there. Every one is actionable, and none requires legislation.

## From the plate to the aircraft

Between April 2025 and February 2026, the FAA issued more drone-as-first-responder waivers than it had in the previous seven years combined, and over a thousand public safety agencies now hold them. [32] The Electronic Frontier Foundation reads the surge as a shift from human-operated aerial observation toward AI-based autonomous operation. [32] Flock bought the drone company Aerodome for more than $300 million in October 2024 and now sells Alpha into that market. [33][1] Cities are fighting about it in real time. Middletown and Bridgeport residents packed council meetings this year over Flock drone proposals, and Plano approved a $1.4 million five-year program in late July. [34]

A Privacy Act system of records notice describes a filing system, and the instrument was built in an era when that was all there was to describe. It assumes records get created by discrete events and retrieved when a person has a reason to go looking, which is exactly what 103VA07B assumes. Continuous sensing breaks that, because a plate reader generates a record whether or not anything happened, and the value of the output sits in the pattern across thousands of records, never in any single one. A notice can describe the individual record accurately and still fail to describe what the system produces, because what the system produces is inference.

Each step up in autonomy takes a person out from between the collection and the consequence, and every step in the sequence is already built and selling. A fixed camera collects and waits for somebody to query it. An aerial platform dispatched on an alert, which is what Alpha is when a plate hit fires, has moved the decision about where to look into software and left a tap and the interpretation with a person. A system that reads a scene and acts on what it read leaves a person watching an outcome that already occurred. What separates those three has nothing to do with the sensor, which is the same class of hardware in all three cases. It is the count of decisions that happen before anyone is asked.

At every step so far, the governing instrument has been a procurement document: which agencies may query, whether the query is logged with a justification, whether the buyer holds an audit right or receives a report the seller generates, what happens to the data at termination, and whether federal access can be switched off in a way that actually switches it off. Those are contract terms. In the three California jurisdictions above, the ones that mattered were left to the vendor.

A records notice that kept pace would describe the collection as continuous and say whether pattern-of-life inference counts as a use, since a queryable plate history is exactly that, with query authorities enumerated as routine uses, retention carrying a number, and the audit right over the log belonging to somebody. None of that requires new statute, because the Privacy Act already obliges an agency to publish its categories of records and its routine uses, and 103VA07B is exempt from neither. [15][29]

My read is that the binding constraint over the next five years is a timing mismatch. Records notices get written once and amended rarely, while a software platform changes whenever a vendor ships a feature, with no contract action and no republication, which is why 103VA07B was rewritten in April 2024 and still trailed a purchase made nine months earlier. The institutions that get this right will stop treating the records notice as a compliance artifact filed after award and start treating it as a design document written alongside the requirement. That is an unglamorous conclusion, and it is the only one that scales, because the alternative is an agency discovering what its own system does by reading another jurisdiction's audit.

## The same phrase, one theater over

Human on the loop is the framing a vendor uses to describe an aircraft dispatched by software with an operator watching, and it is also the framing now appearing in how the Department of War describes targeting. None of this arrived unannounced. In February 2020, at the Air Force Association's Air Warfare Symposium, Elon Musk told a room of Air Force officers that the manned fighter era had passed and that autonomous drone warfare was what came next, which was received at the time as provocation and reads now as a schedule. [35] Accounts of that same appearance have him adding that authority over the lethal decision should stay with a person in the loop, though the wording differs across accounts and this research did not locate a transcript of that portion, so take the position as reported and the phrasing as approximate.

Six years on, Bloomberg reported that the Pentagon approved a revision to its joint targeting doctrine in April 2026 without public disclosure. Per Bloomberg's review of the document, which is unclassified and unreleased, a new chapter envisions systems where AI initiates actions with human monitoring, evolving from current human in the loop systems in which a human initiates actions. [36] The Pentagon's on-record position, also per Bloomberg, is that the AI technologies in use do not select or engage targets autonomously. [36] Everything known about that document comes from that reporting.

The response has come from both parties and from the institution itself. Senator Gillibrand's June 2026 framework defines a category of high-consequence decisions and places nuclear targeting, lethal targeting support, autonomous weapons, cyber operations, and domestic surveillance of US persons inside it together. [37] Representatives Beyer, Barrett, and Jacobs introduced the bipartisan Human Authority over Autonomous Weapons Act on July 17. [38] The Senate Armed Services Committee advanced FY2027 NDAA provisions requiring supervision, intervention and termination methods, fail-safes, manual-control fallback, monitoring data, and retained records of target selection logic. [39]

That last provision list is worth holding up next to the parking lot. Monitoring data, retained records of the selection logic, an audit trail over the decision the machine made: Congress is specifying for weapons the same instrument a records notice is supposed to be, and arriving at it from the opposite end. A sitting senator has already written domestic surveillance of US persons and lethal targeting support into one statutory paragraph, which makes the connection between these two theaters a legislative fact and not an analogy anyone is reaching for.

The battlefield version of this question has three bills, a committee markup, and an international review conference in November pointed at it. The federal health facility version has a records notice from April 2024 and a dropdown menu.

The car is still in the lot. Somebody drove it there to get care, and the question of which document governs the record of that trip has an owner, an office, and an email address printed at the top of a Federal Register notice.

Let's roll.

— Mary

Mission Meets Tech

The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.

MMT Premium

This issue reads the documents and the trajectory. The companion Capture Corner works the buy: which federal and state grant programs now list plate readers and drone-as-first-responder equipment as eligible expenditures and what that does to physical security scope on VA and DHA work, where false-positive acceptance criteria get set in solicitations and why that creates a protestable term, the audit-log language to demand as a deliverable instead of a reported feature, the data ownership and termination clauses worth pricing before award, the retention-period language that stopped being a privacy control on June 29, and the federal-access opt-out that has to be a contract term because a setting is not a control.

Founding Member rate: $199/year, locked permanently for the first 100 subscribers. Standard rate: $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

Subscribe at missionmeetstech.com/pricing.

## Sources

[1] Flock Safety, "Flock DFR - Drone as First Responder" product page. Source for deployment of docked drones to the geo-coordinates of 911 calls, LPR hits, gunshot detection, or manually by the operator; the 60 mph figure; and plate reads from up to 2,000 feet. Contemporaneous coverage describes the operator dispatching the aircraft from a smartphone. https://www.flocksafety.com/products/flock-dfr

[2] USAspending.gov, `spending_by_award` API, recipient "Flock Group," FY21 to present, contract award types A/B/C/D. Award 140D0425P0230, Department of the Interior, $231,600, start September 25, 2025. Award 36C25023P1216, Department of Veterans Affairs, $44,450, start July 2, 2023. Award 36C25025P1681, Department of Veterans Affairs, $21,000, start September 18, 2025. https://www.usaspending.gov/

[3] Department of Veterans Affairs, "Privacy Act of 1974; System of Records," 89 FR 23638, April 4, 2024 (full republication of 103VA07B). Source for the seven categories of individuals covered, the thirteen categories of records including item seven, the retrieval provision, the 38 U.S.C. 501 and 901-905 authority, the purpose statement, Routine Use 4 and Routine Use 6, Record Source Categories, the 552a(j)(2) and (k)(2) exemption lists, and the absence of any reference to license plate readers, ALPR, cameras, drones, aircraft, or unmanned or aerial systems. Full text checked August 9, 2026. https://www.federalregister.gov/documents/2024/04/04/2024-07137/privacy-act-of-1974-system-of-records

[4] USA Today, "Flock camera vandalism controversy," August 8, 2026. Source for Flock Safety's founding, scale of agency adoption, and product description. https://www.usatoday.com/story/news/crime/2026/08/08/flock-camera-vandalism-controversy/91194591007/

[5] Joseph Cox, "This Company Will Add Phone, AirPod, and Smartwatch Trackers to License Plate Readers," 404 Media, June 8, 2026. Source for SignalTrace as a Leonardo product, the Bluetooth, Wi-Fi, and RFID collection described in the company product sheet, the correlation of devices traveling together to a plate, and Leonardo's USSOCOM and GSA contracts. https://www.404media.co/this-company-will-add-phone-airpod-and-smartwatch-trackers-to-license-plate-readers/

[6] Ryan O'Horo, "Spotting Flock Safety's Falcon Cameras," technical teardown, March 2025; edhat, "Oxnard Police Suspend Flock License Plate Readers; Ventura Agencies Tighten Controls After Out-of-State Access." Sources for Flock device Bluetooth and Wi-Fi emissions used for camera detection, and for the Ventura County Sheriff's June 2023 National Lookup disablement and approximately 364,000 out-of-state queries in a one-month window. https://www.ryanohoro.com/post/spotting-flock-safety-s-falcon-cameras · https://www.edhat.com/ventura/news/oxnard-police-suspend-flock-license-plate-readers-ventura-agencies-tighten-controls-after-out-of-state-access/

[7] Joseph Cox, "License Plate Reader Company Flock Is Building a Massive People Lookup Tool, Leak Shows," 404 Media, May 14, 2025. https://www.404media.co/license-plate-reader-company-flock-is-building-a-massive-people-lookup-tool-leak-shows/

[8] Flock Safety, "Correcting the Record: Flock Nova Will Not Supply Dark Web Data," May 30, 2025. https://www.flocksafety.com/blog/correcting-the-record-flock-nova-will-not-supply-dark-web-data

[9] Nexanet, "License Plate Reader Company Flock Said It Does Not Use Dark Web Data. My Analysis of Their Code Tells a Different Story." Independent codebase analysis; the company has not publicly responded to the specific findings. https://nexanet.ai/blog/license-plate-reader-company-flock-said-it-does-not-use-dark-web-data-my-analysis-of-their-code-tells-a-different-story

[10] Matthew Guariglia, Electronic Frontier Foundation, July 17, 2026. Source for Flock ending its pilot using acoustic gunshot detection devices to identify signs of human distress. https://www.eff.org/deeplinks/2026/07/hundreds-drone-first-responder-programs-could-soon-be-launched-across-country

[11] Oxnard Police Department statement, February 27, 2026, on its Flock audit, as reported in local coverage. Source for the December 2023 California-only access setting, the two May 2025 nationwide queries by the VA Police Department at Loma Linda Medical Center, the criminal-investigation characterization, the suspension of nineteen fixed cameras, and the 2025 query volume. https://vidanewspaper.com/2026/03/05/oxnard-police-department-suspends-use-of-cameras/

[12] Pasadena Now, "Veterans Affairs Police Accessed Local Flock License Plate Reader Database." Source for the two VA Police queries of Pasadena PD data, Pasadena's initial report of no federal access and subsequent correction, and NBC News reporting that Flock had classified the VA agency as a state agency. https://pasadenanow.com/main/veterans-affairs-police-accessed-local-flock-license-plate-reader-database

[13] Mission Local, "Federal agencies queried SF surveillance data," June 2026. Source for 1.6 million federal and out-of-state queries across seven months. https://missionlocal.org/2026/06/federal-agencies-sf-surveillance-flock-data-audit/

[14] Flock Safety statement of January 2026 on federal agency sharing defaults, as reported in contemporaneous coverage. Source for the company position that federal sharing is disabled by default and that federal access must be explicitly granted by the local customer. https://dailycaller.com/2026/07/15/keith-self-flock-safety-cameras-surveillance-data-warrant-privacy-act/

[15] Department of Veterans Affairs, Privacy Service, System of Records Notices index. Source for 103VA07B ownership, system manager, and exemption citations. https://department.va.gov/privacy/system-of-records-notices/

[16] FedRAMP Marketplace, Flock Safety Platform, package FR2527955211, FedRAMP Certified, 20x, Class B (Low), since July 25, 2025. https://www.fedramp.gov/marketplace/products/FR2527955211/

[17] Flock Safety, "Fewer Victims, Stronger Safeguards: The Case for Principled Federal Collaboration." https://www.flocksafety.com/blog/fewer-victims-stronger-safeguards-the-case-for-principled-federal-collaboration

[18] 38 U.S.C. 7332, subsections (a)(1) and (c); 38 U.S.C. 5701. Office of the Law Revision Counsel. https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title38-section7332&num=0&edition=prelim

[19] 42 CFR Part 2, exclusion of VA substance use disorder records and routing to 38 U.S.C. 7332. eCFR. https://www.ecfr.gov/current/title-42/chapter-I/subchapter-A/part-2

[20] Department of Veterans Affairs, "Privacy and HIPAA Focused Training," April 2024. https://www.va.gov/files/2024-04/Privacy%20And%20HIPAA%20Focused%20Training.pdf

[21] Federal Register, 60 FR, December 13, 1995, VA implementing regulations. Source for the law enforcement carve-out limited to a crime on the premises and to the circumstances of the incident. https://www.govinfo.gov/content/pkg/FR-1995-12-13/html/95-30138.htm

[22] Chatrie v. United States, No. 25-112, 609 U.S. ___ (June 29, 2026). Opinion of the Court by Justice Kagan, 6-3; Jackson concurring, joined by Sotomayor; Gorsuch concurring in the judgment; Alito dissenting, joined in part by Thomas and Barrett; Barrett dissenting. Source for the holding that acquiring cell-phone location history is a Fourth Amendment search, the rejection of the argument that a narrow time-limited slice of a larger dataset falls outside it, and the vacatur and remand on particularity and probable cause. https://www.supremecourt.gov/opinions/25pdf/25-112_0am4.pdf

[23] Electronic Frontier Foundation, "Victory! Supreme Court Says Constitution Protects People's Location Data," June 29, 2026. Source for Chatrie as the first digital surveillance decision since Carpenter (2018) and for the Gorsuch property framing. https://www.eff.org/deeplinks/2026/06/victory-supreme-court-says-constitution-protects-peoples-location-data

[24] Courthouse News Service, "Judge holds Norfolk's license plate reader use constitutional," January 27, 2026. Source for Judge Mark Davis's summary judgment for the City of Norfolk, the 176 cameras in roughly 75 clusters, the 51-page opinion, and the Carpenter-based reasoning. https://www.courthousenews.com/judge-holds-norfolks-license-plate-reader-use-constitutional/

[25] WHRO, "A federal judge ruled Norfolk's Flock surveillance cameras don't invade people's privacy, yet," February 11, 2026. Source for Judge Davis's statement that plate reader surveillance could become too intrusive at some point and that the answer in Norfolk was not today. https://www.whro.org/business-growth/2026-02-11/a-federal-judge-ruled-norfolks-flock-surveillance-cameras-dont-invade-peoples-privacy-yet

[26] 13News Now, "Norfolk license plate reader lawsuit gains momentum after US Supreme Court ruling," July 8, 2026, and Spartan Echo, May 6, 2026. Source for the appeal to the Fourth Circuit in Schmidt v. City of Norfolk, Norfolk's request for additional time to respond to Chatrie, the Institute for Justice reading of the decision, expected oral argument timing, the 21-day Virginia retention maximum, and the allegation that cameras logged one plaintiff's location 849 times over roughly five months. https://www.13newsnow.com/article/news/local/mycity/norfolk/norfolk-license-plate-reader-lawsuit-gains-momentum-after-us-supreme-court-ruling/291-7785e25b-7a48-4d3e-8560-b456b4925dc5

[27] Protecting Rights in Video and Equipment Acquired Discovery (PRIVACY) Act, introduced by Rep. Keith Self (R-TX-3), July 15, 2026; referred to the House Committee on the Judiciary and the House Committee on Oversight and Government Reform. Source for the warrant requirement for federal access to state and local surveillance data, the 30-day purge, the federal list of covered surveillance technologies, and the restriction on federal funds. https://tx3dnews.com/keith-self-privacy-act-flock-camera-warrant/

[28] Texas Tribune, "Use of Flock license plate reader cameras surges in Texas," August 3, 2026. Source for Rep. Self's July news release framing. https://www.texastribune.org/2026/08/03/texas-flock-cameras-law-enforcement-license-plate-readers/

[29] 38 CFR 1.582, VA Privacy Act exemptions. Source for the provisions from which exempt records are excused and, by omission, those from which they are not. https://www.ecfr.gov/current/title-38/chapter-I/part-1

[30] Department of Veterans Affairs, Office of Security and Law Enforcement, Office of Operations, Security, and Preparedness. https://www.osp.va.gov/Security_and_Law_Enforcement.asp

[31] Department of Veterans Affairs, Privacy Service, System of Records Notices. https://department.va.gov/privacy/system-of-records-notices/

[32] Matthew Guariglia, Electronic Frontier Foundation, "Hundreds of Drone-as-First-Responder Programs Could Soon Be Launched Across the Country," July 2026. Source for the FAA waiver counts (976 granted from 2018 through April 2025, more issued between April 2025 and February 2026 than in the prior seven years combined), the figure of over 1,000 public safety agencies holding waivers, and the characterization of the shift toward AI-based autonomous operation. https://www.eff.org/deeplinks/2026/07/hundreds-drone-first-responder-programs-could-soon-be-launched-across-country

[33] TechCrunch, "Flock Safety paid over $300 million for 17-month-old drone startup Aerodome," October 23, 2024. https://techcrunch.com/2024/10/23/flock-safety-paid-over-300-million-for-17-month-old-drone-startup-aerodome/

[34] Government Technology, "Flock Drones Spark Debate in Two Connecticut Cities," August 2026 (Middletown and Bridgeport); Audacy KRLD, Plano City Council approval of a five-year drone-as-first-responder contract, July 27, 2026. https://www.govtech.com/public-safety/flock-drones-spark-debate-in-two-connecticut-cities · https://www.audacy.com/krld/news/local/plano-is-latest-dfw-community-to-add-drones-to-first-responder-program

[35] FlightGlobal, "The fighter jet era has passed: Elon Musk," and contemporaneous reporting from the Air Force Association Air Warfare Symposium, February 28, 2020, originating with Defense News. Accounts of the same appearance differ on his phrasing regarding retaining authority with a person in the loop, and this research did not locate a published transcript or recording of that portion. https://www.flightglobal.com/fixed-wing/the-fighter-jet-era-has-passed-elon-musk/137017.article

[36] Bloomberg, Katrina Manson, "Pentagon Sees Broader Role for AI in Setting Military Targets," June 25, 2026. The underlying document is unclassified and has not been publicly released. https://www.bloomberg.com/news/articles/2026-06-25/pentagon-sees-broader-role-for-ai-in-setting-military-targets

[37] Small Wars Journal, "Gillibrand Bill Puts a Human in the Loop," June 3, 2026. https://smallwarsjournal.com/2026/06/03/gillibrand-bill-puts-a-human-in-the-loop/

[38] Office of Rep. Don Beyer, introduction of the Human Authority over Autonomous Weapons Act with Reps. Barrett and Jacobs, July 17, 2026. https://beyer.house.gov/news/documentsingle.aspx?DocumentID=9164

[39] Arms Control Association, "U.S. Senate Panel Approves AI, Autonomous Weapons Rules," July 2026. https://www.armscontrol.org/act/2026-07/news/us-senate-panel-approves-ai-autonomous-weapons-rules

Sources verified as of August 9, 2026.
