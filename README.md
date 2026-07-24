# The Compact Office — automated affiliate site

Fully automated content pipeline: a GitHub Action generates a new article twice a week (AI writer, grounded only in products you've entered), builds the static site, and publishes it — no manual publishing step.

## What's actually zero-cost vs. not (read this first)

Being honest about "zero investment" so there are no surprises:

| Item | Cost | Notes |
|---|---|---|
| Hosting (GitHub Pages) | **$0** | Free forever for a public repo |
| Publishing automation (GitHub Actions) | **$0** | Free tier covers this easily at 2 runs/week |
| Domain name | $0 if you use `username.github.io/reponame`, or **~$10–12/year** if you want a real domain (recommended once it's earning — helps SEO and Amazon approval) | Optional, not required to launch |
| AI article generation (Gemini API, free tier) | **$0** | No credit card required. Free tier allows far more requests/day than this pipeline needs at 2 articles/week |
| Amazon Associates account | **$0** to join | Requires approval; see below |

This build uses Google's Gemini free tier specifically so the whole pipeline is genuinely $0, no card required anywhere.

## The one thing that stays manual (and why)

`content/products.json` is the only file you maintain by hand. The AI is deliberately **not allowed to invent products, prices, or Amazon links** — it can only recommend items you've already added to this file. This is a legal/trust safeguard, not a limitation I forgot to automate:

- AI-hallucinated product specs or prices would be false advertising.
- Fabricated Amazon links would be broken links, which kills both SEO and Associates approval.

Adding a product takes about 2 minutes: find it on Amazon, copy the ASIN, add your Associates tracking tag to the URL, fill in the JSON fields. Do this for 3–5 products before your first real content push, then add 1–2 new products every couple of weeks as you notice gaps.

## One-time setup (~45–60 minutes total, done once)

1. **Create a GitHub account** (if you don't have one) and a new **public** repository.
2. Push this folder's contents to that repo's root.
3. **Amazon Associates**: apply at affiliate-program.amazon.com. Approval requires a live site with content (you already have 2 seed articles) and is often provisional until you get 3 qualifying sales within 180 days — read that requirement carefully, it's the one part of this that's genuinely outside your or my control.
4. **Gemini API key (free, no card)**: go to Google AI Studio (aistudio.google.com), sign in with a Google account, click "Get API key" → "Create API key." Add it to your repo as a GitHub secret named `GEMINI_API_KEY` (Settings → Secrets and variables → Actions → New repository secret).
5. **Enable GitHub Pages**: repo Settings → Pages → Deploy from branch → `main` → `/docs`.
6. Update `SITE_URL` in `templates/layout.js` to your real Pages URL (or custom domain later).
7. Fill in real products in `content/products.json` (see above).
8. Run the workflow manually once (Actions tab → "Generate and publish article" → Run workflow) to confirm everything works end-to-end.

## Your ongoing weekly routine (target: under 10 minutes)

1. **(3 min)** Skim the 1–2 auto-published articles from this week for anything factually off.
2. **(3 min)** Check the Actions tab for any failed runs (rare — usually means the topic queue ran out or a secret expired).
3. **(2 min)** Every other week: add 1–2 new real products to `content/products.json` so the generator has fresh things to recommend.
4. **(2 min)** Once a month: check Amazon Associates dashboard for clicks/sales, refill `content/topics.txt` if it's getting low.

## What this can't fully automate (and isn't pretending to)

- Getting approved for Amazon Associates in the first place.
- Verifying product claims stay accurate as products get discontinued or specs change.
- SEO ramp time — expect close to $0 revenue for the first 6–10 weeks while Google indexes and ranks the site. This is a real constraint of how search works, not a flaw in the pipeline.
- Recognizing if the niche needs adjusting based on what's actually converting (that's a judgment call for your monthly review, not something to hand to AI).
