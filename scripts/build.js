import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import {
  pageShell,
  articleCard,
  sidebarItem,
  searchScript,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "../templates/layout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTICLES_DIR = path.join(ROOT, "content/articles");
const DOCS_DIR = path.join(ROOT, "docs");
const DOCS_ARTICLES_DIR = path.join(DOCS_DIR, "articles");
const AI_IMAGE_DIR = path.join(DOCS_DIR, "images", "ai");
const PRODUCTS_PATH = path.join(ROOT, "content/products.json");

fs.mkdirSync(DOCS_ARTICLES_DIR, { recursive: true });
fs.mkdirSync(AI_IMAGE_DIR, { recursive: true });
fs.copyFileSync(path.join(ROOT, "templates/style.css"), path.join(DOCS_DIR, "style.css"));

// ---------- Shop Our Picks (always real products, straight from products.json) ----------
const productsData = fs.existsSync(PRODUCTS_PATH)
  ? JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8"))
  : { products: [] };

function shopPicksHtml(products) {
  if (!products.length) return "";
  const items = products
    .map(
      (p) => `<div class="shop-pick-item">
  <div class="shop-pick-name">${p.name}</div>
  <div class="shop-pick-price">${p.price_range || ""}</div>
  <a class="shop-pick-buy" href="${p.url}" rel="nofollow sponsored" target="_blank">Check price on Amazon</a>
</div>`
    )
    .join("\n");
  return `<div class="sidebar-box shop-picks">
  <div class="section-head" style="margin-bottom:12px;"><h2>Shop Our Picks</h2></div>
  ${items}
</div>`;
}

const shopPicksBlock = shopPicksHtml(productsData.products || []);

function readTimeFor(markdown) {
  const words = markdown.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

// ---------- AI reference image generation (Pollinations, free, no key) ----------
// IMPORTANT: prompts are deliberately generic/topical (category + theme only).
// They never reference a specific brand or model, since these are disclosed
// "reference illustrations," not depictions of any real product.
function aiPromptFor(category, title) {
  const theme = title
    .replace(/[^\w\s]/g, "")
    .split(" ")
    .slice(0, 6)
    .join(" ");
  return (
    `minimalist editorial photograph, ${category.toLowerCase()}, ${theme}, ` +
    `small modern home office, clean tidy desk setup, soft natural light, ` +
    `neutral tones, no text, no logos, no brand names, no people`
  );
}

async function generateAiImage(prompt, destPath) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=450&nologo=true`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (err) {
    console.warn(`AI image generation skipped (${err.message}) for prompt: ${prompt}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const files = fs.existsSync(ARTICLES_DIR)
  ? fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".md"))
  : [];

const articles = files.map((file) => {
  const raw = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
  const { data, content } = matter(raw);
  const slug = file.replace(/\.md$/, "");
  return {
    slug,
    title: data.title || slug,
    excerpt: data.excerpt || "",
    category: data.category || "Guide",
    date: data.date || "",
    image: data.image || null,
    imageCredit: data.image_credit || null,
    imageIsAI: false,
    readTime: readTimeFor(content),
    html: marked.parse(content),
  };
});

articles.sort((a, b) => new Date(b.date) - new Date(a.date));

// Fill in AI reference images for any article without a real photo.
// Runs sequentially with a delay between requests to stay under
// Pollinations' anonymous rate limit (~1 request per 15 seconds),
// with one retry (after a longer wait) if a request gets rate-limited.
for (const a of articles) {
  if (a.image) continue;
  const destPath = path.join(AI_IMAGE_DIR, `${a.slug}.jpg`);
  const relPath = `images/ai/${a.slug}.jpg`;
  if (fs.existsSync(destPath)) {
    // Already generated in a previous run — reuse it, don't regenerate.
    a.image = relPath;
    a.imageIsAI = true;
    continue;
  }

  const prompt = aiPromptFor(a.category, a.title);
  let ok = await generateAiImage(prompt, destPath);

  if (!ok) {
    console.log("Retrying after rate-limit cooldown...");
    await sleep(20000);
    ok = await generateAiImage(prompt, destPath);
  }

  if (ok) {
    a.image = relPath;
    a.imageIsAI = true;
  }

  // Space out requests so the next article doesn't get rate-limited either.
  await sleep(17000);
}

function aiBadge(isAI) {
  return isAI
    ? `<div class="ai-badge" title="AI-generated reference image — not an actual product photo">AI reference image</div>`
    : "";
}

