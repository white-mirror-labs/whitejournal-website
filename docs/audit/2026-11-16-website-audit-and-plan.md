# whitemirrorlabs.com — full audit and improvement plan

Audit date: 2026-11-16. Audited: the repo at `main` (eb89394) and the live site `https://www.whitemirrorlabs.com`.
Written as a hand-off: the next engineer (Opus) should be able to execute this without the audit conversation.

> **Before committing this file:** everything tracked in this repo is served publicly (see P0-1). Land the `.vercelignore` from P0-1 in the same commit, or keep this file untracked.

## 1. What this site is

- Static HTML/CSS/JS on Vercel, no build step. 26 pages: EN + AR (RTL) for home, shop, pre-order, legal, 4 guides + index; plus `404`, `delete-account`, `shop-success(-ar)`.
- Three serverless functions in `api/`: `waitlist.js`, `preorder.js`, `pay.js` (+ shared `_supabase.js`). They write to Supabase with the service-role key and send mail through Resend.
- One shared `styles.css` (85 KB raw, 13.6 KB brotli, 1,835 lines) and one `main.js` (8.9 KB).
- Analytics: GA4 (`G-W7R7KBK9QC`) and Vercel Web Analytics.

## 2. Scorecard

| Area | State | Evidence |
|---|---|---|
| Indexing | Good | 10/10 key URLs indexed in Search Console, no canonical or robots issues |
| Lighthouse a11y / best practices / SEO (mobile) | 100 / 100 / 100 | `/shop`, `/preorder-ar` |
| Lighthouse performance (mobile) | 87 (`/shop`), 81 (`/preorder-ar`) | LCP 3.4 s and 4.3 s, FCP 2.6–2.7 s, CLS ≤ 0.018, TBT ≤ 110 ms |
| Security headers | Decent | HSTS preload, nosniff, X-Frame-Options DENY, CSP present but loose |
| API abuse protection | Weak | honeypot only; no rate limit on any endpoint |
| Legal text vs. actual behaviour | **Contradicts** | two confirmed contradictions (P0-2, P0-3) |
| Repo hygiene | Weak | internal files publicly served, no tests, no CI, no README |

What is already done well and should not be regressed: server-side pricing, HTML escaping of all user input in emails, `reportIssue` to the admin Issues screen, consistent hreflang pairs, one `h1` per page, image `width`/`height`/`alt` everywhere, reduced-motion handling, apex → www and http → https redirects, real 404 status.

## 3. Findings and fixes

Priorities: **P0** = fix this week (legal exposure, data exposure, broken user paths). **P1** = next. **P2** = when convenient.

### P0-1. Internal files are publicly downloadable

Vercel serves every tracked file. Confirmed live with HTTP 200:

- `/docs/arabic-copy-review.md`, `/docs/higgsfield-briefs.md`, `/docs/superpowers/...`, `/docs/email-templates/*`
- `/.playwright-mcp/*.yml` and `*.log` (tracked in git even though now in `.gitignore`)
- `/.claude/launch.json`

Not exposed (404): `package.json`, `vercel.json`, `.env`, `.git`, `node_modules`, `api/_supabase.js`, `rea/`.

Fix:
1. Add `.vercelignore` with: `docs/`, `.claude/`, `.playwright-mcp/`, `.omc/`, `.remember/`, `.superpowers/`, `rea/`, `*.md`, `.DS_Store`.
2. `git rm -r --cached .playwright-mcp .DS_Store .claude/.DS_Store .claude/worktrees/.DS_Store`; add `.DS_Store`, `.omc/`, `.remember/`, `rea/` to `.gitignore`.
3. `rea/` is an unrelated project sitting untracked inside this repo. Ask the owner, then move it out of the folder. It would be uploaded by any `vercel deploy` run from the CLI.

Accept: each URL above returns 404 after deploy; `/0892ea55221e39227c1a9d5b9b294df4.txt` (search-engine key file) still returns 200.

### P0-2. Privacy policy says "no cookies, Vercel analytics only" — the site runs Google Analytics

