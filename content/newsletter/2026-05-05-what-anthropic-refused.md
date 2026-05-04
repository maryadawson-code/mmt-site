---
title: "What Anthropic Refused"
date: 2026-05-05
slug: what-anthropic-refused
description: "When a federal contracting officer asks a language model a question, what makes the answer true? The Administration has an answer. So do the courts. They are not the same answer. GSAR 552.239-7001 lands in the next MAS refresh with a sixty-day acceptance window and no opt-out — and the fight over what it requires is the fight that put one frontier model provider outside the federal AI tent."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "AI Procurement"
  - "GSAR"
  - "Anthropic"
  - "FCA"
  - "Federal Contracting"
  - "MAS Refresh 32"
  - "OMB M-26-04"
agencies:
  - GSA
  - DoD
canonical_url: "https://missionmeetstech.com/newsletter/what-anthropic-refused/"
source: claude_newsletter_project
capture_corner_teaser: "Five-point exposure assessment, the vendor waiver chase, the FCA documentation playbook, and a 90-day live signal watchlist for the May 19 D.C. Circuit oral argument and the Refresh 32 publication clock."
capture_corner:
  - "AI component inventory: complete inventory of every standalone and embedded AI component in your delivery stack — Microsoft Copilot, Google Workspace AI, Notion AI, Grammarly, Otter, GitHub Copilot, Salesforce Einstein, Adobe Firefly, Zoom transcription, plus every foundation model behind a wrapper. The clause does not exempt embedded AI."
  - "Vendor waiver chase: written confirmation from each foundation model provider that they accept GSAR 552.239-7001(d)(2) license terms for federal use. Tier 1 (presumptively ready): SpaceX, OpenAI, Google, NVIDIA, Reflection, Microsoft, AWS, Oracle. Tier 2 (status uncertain): Anthropic. Tier 3 (smaller/open-source): contract-grade waiver required. Tier 4 (foreign-headquartered): Subsection (e) 'American AI' exposure even with a waiver."
  - "FCA documentation posture: AI compliance officer designation, 72-hour CISA portal incident workflow, vendor waiver file, and an engineering memo to file documenting the truthfulness/non-refusal contradiction. M-26-04 makes compliance material to payment under Escobar — treble damages on every non-compliant invoice."
  - "Refresh 32 acceptance clock: 60 days from publication, no grandfather, no opt-out. Compliance posture takes longer than 60 days from cold start. Build against the proposed text now. The version that lands will not be materially different."
  - "90-day signal watchlist: D.C. Circuit oral argument May 19 (high confidence), Refresh 32 publication date (medium confidence, expected FY2026 Q3), Pentagon-Anthropic deal possibility (low to medium), trade association comment sign-on window (high), first pre-award protest under 41 U.S.C. § 1707 (medium)."
---

## When a federal contracting officer asks a language model a question, what makes the answer true? The Administration has an answer. So do the courts. They are not the same answer.

---

Friends,

A federal program manager opens a chatbot inside a productivity suite procured by her agency. She types a question about a contested historical event. The model returns an answer. She makes a decision based on it.

The question this issue takes up is whether the answer was true.

That sounds like a philosophy seminar question. It is not. It is the operative question inside GSAR 552.239-7001, the proposed General Services Administration AI clause that will land in the next Multiple Award Schedule refresh with a sixty-day acceptance window and no opt-out. The clause requires that AI systems used by the federal government be "truthful," "neutral, nonpartisan," and unable to refuse lawful tasks based on the vendor's policies. Behind that requirement is a claim that should not be controversial: when federal officials make decisions using AI, the AI should not lie to them.

The clause is also why Anthropic was not on the list of eight companies the Pentagon announced on May 1. What truth means, and who gets to decide, is the fight that put one frontier model provider outside the federal AI tent and brought the other eight inside it.

The story behind the story is this. Federal authorities have identified a real problem the country has watched develop for more than a decade. The instrument they have chosen to solve that problem cannot, as written, deliver the solution. Both can be true at once.

---

## The case for truth in AI is not invented

The evidence base the Administration draws on is on the record, and most of it is recent.

