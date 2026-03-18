# MissionMeetsTech.com Monitoring Setup Guide

## 1. UptimeRobot (Free — 50 monitors, 5-min intervals)

Create account at https://uptimerobot.com

### Monitors to create

| Name | URL | Type | Interval |
|------|-----|------|----------|
| MMT - Homepage | https://missionmeetstech.com | HTTP(s) | 5 min |
| MMT - Podcast | https://missionmeetstech.com/podcast | HTTP(s) | 5 min |
| MMT - Newsletter | https://missionmeetstech.com/newsletter | HTTP(s) | 5 min |
| MMT - Resources | https://missionmeetstech.com/resources | HTTP(s) | 5 min |
| MMT - ProposalPulse | https://missionmeetstech.com/proposal-pulse | HTTP(s) | 5 min |
| MMT - About | https://missionmeetstech.com/about | HTTP(s) | 15 min |
| MMT - Latest | https://missionmeetstech.com/latest | HTTP(s) | 15 min |
| MMT - Contract Tracker | https://missionmeetstech.com/contract-tracker | HTTP(s) | 15 min |
| MMT - SSL Check | https://missionmeetstech.com | Port 443 | 60 min |
| MMT - Plausible | https://plausible.io/api/health | HTTP(s) | 60 min |

### Alert contacts
- Primary: mary@missionmeetstech.com
- Backup: maryadawson@gmail.com

## 2. Plausible Analytics
Dashboard: https://plausible.io/missionmeetstech.com
Watch weekly: unique visitors, pageviews, top pages, top referrals.

## 3. Buttondown
Dashboard: https://buttondown.com/dashboard
Monitor: subscriber growth, open rate, bounces/unsubscribes.

## 4. GitHub Actions (Automated)

| Workflow | Schedule | Coverage |
|----------|----------|----------|
| Health Check | Every 6 hours | 24+ point site health audit |
| Link Check + Freshness | Mondays 9am UTC | Broken links + content age |
| Post-Deploy | On every Netlify deploy | Full verification after deploy |
| Performance Audit | 1st of month | Lighthouse scores, 3 pages |

Issues auto-created when problems found.
- `sentinel-alert` = needs action
- `sentinel-report` = routine reporting

## 5. GitHub Actions Secrets Required

Settings → Secrets → Actions:

| Secret | Source |
|--------|--------|
| `ANTHROPIC_API_KEY` | console.anthropic.com |

Most checks use public URLs only. No Stripe or Netlify secrets needed for monitoring.

## 6. Cost Summary

| Service | Monthly Cost |
|---------|-------------|
| UptimeRobot Free | $0 |
| GitHub Actions Free tier | $0 |
| Lighthouse CI | $0 |
| Claude Code (if using local cron) | ~$3–8/mo |
| **Total** | **$0–8/month** |
