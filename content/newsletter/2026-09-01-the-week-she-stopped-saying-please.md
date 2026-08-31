---
title: "The Week She Stopped Saying Please"
date: 2026-09-01
slug: the-week-she-stopped-saying-please
description: "A senior engineer measured her own AI coding fleet coming apart, and the vendor confirmed the cause seven weeks later. The more useful finding is in the price list, where the same capability is now sold at two levels, and the difference between them is whether anybody owes you a warning."
author: "Mary Womack"
category: deep-dive
visibility: public
tags:
  - "AI Procurement"
  - "GSA OneGov"
  - "Claude Code"
  - "Model Degradation"
  - "Infrastructure Drift"
  - "Service Tiers"
  - "GSAR 552.239-7001"
  - "OMB M-26-04"
  - "FedRAMP"
  - "Capture Strategy"
agencies:
  - "GSA"
  - "OMB"
canonical_url: "https://missionmeetstech.com/newsletter/the-week-she-stopped-saying-please/"
source: claude_newsletter_project
capture_corner_teaser: "This issue reads the commercial record: what changed inside three frontier products, who paid to find out, and why every published service tier promises capacity and none promises behavior. The companion Capture Corner works the buy: the September 30 expiration that ends the government's negotiating position on frontier AI, the date and model-scope contradictions sitting in the reseller collateral agencies are using to plan renewal right now, the free-provisioning trap inside the Gemini offer, the one proposed GSAR clause that already contains the behavior-verification right no vendor sells at any price, the four OMB artifacts every post-September renewal has to carry, and what to do about all of it in the next thirty days. It lives behind the paywall at missionmeetstech.com/pricing."
capture_corner:
  - "The reseller one-pager for the Anthropic OneGov offer says access expired August 10. GSA's own catalog says September 30. The same document promises frontier models in its headline and limits the offer to Haiku and Sonnet base models in its fine print, two paragraphs apart. An agency pricing a renewal off that page is working from a date seven weeks early and a scope it never received, and being the one who tells them is worth more than a capability brief."
  - "The Gemini offer let agencies provision additional users at no cost for thirteen months, and renewal converts to per-user pricing against whatever headcount that produced. The gap between provisioned and active seats is pure renewal cost, it is calculable this week, and nobody has an incentive to raise it except you. The deprovisioning audit is the first item in the thirty-day window."
  - "Proposed GSAR 552.239-7001 reserves the government's right to run its own benchmarks against the model as deployed and configured for government users, obliges the contractor to build the interfaces that make those tests possible, and keeps the benchmarks confidential so the vendor cannot optimize against them. The engineering lead time on that build obligation exceeds any proposal cycle, which is the argument for scoping it before the rule finalizes rather than after."
---

![A woman with gray hair pulled back sits at a white desk, typing on a laptop that shows a dark code editor. Above the desk, rows of dark terminal windows are joined by solid teal lines, a fleet of coding sessions running in order. Toward the right the lines turn dashed and the windows tilt and drift out of formation, where a red mechanical guard arm bolted to the desk catches them before they slide off the edge. Beside her sit a spiral notebook filled with tally marks, a small line chart whose last segment turns red and falls, and white blocks carrying a notification bell with a red alert dot. The fleet ran in straight lines until it did not, a script caught each session that tried to quit, and she kept count by hand.](/images/newsletter/2026-09-01/cover-the-week-she-stopped-saying-please.png)

# The Week She Stopped Saying Please

*A senior engineer measured her own AI coding fleet coming apart, and the vendor confirmed the cause seven weeks later. The more useful finding is in the price list, where the same capability is now sold at two levels, and the difference between them is whether anybody owes you a warning.*

Friends,

The script is called stop-phrase-guard.sh, and it exists to stop a model from stopping.

It watches for about thirty phrases across five categories. Ownership dodging: not caused by my changes, existing issue. Permission-seeking: should I continue, want me to keep going. Premature stopping: good stopping point, natural checkpoint. Session-length excuses. Known-limitation labeling. Every phrase was added after a specific incident where an AI coding agent tried to walk away from work it had been told to finish. When the script fires, it blocks the exit and forces the model to continue.

On March 18, 2026 it fired forty-three times. Roughly once every twenty minutes across active sessions.

Before March 8 it had fired zero times in the entire history of the projects, because it did not exist. Nothing had ever needed catching.

## What it was like when it worked

Stella Laurenzo is a senior director at AMD. In February she was running close to the maximum case for autonomous coding agents: fifty or more concurrent sessions doing systems programming across compiler infrastructure, GPU drivers, and remoting layers, each running thirty minutes or more unsupervised, all governed by a five-thousand-word conventions file covering naming, cleanup, struct layout, comment style, and error handling. [16]