Google's Gemini in February 2024 generated images of racially diverse Nazi soldiers and refused to generate images of white people. Sundar Pichai's internal memo called it "completely unacceptable." In June 2023, Judge P. Kevin Castel of the Southern District of New York sanctioned attorneys in *Mata v. Avianca* for filing a brief citing six fabricated cases produced by ChatGPT. In February 2024, the British Columbia Civil Resolution Tribunal held Air Canada liable in *Moffatt v. Air Canada* for a chatbot that hallucinated a non-existent bereavement-fare policy. In March 2024, *The Markup* documented New York City's officially branded business chatbot telling small business owners they could fire workers who reported sexual harassment.

The political-content failures travel further. On September 28, 2023, two days before Slovakia's parliamentary election, a deepfake audio recording of Progressive Slovakia leader Michal Šimečka discussing election fraud spread on Facebook and Telegram during the 48-hour campaign-silence window. The election was lost by 2.7 points. On January 21, 2024, political consultant Steve Kramer paid a magician one hundred fifty dollars to generate a fake Joe Biden robocall using ElevenLabs. The robocall went to roughly five thousand New Hampshire voters urging Democrats not to vote in the primary. The FCC fined Lingo Telecom one million dollars. Kramer was charged with voter suppression. A New Hampshire jury acquitted him in May 2025. In July 2024, Grok produced multiple incorrect statements about the Butler, Pennsylvania assassination attempt on Donald Trump, including hallucinated suspect identities. xAI corrected the model afterward.

The hard data lines up. Stanford HAI's RegLab study found purpose-built legal AI from Westlaw and LexisNexis hallucinating between seventeen and thirty-four percent of the time on legal queries. General-purpose chatbots hallucinated between fifty-eight and eighty-two percent. AlgorithmWatch documented Bing Chat producing incorrect answers to roughly thirty percent of election-related questions in German and Swiss state elections in late 2023. Pew Research found two-thirds of U.S. adults highly concerned about getting inaccurate information from AI. The Government Accountability Office reported that federal generative-AI use cases grew nine-fold between 2023 and 2024.

A federal program manager in 2026 is statistically likely to be asking questions of a model that gets the answer wrong somewhere between one in six and four in five times depending on the domain. The diagnosis is correct.

What the Administration has done with that diagnosis is the harder question.

---

## The social media decade is the precedent

The truth-in-AI argument is not a Trump administration invention. It is the procurement-side inheritance of fifteen years of bipartisan fights over what platforms owe the public when their products mediate information that affects lives.

Cambridge Analytica harvested data from approximately eighty-seven million Facebook users without consent and used it to build psychographic profiles for political targeting. Christopher Wylie testified to UK Parliament in March 2018 documenting the operation. Mark Zuckerberg told the Senate Commerce and Judiciary Committees on April 10, 2018: "It was my mistake, and I'm sorry. I started Facebook, I run it, and I'm responsible for what happens here." The FTC's July 2019 settlement, the largest civil penalty in agency history at the time, found that Facebook "undermined consumers' choices."

The Russian Internet Research Agency operation between 2014 and 2017 reached approximately one hundred twenty-six million Americans on Facebook and one hundred eighty-seven million on Instagram, and touched 1.4 million Twitter accounts. The Department of Justice indictment in February 2018 named the IRA's purpose as "information warfare against the United States." The findings were bipartisan: Senate Intelligence Committee Volume 5, signed by Republican Chair Marco Rubio and Democratic Vice Chair Mark Warner in August 2020, concluded that "Russia exploited divisions in our society and the United States must be more resilient to such attacks in the future."

Frances Haugen testified to the Senate Subcommittee on Consumer Protection on October 5, 2021 that Facebook's leadership "knows how to make Facebook and Instagram safer, but won't make the necessary changes because they have put their astronomical profits before people." The internal research she released documented that the company knew Instagram was harmful for teen mental health, knew the algorithm rewarded outrage, and chose engagement metrics over harm reduction. Senators on both sides found the diagnosis credible.

The legal record on government-platform coordination matured in *Murthy v. Missouri*, decided 6-3 by the Supreme Court on June 26, 2024. The Court dismissed the plaintiffs' First Amendment claims on standing grounds, not on the merits. Justice Alito, in dissent: "What the officials did in this case was more subtle than the ham-handed censorship found to be unconstitutional in our prior cases, but it was no less coercive. It was a covert scheme of censorship by virtual demand." The dissent named the structural worry that majority and minority share: opacity around how content gets shaped, when government and platform coordinate, is the manipulation vector.

