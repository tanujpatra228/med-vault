# Landing page (medvault.com)

Status: **built**, deployed as its own Worker. The app stays a separate Worker.

| Site | Address now | Address after the domain switch | Code |
|---|---|---|---|
| Landing page | `med-vault-landing.tanujpatra228.workers.dev` | `medvault.com` (and `www.`) | `landing/` |
| App | `med-vault.tanujpatra228.workers.dev` | `app.medvault.com` | everything else |

## How it is built

- One static page, `landing/index.html`, with no JavaScript. Built by Vite with Tailwind (`landing/vite.config.ts`) and served as static files by a Worker with no code (`landing/wrangler.jsonc`, free).
- **Same design system as the app**: both import `design/tokens.css` (colours for light and dark, fonts, radii, the type scale). Change a token there and both update. Landing-only sizes (`display-hero`, `display-section`, `type-lead`, the `phone` frame) are in `landing/src/landing.css`.
- **Icons** are the app's lucide icons, written as `<i data-icon="Pill"></i>` and turned into inline SVG at build time.
- **Addresses** live in `landing/.env`: `VITE_APP_URL` (every "Create your family's vault" button and the privacy link) and `VITE_SITE_URL` (link previews). Used in the HTML as `%VITE_APP_URL%`.
- **Screenshots**: the originals are in `screenshots/` (the Sharma demo family). The page uses 720px WebP copies in `landing/public/shots/` (about 45 KB each). The link preview image is `landing/public/og.png` (1200x630).
- Size: about 8 KB of HTML and 5 KB of CSS gzipped, plus lazy-loaded screenshots.

## Commands

```bash
npm run landing:dev      # local preview
npm run landing:build    # build to landing/dist
npm run landing:deploy   # build and deploy (CI does this on every merge to main)
```

## Page outline

Hero (headline, sub-line, "Create your family's vault, free") · three proof points · the "we paid twice" story · five features with screenshots (scan, summary, visit brief, trends, questions for the doctor) · six small features · how it works (3 steps) · privacy · example stories · FAQ · final call to action · footer.

## Content rules

- **Example stories are labelled as examples.** The three quotes (Priya, Arjun, Kavya) are illustrative and the page says "Illustrative examples of how families use Med Vault, not customer reviews." Never present them as real reviews (ASCI and the 2022 consumer guidelines). Replace them with real quotes, with permission, once real families give them.
- Claims follow [MARKETING.md](./MARKETING.md) section 2: "Built around India's data protection law (DPDP)", never "compliant"; "questions to ask your doctor", never "detects interactions"; "we never ask who you are", never "anonymous"; "free for early families".
- No tracking scripts. If analytics is added, use cookieless Cloudflare Web Analytics.

## Switching to medvault.com

1. Buy `medvault.com` and add it to the same Cloudflare account (Websites → Add a site). Wait until it is active.
2. Check the API token used by GitHub (`CLOUDFLARE_API_TOKEN`) can attach custom domains: it needs **Zone → Workers Routes: Edit** and **Zone → DNS: Edit** for the medvault.com zone, besides the account permissions it has today.
3. Landing: in `landing/wrangler.jsonc`, uncomment the `routes` for `medvault.com` and `www.medvault.com`.
4. App: in `wrangler.jsonc`, add `"routes": [{ "pattern": "app.medvault.com", "custom_domain": true }]`.
5. In `landing/.env`, set `VITE_APP_URL=https://app.medvault.com` and `VITE_SITE_URL=https://medvault.com`.
6. Merge: CI deploys both, and Cloudflare creates the DNS records and certificates.

**Phones already using the app** stay signed in at the old `workers.dev` address (sign-in is per address), which keeps working: it is the same Worker and the same data. To move a phone: on the old address, Settings → Link another device makes a code; open `app.medvault.com` on the phone and enter it. Installed home screen apps need to be added again from the new address.