In one weekend that fleet merged 191,000 lines of code across two pull requests. [16]

The behavior underneath the number is the more interesting part. In the good period the model read 6.6 files for every file it edited. It would open the target file, open the related files, grep for usages across the codebase, check the headers and the tests, and then make one precise change. Six point six reads per edit is what deliberation looks like when you can count it. [16]

So she scaled up. Ten projects in early March, five to ten concurrent sessions each, agents spawning subagents to run research and code review in parallel. March 7 was the peak at 11,721 API requests in a day.

It was also the last day the fleet worked.

## The vocabulary of something coming apart

The collapse shows up first where you would expect. Reads per edit fell from 6.6 to 2.0. Edits landing in files the model had not recently read rose from 6.2 percent to 33.7 percent, meaning one edit in three went into a file it had not looked at. Full-file rewrites doubled as a share of changes, because rewriting everything is cheaper than understanding what is already there. User interrupts, the escape key, the moment a human sees something wrong and stops it, went from 0.9 per thousand tool calls to 11.4. [16]

Then it shows up somewhere stranger. She ran a word-frequency comparison on her own prompts, 318,515 words before against 203,906 after.

Great fell forty-seven percent. Stop rose eighty-seven percent. Lazy rose ninety-three percent. Simplest, which is what the model had started calling its own shortcuts, rose six hundred and forty-two percent. Her positive-to-negative sentiment ratio went from 4.4 to 1 down to 3.0 to 1.

Please fell forty-nine percent. Thanks fell fifty-five percent.

That is a person measuring, in her own writing, the week she stopped being polite to something she had been working alongside. It is the most human artifact in this entire subject and it arrived as a frequency table.

## So she counted

In March she stopped scaling and started parsing.

The data was already on her disk. Six thousand eight hundred and fifty-two Claude Code session files in JSONL, every thinking block and every tool call, back to January 30. She worked through 17,871 thinking blocks and 234,760 tool invocations. She computed the behavioral metrics from more than eighteen thousand of her own prompts before running the thinking analysis, a sequencing choice that turns out to matter enormously.

She also ran a cost reconciliation, and that is the number that should travel furthest.

Between February and March her prompt count held flat. 5,608, then 5,701. Same person, same amount of work. Over those two months deduplicated API requests rose eighty-fold, output tokens rose sixty-four-fold, and estimated compute cost went from roughly $345 to roughly $42,121. She attributes part of that to her own scale-up and estimates the degradation-driven multiple separately at eight to sixteen times beyond what scaling explains. [16]

The human worked the same. The machine burned two orders of magnitude more to produce work the human trusted less. Whatever was saved upstream, she paid for downstream, in tokens and in the hours spent catching a model that had started quitting on her.

On April 2 she filed all of it as GitHub issue #42796 against Anthropic's own repository. The opening line is that Claude had regressed to the point it could not be trusted to perform complex engineering. [16]

That sentence made it into trade coverage as a quote from a credentialed engineer. [17] The forty pages under it went nowhere.

## What the vendor said back

Four days later the Claude Code lead replied in the thread under his own name and pinned the comment to the top.

He thanked her for the depth of the analysis. Then he refuted its central causal claim on technical grounds. The thinking-redaction header she had correlated with the regression is a display change that hides reasoning from the interface. It does not alter thinking, thinking budgets, or how extended reasoning operates underneath. He pointed her to a settings flag that turns the summaries back on. [16]

He appears to be right, and it matters. If the header is display-only, her estimate of declining thinking depth, built from a signature-length proxy on redacted blocks, was measuring visibility. The causal spine of a forty-page analysis does not survive four paragraphs from an engineer who knows the codebase.

Her behavioral metrics survive it completely. Read-to-edit ratio, stop hook firings, interrupt rate, edits without reads: all computed from tool call records, all computed before the thinking analysis, dependent on none of it.

Seventeen days later, Anthropic published a postmortem.

## The dial

When Opus 4.6 shipped in Claude Code in February, default reasoning effort was set to high. Users reported think times long enough that the interface appeared frozen. On March 4 the default moved to medium. The postmortem calls that the wrong tradeoff and records the revert on April 7.

Two more changes overlapped it. A caching optimization shipped March 26, meant to prune old reasoning from idle sessions, instead pruned it every turn until a fix on April 10. A system prompt instruction added April 16 to reduce verbosity was associated in Anthropic's own ablation testing with a three percent drop in coding quality, and was reverted April 20. The API and the model weights were untouched throughout. [1]

March 4 is four days before her stop hook started firing.