`privacy.html:388` and `:632` (and `privacy-ar.html`) state the Site sets no cookies, has no analytics cookie and counts visits only with Vercel Web Analytics. But GA4 is loaded on 21 of 26 pages, sets `_ga` cookies, and is not named anywhere in the policy. There is no consent prompt. GA is also missing from the five `guides/ar/*` pages, so data is inconsistent anyway.

**Owner decision needed** (recommendation first):
- **A. Remove GA4** from every page and from the CSP. Vercel Web Analytics already covers page views and the two custom events. The policy becomes true with zero copy changes.
- B. Keep GA4: rewrite the cookie and analytics sections in both languages, name Google as a processor, add a consent banner that blocks GA until accepted, add GA to the `guides/ar` pages.

Accept (A): `grep -r googletagmanager .` returns nothing; CSP has no Google hosts; no `_ga` cookie in a fresh browser session.

### P0-3. Terms and Refund policy say there is no digital edition — the pre-order page sells one

- `terms.html:482`: "The Journal is the only product we sell. There is no separate digital edition…"
- `refund.html:334`: "It is the only thing we sell, and therefore the only thing this policy covers."
- `preorder.html` / `preorder-ar.html`, `shop.html:326,330,351`, `api/preorder.js:9`: Digital edition, 249 EGP.

**Owner decision needed:** either update Terms + Refund (EN and AR) to define the digital edition, its price, delivery and refund rule, or pull the digital option from the pre-order pages and API. Legal wording needs the owner's or counsel's sign-off — draft it, do not publish unreviewed.

### P0-4. Broken legal links on all 10 guide pages

Guide footers use relative links (`privacy.html`, `terms.html`, `refund.html`, and the `-ar` variants). From `/guides/...` they resolve to `/guides/privacy` → **404**. 30 broken links.

Fix: make every internal link root-absolute and extensionless (`/privacy`, `/terms-ar`, …) across all 26 pages. That also removes the 308 hop every `.html` link currently costs under `cleanUrls`. Same for `shop-ar.html` in the pre-order nav and `index.html` in `shop-success.html`.

Accept: a link crawl (script in section 5) reports zero non-200 internal links.

### P0-5. No rate limiting on the API; two endpoints are orphaned but live

- `/api/preorder` and `/api/waitlist` send an email to any address supplied. With only a honeypot, anyone can script them to mail-bomb third parties from `noreply@whitemirrorlabs.com` (domain reputation, Resend quota) and flood the `orders` table.
- `/api/pay` is not called by any page any more (checkout was replaced by pre-order), yet it is public: each POST creates an XPay checkout session plus `pending_payments` and `orders` rows, with no input length caps and no bot check.
- `/api/waitlist` has no form pointing at it either (no element with `id="waitlist-form"` exists).
- All three send `Access-Control-Allow-Origin: *`, so any site can drive them from a visitor's browser.

Fix:
1. Add a Vercel Firewall rate-limit rule on `/api/*` (for example 5 requests / 10 min per IP), and consider Vercel BotID on the pre-order form.
2. Remove the CORS headers (same-origin forms do not need them) or pin to the site origin.
3. **Owner decision:** confirm whether the mobile app still calls `/api/pay` or `/api/waitlist`. If not, delete `api/pay.js`, `api/waitlist.js`, `shop-success.html`, `shop-success-ar.html`, the waitlist block in `main.js:139-182`, the `frame-src https://*.xpay.app` CSP entry and the robots.txt lines for shop-success. If the app does use `/api/pay`, keep it but add length caps, phone validation and the rate limit.

### P0-6. Email address travels in the URL

The app opens `/shop?email=<address>`; `shop.html:405-411` redirects to `/preorder?email=…`. The address lands in Vercel logs, browser history and — while GA is installed — in Google Analytics as part of the page URL. Sending personal data to GA this way breaches Google's terms as well as the site's own policy.

Fix: have the app pass it in the fragment (`/preorder#email=…`), read it from `location.hash`, then `history.replaceState` to clear it. Keep reading `?email=` for old app versions, but strip it from the URL before any analytics script runs.

