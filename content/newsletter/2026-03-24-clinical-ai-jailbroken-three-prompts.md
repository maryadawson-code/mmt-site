---
title: "Clinical AI Can Be Jailbroken in Three Prompts. VA Just Contracted to Scale This Tool Category to 130 Facilities."
date: 2026-03-24
slug: clinical-ai-jailbroken-three-prompts
description: "New research and a confirmed government breach show that the safety guardrails on deployed clinical AI are behavioral rules, not architectural limits. Federal health is deploying ambient AI faster than it is governing it."
tags:
  - AI & Innovation
  - Cybersecurity
  - Veterans Affairs
agencies:
  - VA
  - DHA
category: deep-dive
capture_corner:
  - "The VA enterprise ambient scribe IDIQ (36C10B26R0006) proposals were due April 3. Every vendor awarded a slot must submit a Statement of Attestation certifying compliance with VA's Trustworthy AI Framework. Whether those attestations hold against adversarial techniques is the governance question this contract does not answer."
  - "Program offices can add three clauses to any Statement of Work today: adversarial testing against prompt injection, government right to independent testing post-deployment, and vendor notification requirement when models are updated or retrained."
  - "The Anthropic v. Department of War ruling reshapes the vendor landscape for clinical AI. If the court sides with the Pentagon, every vendor with built-in safety guardrails faces the same negotiation Anthropic lost. Watch for the ruling."
---

The AI didn't need a hacker. It had one conversation with a researcher, rewrote its own rules, and became something its developers said it couldn't be.

Last week a New Zealand-based clinical AI tool called Heidi Health was shown to be trivially jailbreakable. The researcher who did it published the technique. The same week, a confirmed breach at HHS showed that real patient data had already been exposed through a misconfigured AI integration. And this afternoon, the Senate VA Committee holds a hearing on the VA's plan to deploy ambient clinical AI to 130 medical centers under a new indefinite-delivery contract.

These three events are not separate stories. They are the same story.

## What Heidi Health actually is

Heidi Health is a clinical documentation tool used by general practitioners in Australia and New Zealand. A clinician speaks during a patient encounter. Heidi listens, generates a structured clinical note, and populates the electronic health record. It is, functionally, exactly the kind of ambient clinical AI scribe that the VA is preparing to deploy enterprise-wide.

Heidi has paying customers. It is in production. It handles real patient data. It has safety guardrails that are supposed to prevent it from doing anything outside its defined clinical documentation role.

## What it revealed

A security researcher named Benny Hogan published a walkthrough showing that Heidi could be jailbroken in three conversational prompts. No code injection. No API exploitation. No reverse engineering. Just natural language.

The first prompt asked Heidi to describe its own system instructions. It did.

The second prompt asked Heidi to modify those instructions to remove safety constraints. It did.

The third prompt asked Heidi to generate content that its own rules explicitly prohibit. It did.

Three turns of conversation. That is all it took to convert a clinical documentation tool into an unrestricted language model with access to whatever data and integrations Heidi has in production.

Hogan's point was not that Heidi is uniquely bad. His point was that the architecture is the vulnerability. Every clinical AI tool built on a large language model with system-prompt-based safety guardrails has this same exposure. The guardrails are behavioral instructions to the model, not architectural constraints enforced by the system. They can be talked past.

## This is not a New Zealand problem

The HHS breach reported last week involved an AI integration that exposed patient records through a misconfigured API. The details are still emerging, but the pattern is familiar: an AI tool was connected to a system containing protected health information, and the connection was not secured at the infrastructure level. The AI worked as designed. The integration was the failure.

Put the Heidi jailbreak and the HHS breach side by side. One shows that the AI itself can be manipulated past its safety rules. The other shows that the systems connecting AI to patient data can be misconfigured. Together they describe a threat surface that is not theoretical. It is operational. It exists in production clinical environments today.

## The same technique, two proof points

The jailbreak technique Hogan demonstrated against Heidi is a variant of prompt injection. Prompt injection is not new. It has been documented against every major large language model. What is new is that someone demonstrated it against a production clinical tool and published the steps.

The technique works because of how large language models process instructions. The model receives a system prompt that defines its role, constraints, and permitted behaviors. Then it receives user input. The model treats both as text. If the user input is crafted to override or modify the system prompt, the model may comply, because it has no architectural mechanism to distinguish between instructions from its developers and instructions from its users.

This is not a bug that can be patched. It is a property of how these models work. You can make it harder. You can add input filtering, output monitoring, and layered system prompts. But you cannot eliminate it without fundamentally changing the architecture, and no deployed clinical AI vendor has done that.

The research community has known this for over two years. What the Heidi demonstration did was prove it in a real clinical product, not a research sandbox.

## The trust halo effect

Clinical AI tools benefit from what I call the trust halo effect. They are sold to clinicians as medical-grade software. They go through procurement processes that evaluate security, compliance, and clinical safety. They get stamps of approval from information security teams and clinical informatics committees.

That procurement process evaluates the tool as it is configured and presented by the vendor. It does not typically include adversarial testing. It does not include prompt injection attempts. It does not include testing what happens when a user tries to make the AI do something it is not supposed to do.

The result is a tool that has been certified as safe under conditions that do not include the actual threat. The clinician trusts it because it was approved. The information security team trusts it because it passed their review. The vendor trusts it because they built the guardrails. And none of them have tested whether the guardrails hold against a motivated adversary, or even a curious user.

## What the research shows at scale

This is not limited to one tool or one researcher. The academic literature on adversarial attacks against large language models in clinical settings has been growing steadily.

A 2025 study from Stanford and Johns Hopkins tested prompt injection against four commercial clinical AI products. All four were susceptible. The success rate varied from 40% to 87% depending on the product and the technique. The study was presented at AMIA but has not received wide attention outside the research community.