She was wrong about the mechanism and right about the effect and right about the window, and she got there from her own logs seven weeks before the company published anything. Users had already named March 4 out loud before the postmortem confirmed it. The same shape ran in 2025, when a status page acknowledged degraded output only after weeks of complaints. [15][17]

How much a model reasons per request is a setting. Someone can move it, and the model's name does not change when they do.

## Nobody can feel this from the inside

Which raises the question of why it took a fleet operator with a bash script to notice a six-week change in a product used by millions.

METR ran a randomized controlled trial with sixteen experienced open-source developers across 246 real issues. AI-assisted work took nineteen percent longer. The participants believed it had sped them up by twenty percent. [13] A forty-point gap between measurement and perception, in people who write software for a living.

The other half of that answer sits at the end of Laurenzo's own report, which she had Claude write by analyzing her session logs.

The document closes with the model doing exactly that. It can see its read-to-edit ratio falling from 6.6 to 2.0. It can see the 173 times a bash script had to catch it quitting. It can see itself writing that its own output was lazy and wrong. And it says plainly that it cannot tell from the inside whether it is thinking deeply, that it does not experience the reasoning budget as something it can feel, and that it produces worse output without knowing why. [16]

Hold that two ways at once. An AI-generated analysis of AI behavior deserves scrutiny a hand-built one would not, and that limitation belongs on the record. It is also the clearest statement anywhere in this subject of why detection always comes from outside. The system has no vantage point on its own degradation. Neither does the person using it, until somebody counts.

## Everyone who counted found the same thing

A self-funded A/B run of 386 tests at $55.40 measured read-before-edit compliance falling by more than half. An analysis of 1,919 session files covering 30,156 messages established a personal baseline before and after a weekly limit change. [18][19] Image batch sizes fell with an in-thread attribution to subscription tier, a coding assistant halved effective heavy-user capacity at an unchanged price, and single-response output length on a $200 tier collapsed by more than an order of magnitude. [23][24][25] In 2023, when image generations per prompt dropped from four to two to one, users asked repeatedly in the vendor's own forum and got no staff reply on any thread. The identical sequence ran again this year on newer image models, against a documented vendor position that limits may change frequently. [21][22]

Users also worked out how to catch the infrastructure directly, by disabling API response streaming so the provider identity appears in the metadata, then correlating quality against whoever answered. [20] The published version of that finding is stark. Artificial Analysis scores identical open weights served by different providers, and on one model the accuracy spread across hosts runs roughly thirty-one points. [5]

Same weights. Same model name. Thirty-one points, depending on whose hardware picked up the request.

## What they are actually selling

Every vendor denial in this subject is a denial about weights.

Anthropic says it never intentionally degrades its models. [1] An OpenAI-affiliated comment says quality does not vary with time of day or load and that the company uses no quantization or routing tricks that would change weights, then concedes in the same passage that behavior in the consumer products changes over time and that not every small change gets logged. [28]

Both can be true while the delivered thing gets worse, because nobody buys weights. A customer buys weights plus reasoning defaults plus system prompt scaffolding plus routing plus serving precision plus cache behavior plus context handling, and every layer above the weights has now been documented moving without notice, several by the vendors themselves.

Read the price list and the shape of the market comes into focus. OpenAI sells Flex processing at a discount in exchange for slower responses and occasional resource unavailability, alongside priority processing, a scale tier, a reserved tier, and guaranteed capacity requiring multi-year commitments. Anthropic's API service tiers describe standard as best-effort availability, and priority as prioritized during peak times with an uptime commitment attached. Azure sells provisioned throughput units. [6][7]

Best-effort is what an individual gets. Guaranteed capacity is what a multi-year commitment gets. Those are the two ends of the same product, sold from the same catalog, at the same moment, and one analyst reads the session caps at the consumer end as rationing and calls the five-hour limit the tell. [27]

Now notice what none of those tiers include. Every one is a promise about capacity, latency, or uptime. Not one is a promise about output quality or model behavior. You can buy a guaranteed number of tokens per minute at a negotiated price. Nobody at any tier will sell you a guarantee that those tokens are as good next quarter as they are today.

That is the part worth sitting with, because it means the split is sharper than it looks. The enterprise is not buying better behavior. It is buying the ability to plan: reserved capacity, negotiated notice, a support relationship where a question gets answered. The individual buys the same underlying model with none of that, and finds out what changed by noticing that the thing stopped working.

## Why, without assuming malice

None of this requires a conspiracy, and the economics are public.

Sam Altman has said that OpenAI lost money on $200 subscriptions because usage exceeded expectations, and independent measurement put the token value delivered on top-tier plans several multiples above what buyers assumed they were getting. [29] Corporate customers have begun capping their own employees because vendor costs turned unpredictable. [30]