### P1-1. Pre-order endpoint correctness (`api/preorder.js`)

- Lines 139-146: if the team email fails, the user gets a 500 even when the order row was saved. They retry and create duplicates. Return success when `recorded` is true; only fail when both the insert and the email fail (the pattern `waitlist.js` already uses).
- No duplicate guard: the same person submitting twice creates two pending orders. Dedupe on (email, product) within a short window, or add a unique client-generated request id.
- No phone validation. The whole flow depends on calling the customer; require a plausible Egyptian or international number on both client and server.
- `new Resend(process.env.RESEND_API_KEY)` at module scope throws on a missing key and takes the endpoint down with an unhandled error. Build it inside the handler and report through `reportIssue`.
- `waitlist.js:116-118` logs a store failure but never calls `reportIssue`.

### P1-2. Stale copy and structured data after the waitlist → pre-order switch

- "Join the waitlist" still in the meta/OG/Twitter descriptions of `index.html`, `ar.html`, `shop-ar.html`.
- `index.html:118` "Our first product, opening soon."; Product JSON-LD says "Coming soon in Egypt".
- Product JSON-LD has no `offers`. Add `Offer` with `price` 499, `priceCurrency` EGP, `availability` `PreOrder`, `url` `/preorder` on `/shop` and `/preorder`; add the same Product node to `shop-ar.html` and `ar.html`, which have none.
- `sitemap.xml`: 20 of 22 `lastmod` values are 2026-10-06; update on change. Add hreflang alternates if not present.
- Titles over ~60 characters will truncate in results: `index.html` (80), `ar.html` (80), `shop.html` (77), two guides (77). Descriptions over 160: `index.html` (187), `shop.html` (203), `shop-ar.html` (174), `ar.html` (167).

### P1-3. Pre-order page UX gaps

- The language switch on `/preorder` goes to `shop-ar.html`, not `/preorder-ar` (and the reverse on the Arabic page — verify).
- Form errors use `alert()`. Replace with an inline message in an `aria-live="polite"` region, and show per-field validation.
- Pre-order submits fire only a Vercel Analytics event. Whatever analytics survives P0-2 should record `preorder_submit` as the site's one conversion, with product and language.
- `delete-account` exists in English only and is not in the sitemap; add an Arabic version (store listings for Arabic users link to it).

### P1-4. Performance (mobile LCP 3.4–4.3 s; target < 2.5 s)

- Hero image on `/shop` has no `fetchpriority="high"`; add it and a matching `<link rel="preload" as="image" imagesrcset=…>`.
- No font preloads. Preload the one or two faces used above the fold per language. The Arabic pages pull IBM Plex Sans Arabic in three weights plus Noto Naskh; cut to what the design uses.
- `styles.css:10-12` map Inter weights 600 and 700 to the weight-300 file — confirm this is intentional (variable font) or fix; otherwise bold text is browser-synthesised.
- The GA tag is the first thing in `<head>` on every page. If GA stays, move it after the stylesheet and load it after consent.
- `styles.css` is render-blocking and carries rules for sections that no longer exist (`.eco-card`, `.mind-hero-*`, `.duo-card`, `.phase-card`, `.vision-item` are referenced in `main.js` but appear on no page). Run a coverage pass and delete dead rules; the same for the dead selectors in `main.js:69-85`.
- `styles.css` and `main.js` are served `max-age=0, must-revalidate`; `/assets` gets 7 days with unhashed names. Either add a version query and long cache, or leave as is — low gain.

### P1-5. Tighten the CSP and headers (`vercel.json`)

- Remove `https://api.resend.com` and `https://*.vercel.app` from `connect-src` (the browser never calls either; the wildcard allows exfiltration to any Vercel-hosted site).
- Add `object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
- Add `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `script-src 'unsafe-inline'` is needed only for the small inline snippets. Move them into `main.js` or a tiny `head.js` and drop `'unsafe-inline'` from `script-src`.

### P1-6. Dependencies and runtime