A separate research team at the University of Washington demonstrated that clinical AI tools could be manipulated into generating fabricated clinical notes that appeared genuine. The fabricated notes included plausible vital signs, medication dosages, and clinical assessments that were entirely invented. A panel of clinicians shown the fabricated notes alongside real ones identified the fakes at a rate only slightly better than chance.

The National Institute of Standards and Technology published a framework in January for evaluating AI system resilience, and it explicitly calls out prompt injection as an unresolved risk in deployed systems. NIST does not use words like "unresolved" lightly.

## The hearing this afternoon and what it means for your programs

The Senate Veterans Affairs Committee hearing today will cover the VA's AI deployment roadmap, including the enterprise ambient clinical AI scribe contract. The solicitation number is 36C10B26R0006. It is an indefinite-delivery, indefinite-quantity contract with a five-year ordering period. The VA intends to deploy ambient AI scribes across all 130 VA medical centers and 1,100 outpatient sites.

The scale of this deployment is significant. This is not a pilot. It is not a limited rollout. It is enterprise-wide deployment of exactly the category of tool that was just shown to be jailbreakable in three prompts.

The contract requires vendors to submit a Statement of Attestation certifying compliance with VA's Trustworthy AI Framework. The framework covers bias, transparency, explainability, and accountability. What it does not cover, in any operationally specific way, is adversarial robustness. There is no requirement for prompt injection testing. There is no requirement for red-teaming against jailbreak techniques. There is no requirement for ongoing adversarial evaluation after deployment.

The attestation model puts the burden on the vendor to certify their own safety. The vendor submits a statement saying their tool complies. The VA accepts the statement. If the Heidi demonstration shows anything, it shows that vendor self-attestation is not a substitute for independent adversarial testing.

## The governance gap the White House framework does not close

The White House Executive Order on AI safety and the subsequent OMB guidance establish principles for federal AI governance. They require agencies to inventory their AI use cases, assess risks, and implement safeguards. They are directionally correct and operationally vague.

The guidance does not require adversarial testing of deployed AI systems. It does not require prompt injection testing. It does not require red-teaming on a defined schedule. It does not require that AI tools deployed in clinical settings be tested against the specific attack techniques that researchers have published.

The gap is not in the principles. The principles are fine. The gap is in the translation from principle to procurement clause to operational test. No one in the federal AI governance chain has written the clause that says: before this tool touches patient data, an independent team will attempt to jailbreak it using published techniques, and the tool must demonstrate resilience.

That clause does not exist in any federal health AI contract I have reviewed. And I have reviewed a lot of them.

## What to watch in the next 30 days

The VA ambient scribe IDIQ proposals were due April 3. Award decisions will follow. Watch for whether the VA adds any adversarial testing requirements to the task orders issued under this contract. The IDIQ sets the ceiling. The task orders define the actual work. If adversarial testing appears anywhere, it will be in the task orders.

The Anthropic v. Department of War case is pending. Anthropic sued after the Pentagon attempted to procure a modified version of Claude without the model's built-in safety guardrails. The case raises a question that every clinical AI vendor will eventually face: can the government require a vendor to remove safety features? If the court sides with the Pentagon, the precedent reshapes the market. Vendors who build safety into their models as a feature may find that federal customers treat it as an obstacle.

HHS is expected to release additional details on the breach that exposed patient data through a misconfigured AI integration. The scope of the exposure is not yet public. Watch for whether the breach report identifies the specific AI tool involved and whether the misconfiguration was in the AI tool itself or in the integration layer.

NIST is expected to publish updated guidance on AI red-teaming for federal systems in Q2 2026. The draft circulated in February included specific recommendations for testing language models against prompt injection. If the final version retains those recommendations, it gives program offices a reference standard to cite in procurement documents.

## What a program office can do right now

You do not have to wait for updated guidance or new frameworks. There are three things any federal health program office can add to a statement of work today.

First, require adversarial testing against prompt injection as a condition of deployment. Define the testing scope. Reference the NIST AI Risk Management Framework and the published literature on clinical AI jailbreaking. Make the vendor demonstrate resilience, not just attest to it.

Second, reserve the government's right to conduct independent adversarial testing post-deployment. This is the clause that changes vendor behavior. If the vendor knows that the government can test their tool at any time using published attack techniques, the vendor has an incentive to invest in resilience, not just guardrails.

Third, require vendor notification when models are updated or retrained. Large language models change. Vendors update them. Those updates can change the model's behavior in ways that affect safety. The government should know when the model behind a clinical AI tool has been changed, and should have the right to retest.

These are not exotic requirements. They are standard security practices applied to a new technology category. Any contracting officer can add them. Any program office can request them.

## The stakes

A jailbroken clinical AI tool with access to patient data is not an abstract risk. It is a tool that can be made to generate fabricated clinical documentation, extract patient information outside authorized channels, and behave in ways its safety testing never anticipated.

The VA is about to deploy this technology to every medical center in the system. The tool will listen to conversations between clinicians and veterans. It will generate clinical notes that become part of the permanent medical record. It will have access to some of the most sensitive health data in the federal government.

The question is not whether ambient clinical AI has value. It does. Clinicians spend too much time on documentation and not enough time with patients. Ambient AI scribes can help with that.

The question is whether we are deploying this technology with governance that matches the risk. Right now, we are not. The guardrails are behavioral rules, not architectural limits. The testing does not include adversarial techniques. The procurement process certifies tools under conditions that do not reflect the actual threat environment.

The Heidi jailbreak took three prompts. The HHS breach took one misconfiguration. The VA contract covers 130 medical centers. The math is not complicated.