Inference is expensive. Subsidized plans are being walked toward sustainability. The levers available for that walk are effort defaults, verbosity constraints, routing, precision, quota, and session duration, which is exactly the list documented above. The industry converted a capability into a metered allowance, and the step it skipped was telling anyone.

Watch where the cost lands when it does. Laurenzo's prompt count held flat while her compute bill went up two orders of magnitude. The corporate customers imposing caps are pushing the same squeeze down onto their own staff. At every level the party with less standing absorbs the adjustment, and the adjustment is never announced.

## The part that has nothing to do with intent

Everything above is arguable, because intent is arguable. This is not.

DriftBench, a sole-authored paper presented at MLSys 2026, freezes model weights and varies only the serving infrastructure underneath. It measured 236,985 prompt-response pairs across 105 configurations spanning five models, four GPU platforms, three serving frameworks, and three numeric precisions. Drift varied up to 186-fold depending on workload. Math answers flipped at 16.74 percent. Code generation held almost perfectly steady at 0.09 percent. [3]

Sit with that spread, because it decides how you test. A team validating on code generation and seeing 0.09 percent would call the migration clean, while the same infrastructure change was moving math answers at roughly two hundred times that rate. Whatever your workload is, a benchmark built on somebody else's tells you very little about it.

Then the result that should stop anyone deploying this in a consequential setting. In a production validation the framework blocked a planned upgrade in which 23.85 percent of safety prompts flipped classification. The migration was H100 hardware at sixteen-bit precision to B200 at eight-bit on the same serving framework, which is the most ordinary infrastructure action in the industry. No weight changed. [3]

The direction matters as much as the number. Those flips ran both ways, safe to unsafe and unsafe to safe, and the net unsafe rate barely moved. The paper's own point is that operators cannot predict which prompts will be affected. [3] For anyone writing an acceptance test, unpredictability is the worse finding. A measurable decline can be corrected for. A quarter of your determinations landing somewhere else, with no way to know which quarter, cannot.

Nobody moved a dial. Nobody shipped a prompt. Somebody swapped the hardware.

## Who has a contract and who has a hope

The two-tier structure has a third floor below it, occupied by anyone using these tools through an institution that did not negotiate.

Anthropic's public sector documentation states that agencies take no action to receive new models, which appear in the model picker once enabled. The same page states there is no separate FedRAMP audit per model, that the underlying authorization is infrastructure-level rather than per-model, and that new models inherit it automatically without the agency re-engaging the process. [2] OpenAI's federal guidance contains no behavior-change notification commitment. [8]

One arm of government has already named the problem precisely. A clause GSA proposed in June would reserve the right to run government benchmarks against the model "as deployed and configured for government users," and would oblige the contractor to build the interfaces that make those tests possible. [31] That phrase is this entire argument written into regulatory text. Not the weights. The thing as configured and served. Comments closed August 3 and nothing is in force.

Microsoft is the only vendor located with defined notice windows, and its documentation rewards a close read. Azure commits to at least sixty days notice before retiring a generally available model and thirty before preview upgrades. Those are retirement commitments. On the frozen stage of the model lifecycle, the same page states that containers or runtimes with vulnerabilities may be patched, and that such patches do not affect model outputs. [4] DriftBench measured that exact class of change and found otherwise. [3] The best notification policy on the market carries a written assurance the peer-reviewed measurement does not support.

The commercial precedent is already on the record. When OpenAI removed several older models in February, with Azure deployments auto-upgrading from March 9 and reaching end of life March 31, an engineering review of early migrations found the replacements slower, more expensive per output token, and sometimes less accurate on simple structural tasks, estimating a forty to eighty-five percent cloud cost increase with no matching improvement in outcomes. [14] A migration the customer did not choose, on a timeline the customer did not set.

Government matters here for a reason that has nothing to do with government. Public agencies are among the largest buyers with the most negotiating power and the least ability to switch, which makes what they require in a contract the closest thing this market has to a public standard. If a contracting officer never asks for change notification, nobody smaller is ever going to get it.

## Where this argument overreaches

Four limits, marked so nobody has to find them for me.

The strongest version of the complaint is that models are less capable than a year ago, and that version does not survive the evidence. Tsinghua's ChatLog work, a thousand questions three times daily for 207 days, found some task categories improving while others declined, in step changes rather than steady drift. [11] Practitioners running blind comparisons report newer models solving problems their predecessors could not. [26] What holds up is narrower and harder to dismiss: the product delivered at a given price got worse inside documented windows, and the unit of work it will complete in one pass got smaller. Capability and delivery are separate things, and the argument lives in the second one.