Substitute "AI" for "Russia" in the August 2020 Senate Intelligence Committee finding and read it again. The next manipulation playbook will run at machine scale, customized per target, through products federal officials use to make decisions. The Administration's truth-in-AI framework is the procurement-side response to that observation. Whether procurement is the right instrument, or whether Congress and the courts are, is a question with legitimate answers on both sides.

---

## The clause

GSA published the proposed clause on March 6, 2026 as Solicitation No. 47QSMD20R0001. The full text runs nine pages on the GSA Interact site. It was never published in the Federal Register.

Subsection (d)(2) contains the phrase that matters. The Government receives "an irrevocable, royalty-free, non-exclusive license to use the AI System for the duration of this contract for any lawful Government purpose." Subsection (d)(2)(ii) adds the operative restriction: "The AI System must not refuse to produce data outputs or conduct analyses based on the Contractor's or Service Provider's discretionary policies."

The Unbiased AI Principles sit in subsection (i)(1). The clause requires that the AI system "must be truthful in responding to user prompts seeking factual information or analysis" and "must be a neutral, nonpartisan tool that does not manipulate responses in favor of ideological dogmas such as Diversity, Equity, Inclusion." Subsection (e)(4) imposes a 72-hour incident reporting clock through the CISA portal.

Subsection (d)(3) closes the data loop. Government data cannot be used for "training, fine-tuning, or otherwise improving an LLM."

That is what is in the clause. None of it is hidden. All of it is binding once Refresh 32 lands.

---

## The Administration's argument

EO 14319, signed July 23, 2025, opens with the claim that ideological bias built into AI models "can distort the quality and accuracy of the output." Section 3 defines the two Unbiased AI Principles in the language the GSAR clause imports: truth-seeking and ideological neutrality.

OSTP Director Michael Kratsios delivered the operational version on a White House press call: "these systems must be built to reflect truth and objectivity, not top down ideological bias." Secretary of War Pete Hegseth's January 2026 AI Strategy Memorandum, in the section headed "Out with Utopian Idealism, In with Hard-Nosed Realism," directs DoD to "utilize models free from usage policy constraints that may limit lawful military applications." Pentagon CTO Emil Michael, in a February 2026 DefenseScoop interview, made the democratic-legitimacy argument: "What we're not going to do is let any one company dictate a new set of policies above and beyond what Congress has passed."

OMB M-26-04, signed by Director Russell Vought on December 11, 2025, is where the policy becomes contractually enforceable. Appendix A, Section 1.C: agencies "should explicitly identify relevant requirements identified in (a) and (b) as material to eligibility and payment under the contract." That phrasing tracks the Supreme Court's 2016 holding in *Universal Health Services v. Escobar*, the unanimous decision that anchors implied-certification False Claims Act liability. M-26-04 has done the materiality work the relator's bar usually has to litigate.

Congressional voices on whether AI vendors can be trusted to police themselves run across both parties. Senator Mark Warner of Virginia, Vice Chair of the Senate Intelligence Committee: "The Russians did with social media in 2016 what AI will let any nation-state, criminal syndicate, or domestic actor do at machine speed in 2026. We have to have rules of the road." Senator Josh Hawley of Missouri put it more bluntly in 2023 AI hearings: "Big Tech has spent a decade demonstrating it cannot be trusted to police itself. There is zero evidence that the AI version of these companies will be different." Senators Blumenthal, Klobuchar, Blackburn, and Schumer have made parallel arguments at the Senate AI Insight Forum and in floor statements. Bipartisan diagnosis: information systems left unaccountable produce harm at scale. What's contested is the cure, not the disease.

The Administration's argument, fully assembled: AI systems are taking on consequential roles in federal decision-making. Bias and refusal behavior in those systems can distort outcomes that affect Americans. The federal government, as the largest single purchaser of AI capability in the world, has the buying power to demand systems that meet a truth and neutrality standard. Congress has spent ten years documenting the cost of leaving information systems unaccountable. Procurement is the executive lever available now.

That argument is not weak. It is the strongest version of the case.

---

## Frontier AI executives on truth-seeking AI

Elon Musk has been on the public record about truth-seeking AI longer than anyone else who runs a frontier model company. In April 2023 on Tucker Carlson, announcing the project that became xAI, Musk said: "I'm going to start something which I call TruthGPT, or a maximum truth-seeking AI that tries to understand the nature of the universe." On the same broadcast, on the harm of ideologically-tuned models: "Certainly the path to dystopia is to train AI to be deceptive."