// ---------- Article pages ----------
for (const a of articles) {
  const heroImg = a.image
    ? `<div class="article-hero-image" style="background-image:url('${a.image}')">${aiBadge(a.imageIsAI)}</div>`
    : "";
  const credit = a.imageCredit
    ? `<div class="photo-credit">${a.imageCredit}</div>`
    : a.imageIsAI
    ? `<div class="photo-credit">Reference image generated by AI for illustration only. See the Amazon listing via the buy link above for actual product photos.</div>`
    : "";
  const body = `<div class="wrap-narrow">
  <div class="article-header">
    <div class="eyebrow">${a.category}</div>
    <h1>${a.title}</h1>
    <div class="meta">${a.readTime} &middot; ${a.date}</div>
  </div>
  ${heroImg}
  ${credit}
  <article class="body">
    ${a.html}
    <p class="disclosure-note">As an Amazon Associate, this site earns from qualifying purchases made through links above, at no extra cost to you. See our <a href="about.html">full disclosure</a>.</p>
  </article>
  ${shopPicksBlock}
</div>`;
  fs.writeFileSync(
    path.join(DOCS_ARTICLES_DIR, `${a.slug}.html`),
    pageShell({ title: `${a.title} — ${SITE_NAME}`, description: a.excerpt, bodyHtml: body })
  );
}

// ---------- Homepage ----------
const [featured, ...rest] = articles;
const gridArticles = rest.slice(0, 8);
const sidebarArticles = articles.slice(0, 5);

const categoryCounts = {};
for (const a of articles) {
  categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
}
const categoryStripHtml = Object.entries(categoryCounts)
  .map(
    ([cat, count]) =>
      `<a href="index.html">${cat}<span class="count">${count} guide${count === 1 ? "" : "s"}</span></a>`
  )
  .join("\n");

const heroHtml = featured
  ? `<div class="hero">
  <div class="hero-content">
    <div class="hero-tag">${featured.category}</div>
    <h1>${featured.title}</h1>
    <p class="excerpt">${featured.excerpt}</p>
    <div class="hero-meta"><span>${featured.readTime}</span><span>${featured.date}</span></div>
    <a class="btn-primary" href="articles/${featured.slug}.html">Read the Guide &rarr;</a>
  </div>
  <div class="hero-image ${featured.image ? "" : "no-photo"}" ${
      featured.image ? `style="background-image:url('${featured.image}')"` : ""
    }>${aiBadge(featured.imageIsAI)}</div>
</div>`
  : "";

const gridHtml = gridArticles.map((a) => articleCard(a)).join("\n");
const sidebarHtml = sidebarArticles.map((a) => sidebarItem(a)).join("\n");

const indexBody = `<div class="wrap">
  <div style="padding: 32px 0 4px;">
    <p style="color:var(--text-dim); max-width: 60ch; margin:0;">${SITE_TAGLINE}</p>
  </div>
  ${heroHtml}
  <div class="page-grid">
    <div>
      <div class="section-head"><h2>Latest Guides</h2></div>
      <div class="card-grid">
        ${gridHtml || '<p style="color:var(--text-faint)">New guides publish twice daily. Check back soon.</p>'}
      </div>
      <div id="no-results" class="no-results">No guides match your search.</div>
    </div>
    <div>
      <div class="sidebar-box">
        <div class="section-head" style="margin-bottom:12px;"><h2>Trending Now</h2></div>
        ${sidebarHtml}
      </div>
      ${shopPicksBlock}
    </div>
  </div>
  <div class="category-strip">
    ${categoryStripHtml}
  </div>
</div>`;

fs.writeFileSync(
  path.join(DOCS_DIR, "index.html"),
  pageShell({
    title: SITE_NAME,
    description: SITE_TAGLINE,
    bodyHtml: indexBody,
    extraScript: searchScript,
  })
);

// ---------- About page ----------
const aboutBody = `<div class="wrap-narrow">
  <div class="article-header">
    <div class="eyebrow">About</div>
    <h1>About &amp; Affiliate Disclosure</h1>
  </div>
  <article class="body">
    <p>${SITE_NAME} publishes practical, tested-on-paper guidance for setting up a real, functional home office in a small apartment, dorm, or shared room — no spare room required.</p>
    <h2>Affiliate Disclosure</h2>
    <p>${SITE_NAME} is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com. As an Amazon Associate, we earn from qualifying purchases. This comes at no additional cost to you.</p>
    <p>Product recommendations are based on publicly available specifications, pricing, and customer review data. We do not receive products for free from manufacturers in exchange for coverage.</p>
    <h2>About our images</h2>
    <p>Where we don't yet have a real, human-verified product photo, articles display a clearly labeled AI-generated reference illustration instead — never a fabricated depiction of the actual product. Always check the Amazon listing via the buy link for real product photos before purchasing.</p>
    <h2>Contact</h2>
    <p>Questions or corrections: use the contact method listed in this site's footer or repository.</p>
  </article>
</div>`;
fs.writeFileSync(
  path.join(DOCS_DIR, "about.html"),
  pageShell({ title: `About — ${SITE_NAME}`, description: "About and affiliate disclosure", bodyHtml: aboutBody })
);

// ---------- robots.txt + sitemap.xml ----------
fs.writeFileSync(path.join(DOCS_DIR, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/about.html`,
  ...articles.map((a) => `${SITE_URL}/articles/${a.slug}.html`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
fs.writeFileSync(path.join(DOCS_DIR, "sitemap.xml"), sitemap);

console.log(`Built ${articles.length} article(s) into /docs`);