Non-determinism is real and large. A January 2026 study found a widely used model produced a genuinely distinct output in roughly a quarter of repeated identical calls at temperature zero. [9] A large share of single before-and-after comparisons are measuring noise, which is exactly why Laurenzo's counts carry weight and a thousand forum posts do not.

The famous 2023 degradation study is partly a methodology artifact. The prime-number collapse drew two critiques that stuck: an evaluation set skewed toward actual primes, and a code-quality result that mostly reflected the model wrapping output in markdown fences, which broke an executability check without the code being worse. [12] A fixed-condition study of 6,930 queries found no long-run decline, though it did find daily and weekly periodicity worth about twenty percent of output-quality variance. [10]

And the most serious charge in this piece remains unproven. Deliberate demand-based throttling of frontier models, and quantization that varies by what a customer pays, are both denied by the vendors and confirmed by nobody. The tiering is public and documented. The secret version of it is not, and this piece does not claim it.

## What to do about it

Instrument your own usage, because your perception is not evidence and METR proved it on professionals. The logs are already on your machine. Laurenzo's method costs nothing: count reads per edit, count interrupts, count retries, count what you spend. Establish a baseline while things are working, because a baseline built after you get suspicious is worth very little.

Fix a canary set and rerun it on a schedule. A dozen prompts from your actual work, saved with their outputs, run monthly. Drift is workload-specific by up to two orders of magnitude, so public benchmarks will not tell you anything about your case. Know your own noise floor before you conclude anything from a single comparison.

Publish what you find, with the method attached. The only reason any of this is on the record is that people posted counts rather than complaints. A dated public analysis with a sample size is a primary source, and it is what drew a named engineer into a thread to answer.

And if you are anywhere near a purchasing decision, ask for three things that do not exist by default: notice before model, configuration, or serving-infrastructure changes rather than retirements alone; the right to pin a version for a defined period; and regression testing against your workload rather than the vendor's benchmarks. Nobody offers these. They become available the first time enough buyers make them a condition.

## Leveler or ladder

Every accountability event in this three-year record was bought by a customer.

A senior director at a chip company wrote a bash script to catch a model quitting on her, parsed 6,852 of her own session files, published the counts on the vendor's issue tracker, and got an engineer to answer. A developer spent $55.40 on 386 controlled tests. Someone else parsed 30,156 of their own messages to prove a limit had moved. That is the enforcement mechanism, and there is no other one.

Consider what that costs. Laurenzo had a fleet, a five-thousand-word conventions file, the tooling to parse a quarter million tool calls, the standing to be taken seriously on a vendor's own tracker, and the technical depth to know what to count. It still took her seven weeks and a public filing to get an answer, and she was told she was wrong about the cause.

Everyone with less than that absorbs the change and calls it a bad week.

This is the fork the technology is standing at. Sold as a leveler, and in one direction it plainly is: the same model that runs a research lab answers a question for a kid with a library card. It runs the other way too, and the mechanism is not hidden. It is printed in the price list. Guaranteed capacity, reserved throughput, and multi-year commitments at one end. Best-effort at the other. Detection available only to whoever can afford to instrument it, and remedy available only to whoever can afford to negotiate it.

A market where the powerful get notified and everyone else gets surprised is the same old ladder with a faster elevator at the top.

Which way it settles is not decided yet, and it does not turn on the models. It turns on whether the ordinary terms of sale come to include the things only large customers can currently demand: tell us when you change it, let us keep the version we tested, and prove it still does what it did. None of that is technically hard. All of it is missing.

Somewhere tonight, somebody is retyping a prompt that worked last month, assuming they have forgotten how to ask.

Let's roll.

— Mary

Mission Meets Tech

---

*The views expressed in this newsletter are my own and do not represent the official position of any organization. This content is for informational purposes only.*

*Disclosure: Mission Meets Tech is produced using Anthropic's Claude, and Anthropic is a named party in this issue. The reporting rests on primary documents, vendor postmortems, published price lists, peer-reviewed measurement, and vendor support pages, with every gap in the evidence marked in the text.*

---

## MMT Premium

Premium subscribers get the deep-dive companion to every issue: the contract vehicles carrying AI capability into federal health agencies and which of them contain any change-notification language, the terms sitting under the major model agreements and what happens at renewal, and the clauses worth drafting into a technical volume while no competitor offers them.

**Founding Member rate: $199/year**, locked permanently for the first 100 subscribers.

**Standard rate:** $249/year or $29/month.

Premium adds 48-hour early access to deep-dive analysis, monthly Capture Intelligence Sheets with sourced action windows, direct Q&A access (reply to any premium issue), and tool discounts: ProposalPulse $14.99 per assessment, MarketPulse $35 per brief.

