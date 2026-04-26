# Premium customer account fix — 2026-04-26

**Status: COMPLETE.** Live run at 16:30 UTC inserted `mp_users` rows for Dave Nelson
and Fred Hannett. The other 11 customers were already correct (the 4/22 backfill
covered them). Re-run dry-run at 16:37 UTC verified all 13 now read
`ok_active_founding`. No customer emails sent by this script — Mary owns the reply.

## What this fixed

13 customers paid \$199 Founding 4/14–4/24. Stripe webhook either failed to
create the `mp_users` row or wrote it without the active premium tier, so when
they tried to sign in via the homepage the email-only auth handler returned
"No account found." This script reads each Stripe subscription, repairs the
`mp_users` row to `subscription_tier='premium'`, `subscription_status='active'`,
`founding_member=true`, and produces a pre-authenticated sign-in URL Mary can
paste into reply emails.

## Webhook bug — separate session needed

Symptom: `customer.subscription.created` events for Stripe Payment Link
subscriptions on the Founding price (`price_1TLUpLR7Vg1dZJSLoFKk7wKK`) did not result
in a correct `mp_users` row for these 13 customers. Backfill on 4/22 fixed
the 11 paid before that date; Dave (4/23) and Fred (4/24) are evidence the bug
is still live. Root cause not investigated in this session.

## Per-customer results

_state_before reflects the pre-fix snapshot at 16:27 UTC. fix_applied reflects what the live run at 16:30 UTC did._

| email | note | stripe charge | stripe sub | state_before | fix_applied | sign-in URL |
|---|---|---|---|---|---|---|
| hannett@capalliance.com | Fred Hannett, paid 4/24 9:48 AM | py_3TPk60R7Vg1dZJSL1mw6GDdK | sub_1TPk64R7Vg1dZJSLhNrATnKx | **no_row** | **applied_insert** | [sign-in link](https://missionmeetstech.com/dashboard.html?email=hannett%40capalliance.com) |
| dnelson@vacgroup.org | David Nelson, paid 4/23 7:29 PM (original ticket) | py_3TPWgGR7Vg1dZJSL0WP76l8v | sub_1TPWgKR7Vg1dZJSLFhyAJVnH | **no_row** | **applied_insert** | [sign-in link](https://missionmeetstech.com/dashboard.html?email=dnelson%40vacgroup.org) |
| jord.hiller@gmail.com | Paid TWICE on 4/19 — Mary will refund duplicate via Stripe | py_3TNyfDR7Vg1dZJSL0fSmjOEX | sub_1TNyfER7Vg1dZJSL8G8jJamc | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=jord.hiller%40gmail.com) |
| 4reggiewayne@gmail.com | Reginald Humphries, paid 4/19 | ch_3TNx6fR7Vg1dZJSL0CwQYAqM | sub_1TNx6hR7Vg1dZJSL3NXhWZ8v | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=4reggiewayne%40gmail.com) |
| dmcmaster2@solventum.com | Donald McMaster, paid 4/17 | ch_3TNNnFR7Vg1dZJSL2Z4NE1wv | sub_1TNNnHR7Vg1dZJSLyqemkMjf | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=dmcmaster2%40solventum.com) |
| ryansjlee@yahoo.com | Ryan S Lee, paid 4/17 | py_3TNNZ8R7Vg1dZJSL0Bv12gYl | sub_1TNNZDR7Vg1dZJSLRylTEKqt | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=ryansjlee%40yahoo.com) |
| mattbeirne10@gmail.com | Matthew Beirne, paid 4/17 | ch_3TNMIxR7Vg1dZJSL1RbehcrB | sub_1TNMIzR7Vg1dZJSLh60UWI5S | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=mattbeirne10%40gmail.com) |
| jmichaelmathias@gmail.com | Joseph M Mathias, paid 4/17 | py_3TNMD3R7Vg1dZJSL0JyQNoGA | sub_1TNMD8R7Vg1dZJSL8fOTc4eA | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=jmichaelmathias%40gmail.com) |
| 9162000@msn.com | Colin Mitchell, paid 4/17 | ch_3TNDoDR7Vg1dZJSL2fXC3zT5 | sub_1TNDoGR7Vg1dZJSLsTliVJxC | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=9162000%40msn.com) |
| smccluskey@salesforce.com | Sean McCluskey, paid 4/17 | py_3TNDgWR7Vg1dZJSL2PbbOlCK | sub_1TNDgcR7Vg1dZJSLOEAiHzRa | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=smccluskey%40salesforce.com) |
| ardi.s@mongodb.com | Ardian Shahini, paid 4/15 | py_3TMXAIR7Vg1dZJSL0ZjScfIf | sub_1TMXAMR7Vg1dZJSLLJPFCWay | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=ardi.s%40mongodb.com) |
| dcapplegate@outlook.com | Danielle Applegate, paid 4/14 | ch_3TM5u7R7Vg1dZJSL2P0ROs5P | sub_1TM5uAR7Vg1dZJSLawI2WPSU | ok_active_founding | noop_already_correct | [sign-in link](https://missionmeetstech.com/dashboard.html?email=dcapplegate%40outlook.com) |

## Sign-in URLs (raw, for copy/paste into emails)

- **hannett@capalliance.com** → https://missionmeetstech.com/dashboard.html?email=hannett%40capalliance.com
- **dnelson@vacgroup.org** → https://missionmeetstech.com/dashboard.html?email=dnelson%40vacgroup.org
- **jord.hiller@gmail.com** → https://missionmeetstech.com/dashboard.html?email=jord.hiller%40gmail.com
- **4reggiewayne@gmail.com** → https://missionmeetstech.com/dashboard.html?email=4reggiewayne%40gmail.com
- **dmcmaster2@solventum.com** → https://missionmeetstech.com/dashboard.html?email=dmcmaster2%40solventum.com
- **ryansjlee@yahoo.com** → https://missionmeetstech.com/dashboard.html?email=ryansjlee%40yahoo.com
- **mattbeirne10@gmail.com** → https://missionmeetstech.com/dashboard.html?email=mattbeirne10%40gmail.com
- **jmichaelmathias@gmail.com** → https://missionmeetstech.com/dashboard.html?email=jmichaelmathias%40gmail.com
- **9162000@msn.com** → https://missionmeetstech.com/dashboard.html?email=9162000%40msn.com
- **smccluskey@salesforce.com** → https://missionmeetstech.com/dashboard.html?email=smccluskey%40salesforce.com
- **ardi.s@mongodb.com** → https://missionmeetstech.com/dashboard.html?email=ardi.s%40mongodb.com
- **dcapplegate@outlook.com** → https://missionmeetstech.com/dashboard.html?email=dcapplegate%40outlook.com

## How sign-in works (email-only, no password)

MMT Premium uses email-only auth: customer goes to `/dashboard.html`,
enters their subscriber email, and `member-auth.js` queries `mp_users`.
If `subscription_tier='premium'` AND `subscription_status='active'`, the
function issues a 30-day HMAC token and the dashboard primes localStorage.
No password reset link is needed because there is no password — the only
failure mode is the missing/wrong `mp_users` row, which this script just
repaired. Mary's reply email should say something like:

> Sorry for the delay — your account is fixed now. Go to
> https://missionmeetstech.com/dashboard.html and enter your email
> ({customer email}). No password required.

## Hard rule honored

No customer was emailed by this script. Mary owns sending the recovery links.