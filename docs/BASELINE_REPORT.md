# MMT Site Baseline Report

**Generated:** 2026-03-04
**Agent:** MMT Sentinel v2.0

## Repository

- **Local path:** /Users/marywomack/mmt-site/
- **GitHub remote:** https://github.com/maryadawson-code/mmt-site.git
- **Branch:** main
- **Hosting:** Netlify (build command: `node build.js`, publish: `dist/`)

## Confirmed Pages (all return HTTP 200)

| Path | Status |
|------|--------|
| `/` | 200 |
| `/about` | 200 |
| `/podcast` | 200 |
| `/newsletter` | 200 |
| `/resources` | 200 |
| `/latest` | 200 |
| `/events` | 200 |
| `/proposal-pulse` | 200 |
| `/topics` | 200 |
| `/newswire` | 200 |
| `/contract-tracker` | 200 |

Newsletter article pages (e.g., `/newsletter/anthropic-ban-what-numbers-say/`) and topic pages (e.g., `/topics/ai-innovation/`) also confirmed live via sitemap.

## Performance Baseline

| Metric | Value |
|--------|-------|
| Total response time | 0.206s |
| Connect time | 0.042s |
| Time to first byte | 0.148s |

## SSL Certificate

| Field | Value |
|-------|-------|
| Subject | CN=missionmeetstech.com |
| Not Before | Jan 18, 2026 |
| Not After | Apr 18, 2026 |
| Days until expiry | ~45 (as of 2026-03-04) |
| Issuer | Let's Encrypt (via Netlify) |

## Security Headers (all present)

| Header | Value | Status |
|--------|-------|--------|
| Content-Security-Policy | `default-src 'self'; script-src 'self' https://plausible.io; ...` | Present |
| Strict-Transport-Security | `max-age=31536000` | Present |
| X-Content-Type-Options | `nosniff` | Present |
| X-Frame-Options | `SAMEORIGIN` | Present |
| Referrer-Policy | `strict-origin-when-cross-origin` | Present |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Present |

Note: HSTS is set by Netlify automatically (not in `_headers` file). The other 5 headers are defined in `_headers`.

## Third-Party Services

| Service | Present | Occurrences |
|---------|---------|-------------|
| Plausible Analytics | Yes | 2 |
| Buttondown | Yes | 3 |
| Stripe Checkout | Yes (CSP frame-src) | Via CSP |
| Riverside.fm | Podcast RSS (build.js) | Active |

## robots.txt

```
User-agent: *
Allow: /
Sitemap: https://missionmeetstech.com/sitemap.xml
```

## Sitemap

Valid XML sitemap at `/sitemap.xml` with 11 main pages + newsletter article pages + topic pages. Last modified dates show 2026-02-28.