- `resend` is pinned to `^4`; `npm audit` reports 4 low-severity advisories through `@react-email/render`. Upgrade to the current major and retest both emails.
- `package.json` has no `engines`. Set `"node": "24.x"` and confirm the Vercel project is not on Node 20 (deprecated on Vercel since 2026-10-01).
- Local Vercel CLI is 59.4.0; current is 65.x.

### P2-1. Stop copy-pasting nav and footer across 26 files

P0-4, the wrong language link and the GA-missing-on-five-pages bug all come from hand-maintained duplicates. Introduce a minimal build (Eleventy, or a 50-line Node include script) with shared `nav`, `footer` and `head` partials per language, outputting the same URLs. Do this after the P0/P1 fixes so the diff is verifiable page by page.

### P2-2. Safety net

- No tests, no CI, no lint. Add a GitHub Action that runs: HTML validation, the internal link crawl, JSON-LD parse check, and unit tests for the two API handlers with Supabase and Resend mocked.
- Add an uptime check on `/` and a daily synthetic that confirms `/api/preorder` answers (using the honeypot field so no order or email is created).
- No `README.md` or `CLAUDE.md`. Document: how to run locally (`npx serve`), env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `XPAY_SECRET_KEY`, `SITE_BASE`), deploy flow, and the rule that EN and AR pages change together.

### P2-3. Smaller items

- `pay.js:143-145` comment says delivery details are kept out of the row, but `recordOrder` writes them. Fix the comment or the code (moot if the file is deleted).
- `pay.js` sends customer name, phone and address to XPay as session metadata; minimise if the file stays.
- `hamburger` button lacks `aria-controls="mobile-menu"`; `styles.css:677` and `:1059` set `outline: none` — confirm a visible focus style replaces it.
- `manifest.json` `lang` is `en` only; fine, but the Arabic pages share it.

## 4. Suggested order of work

1. P0-1 (`.vercelignore` + untrack) and P0-4 (links) — pure fixes, no decisions. Ship together.
2. Get the three owner decisions: GA (P0-2), digital edition wording (P0-3), is `/api/pay` still used by the app (P0-5).
3. P0-5 rate limit and CORS; P0-6 email in URL (needs a matching app change).
4. P1-1 → P1-2 → P1-3 → P1-5 → P1-4 → P1-6.
5. P2-1 build step, then P2-2 CI on top of it.

Rules for whoever executes: every user-facing change lands in EN and AR in the same commit; do not publish legal wording without owner sign-off; do not POST real data to production endpoints while testing (use the honeypot field or a preview deployment); verify each fix against the live or preview URL, not only the file.

## 5. Verification script

Run from the repo root after each batch; it must print nothing under "links":

```bash
python3 - <<'EOF'
import re, glob, os
files = glob.glob('*.html') + glob.glob('guides/**/*.html', recursive=True)
paths = set()
for f in files:
    p = '/' + f[:-5]
    paths.add(p[:-6] or '/' if p.endswith('/index') else p)
print('links:')
for f in files:
    s = open(f, encoding='utf8').read()
    for h in set(re.findall(r'href="([^"#]*)', s)):
        if not h or h.startswith(('http', 'mailto:', 'tel:', 'data:')):
            continue
        t = h if h.startswith('/') else '/' + os.path.normpath(os.path.join(os.path.dirname(f), h))
        t = t.rstrip('/') or '/'
        if t.endswith('.html') or (t not in paths and not os.path.exists('.' + t)):
            print(' ', f, '->', h)
EOF
```

## 6. Not covered by this audit

- The Supabase side: RLS policies, the `waitlist_join` and `report_system_issue` functions, the orders trigger. The site uses the service-role key, so database rules were not exercised.
- The admin dashboard (`../white-mirror-admin`) and the mobile app, including whether the app still links to `/shop?uid=` or `/api/pay`.
- Real-user performance: Google has no field data for this origin yet, so the numbers above are lab runs only.
- Email deliverability (SPF/DKIM/DMARC for `whitemirrorlabs.com`) and a native-speaker review of the Arabic copy.
- A full read of the legal pages; only the statements that contradict site behaviour were checked.