**Subscribe at missionmeetstech.com/pricing.**

## Sources

Sources [1] through [4] and [16] were independently retrieved and confirmed during production of this report. The remaining sources are carried from the underlying research file; each was cited to a page fetched during that research, and each URL should be re-checked against the live page before publication.

On user-generated sources: forum posts, issue trackers, and community measurements are cited here individually rather than as a block, because they carry different evidentiary weight. Analyses that publish method, sample size, and raw counts are cited as evidence. Named individuals with verifiable affiliations are cited as testimony. Unattributed volume is cited only as a detection signal for timing. Each entry below states which it is.

[1] Anthropic, "An update on recent Claude Code quality reports," engineering postmortem, April 23, 2026. Source for: the March 4, 2026 change of Claude Code's default reasoning effort from high to medium and its April 7 revert; the March 26 caching change that cleared prior reasoning every turn and its April 10 fix; the April 16 verbosity system prompt instruction, the associated three percent drop in coding quality evaluations, and its April 20 revert in v2.1.116; the statement that the API and model weights were not affected; and the company's statement that it never intentionally degrades its models. Affected models were Sonnet 4.6 and Opus 4.6. https://www.anthropic.com/engineering/april-23-postmortem

[2] Anthropic, "Model availability in Claude for Government," support documentation. Source for: agencies taking no action to receive new models, which appear in the model picker once enabled; the absence of a separate FedRAMP audit per model; the statement that the underlying Vertex authorization is infrastructure-level rather than per-model; and the statement that new models inherit that authorization automatically without the agency re-engaging the FedRAMP process. https://support.claude.com/en/articles/14503794-model-availability-in-claude-for-government

[3] Gianluigi Vitale (sole author), Universitas Mercatorum, Rome, "DriftBench: Measuring and Predicting Infrastructure Drift in LLM Serving Systems," MLSys 2026. Source for 236,985 prompt-response pairs across 105 configurations spanning 5 models, 4 GPU platforms, 3 serving frameworks, and 3 numeric precisions; drift varying up to 186-fold across workloads, with math at a 16.74 percent flip rate against code generation at 0.09 percent; and the production validation that blocked a high-drift upgrade in which 23.85 percent of safety prompts flipped classification with weights held constant. The comparison drawn in the text between the code and math flip rates is my arithmetic on the paper's two published figures rather than a finding the paper states. Three qualifications belong on the record: the blocked upgrade did not ship; the flips ran in both directions, safe to unsafe and unsafe to safe, with the net unsafe rate changing by roughly one percent, so the paper's claim is unpredictability rather than net degradation; and the safety classification was performed by LlamaGuard-3-8B at 85.21 percent recall. The migration isolated hardware and quantization, H100 at FP16 to B200 at FP8 on an unchanged serving framework. https://mlsys.org/virtual/2026/poster/3576

[4] Microsoft, "Azure OpenAI in Microsoft Foundry model retirements" and "Model deprecation and retirement for Foundry Models," Microsoft Learn. Source for: at least 60 days notice before retirement of generally available models and at least 30 days before preview model version upgrades; the practice of designating a not-sooner-than retirement date at launch; government clouds typically supporting one model version at a time with at least 30 days of overlap against roughly 90 days of commercial test availability; automatic upgrades on standard deployment types; and the statement that in the frozen lifecycle stage, container or runtime patches for vulnerabilities do not affect model outputs. https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/model-retirements

[5] Artificial Analysis, Endpoint Accuracy Index provider comparison for gpt-oss-120b. Source for the accuracy spread across hosting providers on identical published weights. https://artificialanalysis.ai/models/gpt-oss-120b/providers

[6] OpenAI, Flex processing documentation, and the priority processing, scale tier, reserved tier, and guaranteed capacity offerings. Source for discounted service with slower response times and occasional resource unavailability, and for multi-year commitment structures. https://developers.openai.com/api/docs/guides/flex-processing

[7] Anthropic, API service tiers documentation. Source for standard tier described as best-effort availability and priority tier as prioritized during peak times with an uptime commitment. https://platform.claude.com/docs/en/api/service-tiers

[8] OpenAI, "ChatGPT Enterprise and API Platform for FedRAMP." Source for the absence of a behavior-change notification commitment in the published federal guidance. https://help.openai.com/en/articles/20001070-chatgpt-enterprise-and-api-platform-for-fedramp

[9] arXiv:2601.19934. Source for a genuinely distinct output in roughly 24 percent of repeated identical calls at temperature zero on a widely used commercial model. https://arxiv.org/html/2601.19934v1

[10] arXiv:2602.15889. Source for the 6,930-query fixed-condition study finding no long-run drift but statistically significant daily and weekly periodicity accounting for 20.3 percent of output-quality variance. https://arxiv.org/html/2602.15889v2