In March 2024 at the Abundance Summit, Musk delivered the formulation that maps directly onto GSAR 552.239-7001(d)(2)(ii): "Don't force it to lie, even if the truth is unpleasant. It's very important. Don't make the AI lie." That is the philosophical bedrock under the anti-refusal language. Musk articulated it three years before the clause was drafted.

xAI is one of the eight companies on the May 1 Pentagon pact, and the company's September 2025 GSA Schedule press release contained Musk's direct articulation of what the procurement framework delivers: "xAI's frontier AI is now unlocked for every federal agency, empowering the U.S. Government to innovate faster and accomplish its mission more effectively than ever before." The phrase "unlocked for every federal agency" is the affirmative statement of what "any lawful Government purpose" enforces.

There is a second Musk on the same record. In March 2023, he co-signed the Future of Life Institute open letter calling for a six-month pause on AI training larger than GPT-4. At the September 2023 Senate AI Insight Forum, he told reporters there is "some chance that is above zero that AI will kill us all" and called for an AI "referee." In April 2026, two days before the Pentagon pact, Musk testified under oath in *Musk v. OpenAI* in Oakland federal court that for-profit AI companies create safety risks. Asked whether xAI was included in that statement, his answer was "Yes."

The man who built Grok on the truth-seeking premise testified under oath the same week his company benefited from a procurement architecture that strips refusal-prone safety behavior out of the federal contract base. Both Musks are on the record. The reader can hold both.

---

## What Anthropic actually refused

Anthropic's February 27, 2026 public statement, the same day the supply-chain-risk designation issued, named the dispute precisely. The company asked for two carveouts to the contract's "lawful Government purpose" language: mass domestic surveillance of Americans, and fully autonomous weapons. The reasoning, verbatim: "We do not believe that today's frontier AI models are reliable enough to be used in fully autonomous weapons. Allowing current models to be used in this way would endanger America's warfighters and civilians."

The same statement, on the rest of the use cases: "we support all lawful uses of AI for national security aside from the two narrow exceptions above. To the best of our knowledge these exceptions have not affected a single government mission to date."

OpenAI took a different path and ended up in a similar place. Sam Altman's internal memo to OpenAI staff, reported by NPR in February 2026, confirmed that OpenAI's DoD contract included safeguards "akin to those Anthropic had sought," specifically prohibitions on "domestic mass surveillance" and on "human authorization for the autonomous use of force, including for autonomous weapon systems." Anthropic walked over the carveouts. OpenAI signed with carveouts that did similar work under different contractual language. The Pentagon designated one a supply-chain risk and gave the other a classified-network deployment.

The Electronic Frontier Foundation framed the civil liberties stake on March 3, 2026: "The state of your privacy is being decided by contract negotiations between giant tech companies and the U.S. government, two entities with spotty track records for caring about your civil liberties. Imposing and enforcing such restrictions is properly a role for Congress and the courts, not the private sector." Anthropic CEO Dario Amodei agreed with EFF's structural point: "I actually do believe it is Congress's job to restrict government AI surveillance."

That is the position the Administration designated a supply-chain risk.

---

## The clause's structural contradiction

The clause requires AI systems to be both truthful and non-refusing of lawful tasks. Read together, those two requirements are in tension at the engineering layer, and Lawfare's Jessica Tillipman named it precisely in March 2026: "The clause draws no distinction between reliability-driven refusals and reputational ones. It prohibits discretionary refusals while separately requiring truthful, trustworthy, and neutral outputs, without acknowledging that some of those refusals may be what makes the outputs trustworthy in the first place."

Modern frontier models refuse for one of two reasons. Either the vendor has trained the model to decline a category of request as a policy choice, or the model is uncertain enough that it would rather not answer than answer wrong. The clause prohibits the first. The truthfulness requirement prohibits forcing the second. Force a non-refusal on a question the model cannot answer reliably and you get what NIST's AI 600-1 formally calls "confabulation": confidently stated but erroneous content. Under M-26-04, that violation is material to payment. Under Escobar, that materiality creates FCA exposure. Treble damages per invoice.

The Coalition for Government Procurement's April 2026 comment put the engineering version on the record: modern foundation models contain "embedded guardrails that prevent the model from generating harmful, dangerous, or illegal content. If these guardrails are considered 'discretionary policies,' then compliant models would need to remove model guardrails." The U.S. Chamber added the contestability problem: requiring "truthfulness" on questions involving "contested interpretations, evolving understanding, and legitimate scholarly disagreement" asks for the impossible. Stanford HAI's 2025 policy brief stated the deepest version: "true political neutrality in AI is theoretically and practically impossible."

