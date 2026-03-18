# Email Infrastructure Setup — Mission Meets Tech

This guide covers setting up domain email (Google Workspace) and transactional email (Resend) for missionmeetstech.com.

---

## 1. Google Workspace Setup

### Sign up
1. Go to [workspace.google.com](https://workspace.google.com) and start a trial
2. Use domain: `missionmeetstech.com`
3. Create admin account: `mary@missionmeetstech.com`

### Add MX Records in Netlify DNS

Go to **Netlify > Domain settings > DNS** and add these MX records:

| Priority | Mail Server |
|----------|-------------|
| 1 | ASPMX.L.GOOGLE.COM |
| 5 | ALT1.ASPMX.L.GOOGLE.COM |
| 5 | ALT2.ASPMX.L.GOOGLE.COM |
| 10 | ALT3.ASPMX.L.GOOGLE.COM |
| 10 | ALT4.ASPMX.L.GOOGLE.COM |

### Add Google DKIM Record

1. In Google Admin Console, go to **Apps > Google Workspace > Gmail > Authenticate email**
2. Click **Generate new record** for `missionmeetstech.com`
3. Copy the DKIM value and add it as a TXT record in Netlify DNS:
   - **Name:** `google._domainkey`
   - **Type:** TXT
   - **Value:** *(paste from Google Admin Console)*

---

## 2. Resend Setup

### Create account and verify domain
1. Sign up at [resend.com](https://resend.com)
2. Go to **Domains > Add Domain** and add `missionmeetstech.com`
3. Resend will provide DNS records to add:

### Add Resend DNS Records in Netlify

Resend will give you specific values. Add these record types:

| Type | Name | Value |
|------|------|-------|
| TXT | `resend._domainkey` | *(from Resend dashboard)* |
| TXT | `@` or specific subdomain | *(DKIM verification from Resend)* |
| CNAME | `[provided by Resend]` | `[provided by Resend]` |

4. Click **Verify** in Resend dashboard after adding records (DNS can take up to 48 hours)

### Get API Key
1. In Resend, go to **API Keys > Create API Key**
2. Name it `mmt-production`
3. Set permission to **Sending access** only
4. Copy the key (starts with `re_`)

### Add to Netlify
1. Go to **Netlify > Site settings > Environment variables**
2. Add: `RESEND_API_KEY` = `re_...` (your key)

---

## 3. SPF Record

Add a single TXT record that covers both Google and Resend:

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:_spf.google.com include:send.resend.com ~all` |

**Important:** There should only be ONE SPF record for the domain. If one already exists, merge the `include:` statements.

---

## 4. DMARC Record

Add a TXT record for DMARC monitoring:

| Type | Name | Value |
|------|------|-------|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:mary@missionmeetstech.com` |

Start with `p=none` (monitoring only). After confirming email delivery works correctly for a few weeks, consider upgrading to `p=quarantine` or `p=reject`.

---

## 5. Final DNS Records Summary

After setup, your Netlify DNS should have these email-related records:

```
# Google Workspace MX
MX  @   1   ASPMX.L.GOOGLE.COM
MX  @   5   ALT1.ASPMX.L.GOOGLE.COM
MX  @   5   ALT2.ASPMX.L.GOOGLE.COM
MX  @   10  ALT3.ASPMX.L.GOOGLE.COM
MX  @   10  ALT4.ASPMX.L.GOOGLE.COM

# SPF (covers Google + Resend)
TXT @   "v=spf1 include:_spf.google.com include:send.resend.com ~all"

# DKIM — Google
TXT google._domainkey   [value from Google Admin]

# DKIM — Resend
TXT/CNAME               [records from Resend dashboard]

# DMARC
TXT _dmarc  "v=DMARC1; p=none; rua=mailto:mary@missionmeetstech.com"
```

---

## 6. Gmail "Send As" Configuration (Optional)

If you want to send from mary@missionmeetstech.com in Gmail's web interface:

1. Open Gmail > Settings > **See all settings** > **Accounts and Import**
2. Under "Send mail as", click **Add another email address**
3. Enter: `Mary Womack` / `mary@missionmeetstech.com`
4. Since Google Workspace owns the domain, this should work automatically

---

## 7. Testing

### Test domain email
- Send an email to `mary@missionmeetstech.com` from an external account
- Confirm it arrives in the Google Workspace Gmail inbox

### Test transactional email
- Submit a Lethality Test on missionmeetstech.com
- Check that a score receipt email arrives at the email you submitted with
- Check the Resend dashboard for delivery status

### Test weekly report
Run locally with Netlify CLI:
```bash
netlify functions:invoke weekly-report --no-identity
```

### Verify DNS
Use [mail-tester.com](https://www.mail-tester.com) or [mxtoolbox.com](https://mxtoolbox.com/SuperTool.aspx) to verify:
- MX records resolve correctly
- SPF passes
- DKIM signatures are valid
- DMARC record is published

---

## Environment Variables Checklist

| Variable | Location | Status |
|----------|----------|--------|
| `RESEND_API_KEY` | Netlify env vars | Required for email sending |
| `ANTHROPIC_API_KEY` | Netlify env vars | Already set (score-deck.js) |
| `SUPABASE_URL` | Netlify env vars | Already set (score-deck.js, weekly-report.js) |
| `SUPABASE_SERVICE_KEY` | Netlify env vars | Already set (score-deck.js, weekly-report.js) |
