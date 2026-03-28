# Mission Meets Tech - Developer Governance

## 📜 Canonical Specification
- All structural and UX work MUST follow `ARCHITECTURE_SPEC.md`.
- This is the final word on site architecture and wireframes.

## 🛡️ Infrastructure (OpenClaw Integrity Suite)
- **Authority**: Fortress Worker (https://openclaw-fortress.marywomack.workers.dev)
- **Audit Tool**: `integrity-audit.js`
- **Verification**: You are FORBIDDEN from reporting a task as 'Done' until `node integrity-audit.js` returns 'SUCCESS/SYNCED'.

## 🛠️ Global SOP
1. Read `ARCHITECTURE_SPEC.md` before every ticket.
2. Execute repairs in a "Ticket-Based Sprint."
3. Run the Fortress Audit after every implementation pass.