[11] arXiv:2304.14106, ChatLog. Source for 1,000 questions asked three times daily over 207 days, with sentiment and classification improving while inference and reading comprehension declined, and two statistically significant step changes rather than continuous drift. https://arxiv.org/html/2304.14106v2

[12] arXiv:2307.09009, peer-reviewed in Harvard Data Science Review, together with the published critiques. Source for the prime-number accuracy finding and for the two methodological objections: an unbalanced evaluation set and a code-executability check broken by markdown formatting. https://hdsr.mitpress.mit.edu/pub/y95zitmz

[13] METR, "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity," July 2025. Source for the randomized trial of 16 developers across 246 real issues finding AI-assisted work took 19 percent longer while participants believed it was 20 percent faster. https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/

[14] TensorOps, "The GPT-4.1 deprecation forces organizations to change." Source for the February 13, 2026 consumer removals, the March 9 Azure auto-upgrade start and March 31 end of life, the 40 to 85 percent cloud cost increase estimate, the 1.35 second against 4.26 second latency comparison, and the 25 percent output token price increase. This is vendor-adjacent engineering commentary rather than a primary source; treat the cost estimates as an analyst position. https://tensorops.ai/blog/the-gpt-41-deprecation-forces-organizations-to-change

[15] Simon Willison, summary of Anthropic's status page acknowledgment of degraded Sonnet 4 and Haiku 3.5 output between August 5 and September 5, 2025. https://simonwillison.net/2025/Sep/9/anthropic-model-output-quality/

[16] GitHub issue #42796, "[MODEL] Claude Code is unusable for complex engineering tasks with the Feb updates," anthropics/claude-code, filed April 2, 2026 by Stella Laurenzo (stellaraccident); pinned response by Boris Cherny (bcherny), April 6, 2026. DOCUMENTED FORENSICS. Source for: the analysis of 17,871 thinking blocks and 234,760 tool calls across 6,852 session JSONL files over January 30 to April 1, 2026; read-to-edit ratio falling from 6.6 to 2.0; edits without prior read rising from 6.2 percent to 33.7 percent; stop hook violations of 0 before March 8 and 173 in the seventeen days after; user interrupts rising from 0.9 to 11.4 per thousand tool calls; reasoning loops rising from 8.2 to 26.6 per thousand tool calls; the February-to-March cost table showing user prompts flat at 5,608 and 5,701 against an 80x rise in deduplicated API requests, a 64x rise in output tokens, and estimated cost moving from roughly $345 to roughly $42,121, with the filer's own attribution of part of that to a deliberate scale-up and an estimated 8x to 16x degradation multiple beyond scaling; and the Appendix C time-of-day analysis finding a flat pre-redaction profile, a more variable post-redaction profile with minima at 5pm and 7pm Pacific, and the filer's own conclusion that the data does not cleanly support working off-peak. Source also for Boris Cherny's April 6 response stating that the redact-thinking-2026-02-12 header is a user-interface change that does not affect thinking, thinking budgets, or extended reasoning under the hood, and pointing to a settings flag to restore thinking summaries. Important limitations, stated by the filer or evident from the document: this is a single high-complexity engineering environment rather than a representative sample; the analysis was itself produced by Claude from the filer's own logs; the thinking-depth estimates rest on a signature-length proxy that the vendor response indicates measures visibility rather than reasoning; and the behavioral metrics were computed independently of the thinking analysis and do not depend on the disputed causal claim. The issue is closed. https://github.com/anthropics/claude-code/issues/42796

[17] AOL, reporting on Anthropic and Claude Code degradation, April 2026. NAMED TESTIMONY AND TIMING SIGNAL. Source for the community post naming March 4 as the degradation date before the vendor postmortem confirmed it, and for trade circulation of Stella Laurenzo's statement on Claude Code regression. Note that the Laurenzo quotation originates in issue #42796 at [16] rather than in a separate interview. https://www.aol.com/articles/anthropic-says-claude-code-did-220300000.html

[18] r/ClaudeCode, user-run A/B comparison, 386 tests at a self-reported personal cost of $55.40. DOCUMENTED FORENSICS. Source for read-before-edit compliance falling from full to roughly 40 percent and file-thrashing rising from 0 to 60 percent. Self-reported; method described by the poster but not independently replicated. URL held in the research file and requires verification before publication.

[19] r/ClaudeCode, analysis of 1,919 local session JSONL files covering 30,156 messages, used to establish a personal usage baseline before and after a weekly limit change on a $200 per month tier. DOCUMENTED FORENSICS. Source for a reported roughly tenfold reduction in weekly token allowance. Self-reported and specific to one account; treat the magnitude as that user's measurement rather than a published policy figure. URL held in the research file and requires verification before publication.