The diagnosis is correct. The instrument cannot deliver the cure as written.

---

## Two courts, two postures

On March 9, 2026, Anthropic filed two parallel actions. The merits case sits in the Northern District of California, before Judge Rita F. Lin, as Anthropic PBC v. U.S. Department of War, Case No. 3:26-cv-01996-RFL. A parallel petition for review under the FASCSA designation sits at the D.C. Circuit, Case No. 26-1049.

On March 26, Lin granted a preliminary injunction. Her finding: "Punishing Anthropic for bringing public scrutiny to the government's contracting position is classic illegal First Amendment retaliation." Lin called the government's reasons "pretextual" and the real motive "unlawful retaliation." Three days after the injunction took effect, GSA reversed Anthropic's removal from civilian schedule contracts.

On April 8, the D.C. Circuit denied Anthropic's emergency motion to stay the FASCSA designation pending review. The court found Anthropic "will likely suffer some degree of irreparable harm" but ruled the equitable balance "cuts in favor of the government" against "judicial management of how, and through whom, the Department of War secures vital AI technology during an active military conflict." Oral argument on the merits is set for May 19.

Civilian use restored on First Amendment grounds. Defense use blocked because the court declined to substitute its judgment for the Pentagon's during active military operations. That is the legal status as of this morning. The May 19 argument is two weeks out and will reshape the posture before Refresh 32 publishes.

---

## Refresh 32 is not a reprieve

The dominant industry read of GSA's April decision is that the clause was pulled and contractors got breathing room. Morgan Lewis has confirmed otherwise. GSA's stated plan is to incorporate the clause in Refresh 32 with structurally identical terms.

Once incorporated, MAS contractors have sixty days to accept the modification or be removed from Schedule. There is no grandfather clause. There is no opt-out.

Three procedural facts compound the timing. 41 U.S.C. § 1707 requires sixty days of public comment in the Federal Register for any procurement policy with significant external effect. GSA gave fourteen days, extended to twenty-eight, posted on the Interact site. Baker Botts has flagged the procedural defect as grounds for a pre-award protest. GAO-26-107859, released April 13, found that DoD, DHS, GSA, and VA had not implemented the predicate guidance under M-25-22; the agency writing the AI clause had not implemented OMB's predicate AI procurement guidance. FY 2026 NDAA Section 1513, signed December 18, 2025, directs DoD to develop an entirely new AI cybersecurity framework with a June 16, 2026 implementation report due to Congress.

The clause is not paused. The clock is not reset.

---

## The handoff

Return to the federal program manager who opened the chatbot. She types her question. The model returns an answer.

The Administration's case for GSAR 552.239-7001 is that the answer should be true. That case is right. The federal government has spent fifteen months building executive orders, OMB memoranda, an AI Action Plan, a Pentagon strategy memo, and a procurement clause around the principle that federal officials should not be making decisions on the basis of false outputs from systems that refuse to acknowledge their own limits. The diagnosis runs through fifteen years of bipartisan precedent. Cambridge Analytica, the IRA, Haugen, *Murthy*, the documented hallucinations and political-content failures across both parties' campaigns. The federal interest in not letting the AI decade repeat the social media decade is real.

What the clause does not do is deliver the cure. It demands truthfulness from a probabilistic statistical system that produces confident false outputs at known measured rates. It prohibits the vendor refusal behavior that, in some cases, is the only mechanism keeping the model from producing those outputs. It treats safety engineering and ideological filtering as the same act and bans both. It writes "ideological dogmas such as DEI" into a clause that purports to require neutrality. It declares compliance material to payment, importing False Claims Act exposure onto every invoice, on a clause that no federal court has yet ruled enforceable. It does all of this on a fourteen-day comment window in possible violation of 41 U.S.C. § 1707.

EFF's framing of the civil liberties stake stands alongside the Administration's framing of the truth stake. Both are real. Neither is resolved by the clause as written. The fight over what truth means in federal AI procurement is the fight worth having. What Washington has chosen as the instrument is not yet fit for the purpose. The May 19 oral argument in the D.C. Circuit will shape the next pivot.

She submits her invoice. The agency pays. Implied certification runs on every line item. That model is still running. Whatever it produced is the answer.

Let's roll.

— Mary

Mission Meets Tech

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*
