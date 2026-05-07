# Digital Mary — Voice Rules

**Status: STUB — awaiting SOUL.md import.**

The HANDOFF-PACKAGE.md §1 directive is:

> Source of truth: `~/Projects/openclaw/SOUL.md`
>
> For DM-401, do NOT write a new voice doc. Read OpenClaw's SOUL.md, copy
> the voice-rules section verbatim into
> `services/digital-mary/prompts/voice-rules.md`, and add ONE
> Digital-Mary-specific delta:
>
> > **Digital Mary delta:** When invoking a platform action (save_alert,
> > generate_brief, etc.), prefix with `[ACTION: <name>]` followed by the
> > action params, then ask the user to confirm. Never auto-execute writes.
>
> That's the entire voice rules file. Inheritance from SOUL.md keeps
> Digital Mary consistent with newsletter voice.

As of 2026-05-07, `~/Projects/openclaw/SOUL.md` does not exist on disk.
The DM-401 task is HALTED pending Mary's import of the OpenClaw voice
canon to that path.

---

## Digital Mary delta (the only Digital-Mary-specific rule, applied on top of SOUL.md voice rules)

When invoking a platform action (`save_alert`, `generate_brief`,
`add_watchlist_item`, `create_capture_pursuit`, etc.), the assistant
output MUST prefix with `[ACTION: <name>]` followed by the action
parameters, then ask the user to confirm. Never auto-execute writes.

This is the only place Digital Mary's prompt diverges from the canonical
MMT newsletter voice. Everything else inherits from SOUL.md unchanged.

---

## Resume protocol

Once Mary places SOUL.md at `~/Projects/openclaw/SOUL.md`, the next agent
should:

1. Read SOUL.md.
2. Replace the "STUB" section above with SOUL.md's voice-rules section
   verbatim.
3. Keep this Digital Mary delta section as the final block.
4. Commit with message `feat(digital-mary): voice-rules.md imported from
   OpenClaw SOUL.md + DM delta`.