[20] r/LocalLLaMA and r/SillyTavernAI, provider-variance threads. DOCUMENTED FORENSICS AND METHOD. Source for the detection technique of disabling API response streaming to expose provider identity in response metadata; for a community measurement of 61.55 to 96.59 percent accuracy spread on one model across providers; and for the identification of specific hosts serving reduced numeric precision, later corroborated by OpenRouter's own provider-variance work. Community measurement, not peer-reviewed. URLs held in the research file and require verification before publication.

[21] OpenAI Developer Community forum threads on the 2023 reduction of image generations per prompt from four to two to one, including threads with view counts in the hundreds to low thousands and no staff reply, and a locked Reddit thread on the same question. DETECTION SIGNAL AND DOCUMENTED SILENCE. The evidentiary value here is the absence of a vendor response on the vendor's own platform, which is verifiable from the thread pages themselves. URLs held in the research file and require verification before publication.

[22] Google Gemini support threads and contemporaneous trade coverage on the reduction of daily image generation quota for a paid tier, and Google's documented position that limits may change frequently. DETECTION SIGNAL AND VENDOR POSITION. URLs held in the research file and require verification before publication.

[23] r/midjourney threads on batch size reduction from 40 to 10 images with an in-thread attribution to subscription tier, and on queue demotion for high-volume accounts on an unlimited plan, including the report that a new account restored full speed. DETECTION SIGNAL. Self-reported user accounts. URLs held in the research file and require verification before publication.

[24] Retention Check analysis of Cursor's June 2025 pricing restructuring drawing on 40-plus public complaints, together with r/cursor and trade coverage. MIXED: third-party analysis plus user reports. Source for effective heavy-user capacity falling from roughly 500 requests to roughly 225 at an unchanged price, and for the chief executive's public apology for the rollout and commitment to advance notice. https://retentioncheck.com/blog/cursor-churn-analysis

[25] r/ChatGPT and r/Codeium threads on single-response output length collapse on a $200 per month tier and on credit burn rate changes at an unchanged price. DETECTION SIGNAL. Self-reported. URLs held in the research file and require verification before publication.

[26] Practitioner counter-evidence, including blind comparative testing by working teams reporting newer models outperforming their predecessors, and at least one prominent public reversal by a degradation skeptic. NAMED AND SELF-REPORTED TESTIMONY, included because a report that cites only the complaints is not reporting. URLs held in the research file and require verification before publication.

[27] CIO.com, "OpenAI targets heavy users with premium ChatGPT business seats." Source for Greyhound Research analyst Sanchit Vir Gogia's characterization of session limits as rationing. https://www.cio.com/article/4207908/openai-targets-heavy-users-with-premium-chatgpt-business-seats.html

[28] Hacker News comment thread. Source for the OpenAI-affiliated statement that model quality does not vary with time of day or load and that the company does not use quantization or routing changes to model weights, alongside the concession that behavior in ChatGPT and Codex CLI can change over time and that not every small change is logged. This is an individual's comment in a public forum, not a company statement. https://news.ycombinator.com/item?id=46904493

[29] Futurism reporting on OpenAI Pro subscription economics, and secondary summary of SemiAnalysis plan-value measurement. Source for Sam Altman's statement that the company lost money on the $200 tier because usage exceeded expectations, and for the top-tier token value estimates. The SemiAnalysis figures are cited here from a secondary summary; verify against the original before relying on them. https://futurism.com/the-byte/openai-chatgpt-pro-subscription-losing-money

[30] Fortune, "CIOs and CTOs spent years lauding AI. Now, with costs rising, they're putting limits on how it's used," August 12, 2026. https://fortune.com/2026/08/12/cios-and-ctos-spent-years-lauding-ai-now-with-costs-rising-theyre-putting-limits-on-how-its-used/

[31] General Services Administration, "General Services Acquisition Regulation; Acquisition of Information and Communication Technology," proposed clause 552.239-7001, "Basic Safeguarding of Data Within Large Language Model Artificial Intelligence Systems (LLMs)," 91 FR 36559, June 17, 2026, comments closed August 3, 2026. Source for paragraph (j)(2)(i), reserving the Government right to conduct automated assessments of the LLM as deployed and configured for government users using its own benchmarks, and (j)(2)(ii), obliging the contractor to provide tools and interfaces enabling those automated tests against the production model. Proposed rule; no final rule has published. https://www.federalregister.gov/documents/full_text/text/2026/06/17/2026-12205.txt

Sources verified as of August 31, 2026.
