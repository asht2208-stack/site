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

marked.setOptions({ gfm: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTICLES_DIR = path.join(ROOT, "content/articles");
const DOCS_DIR = path.join(ROOT, "docs");
const DOCS_ARTICLES_DIR = path.join(DOCS_DIR, "articles");
const AI_IMAGE_DIR = path.join(DOCS_DIR, "images", "ai");
const PRODUCTS_PATH = path.join(ROOT, "content/products.json");
const CATEGORIES_PATH = path.join(ROOT, "content/categories.json");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

fs.mkdirSync(DOCS_ARTICLES_DIR, { recursive: true });
fs.mkdirSync(AI_IMAGE_DIR, { recursive: true });
fs.copyFileSync(path.join(ROOT, "templates/style.css"), path.join(DOCS_DIR, "style.css"));

const productsData = fs.existsSync(PRODUCTS_PATH)
  ? JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8"))
  : { products: [] };

const categoriesData = fs.existsSync(CATEGORIES_PATH)
  ? JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf-8"))
  : { categories: [] };

const allCategories = categoriesData.categories || [];

function productsForCategory(slug) {
  return (productsData.products || []).filter((p) => p.category_slug === slug);
}

function categoriesWithContent(articles) {
  return allCategories.filter((cat) => {
    const hasProducts = productsForCategory(cat.slug).length > 0;
    const hasArticles = articles.some((a) => a.shopCategory === cat.slug);
    return hasProducts || hasArticles;
  });
}

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

const PENDING_PATH = path.join(ROOT, "content/products-pending.json");
const pendingData = fs.existsSync(PENDING_PATH)
  ? JSON.parse(fs.readFileSync(PENDING_PATH, "utf-8"))
  : {};
const pendingSuggestion = pendingData.current || (pendingData.pending && pendingData.pending[0]) || null;
const comingSoonText = pendingSuggestion?.suggested_name
  ? pendingSuggestion.suggested_name.replace(/^(a|an|the)\s+/i, "")
  : "";

function readTimeFor(markdown) {
  const words = markdown.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

const COMPOSITION_VARIANTS = [
  "shot from a slightly elevated three-quarter angle",
  "shot straight-on at eye level",
  "shot from a low angle looking slightly upward",
  "shot from above looking down at the desk surface",
  "shot from the side in profile",
  "shot from a wide angle showing the surrounding room",
];

function seedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function aiPromptFor(category, subject, variationKey) {
  const safeSubject = subject || category;
  const variant = COMPOSITION_VARIANTS[seedFromString(variationKey) % COMPOSITION_VARIANTS.length];
  return (
    `A minimalist editorial photograph of a ${category.toLowerCase()}: ${safeSubject}. ` +
    `${variant}. Small modern home office setting, clean tidy desk, soft natural window light, ` +
    `neutral warm tones, photorealistic, no text, no logos, no brand names, no people, no watermarks.`
  );
}

async function generateAiImageOpenAI(prompt, destPath) {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set — skipping AI image generation.");
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data in response");
    const buffer = Buffer.from(b64, "base64");
    fs.writeFileSync(destPath, buffer);
    console.log(`Generated AI image: ${destPath}`);
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

async function ensureImage(prompt, destPath) {
  if (fs.existsSync(destPath)) return true;
  let ok = await generateAiImageOpenAI(prompt, destPath);
  if (!ok) {
    console.log("Retrying after a short cooldown...");
    await sleep(10000);
    ok = await generateAiImageOpenAI(prompt, destPath);
  }
  await sleep(3000);
  return ok;
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
    shopCategory: data.shop_category || null,
    imageSubject: data.image_subject || null,
    format: data.format || "review",
    compareProducts: data.compare_products || null,
    date: data.date || "",
    image: data.image || null,
    imageCredit: data.image_credit || null,
    imageIsAI: false,
    compareImages: null,
    readTime: readTimeFor(content),
    html: marked.parse(content),
  };
});

articles.sort((a, b) => new Date(b.date) - new Date(a.date));

const categories = categoriesWithContent(articles);

for (const a of articles) {
  if (a.image) continue;

  if (a.format === "comparison" && a.compareProducts && a.compareProducts.length === 2) {
    const [p1, p2] = a.compareProducts;
    const path1 = path.join(AI_IMAGE_DIR, `${a.slug}-a.jpg`);
    const path2 = path.join(AI_IMAGE_DIR, `${a.slug}-b.jpg`);
    const rel1 = `images/ai/${a.slug}-a.jpg`;
    const rel2 = `images/ai/${a.slug}-b.jpg`;

    const ok1 = await ensureImage(aiPromptFor(p1.category, p1.name, a.slug + "-a"), path1);
    const ok2 = await ensureImage(aiPromptFor(p2.category, p2.name, a.slug + "-b"), path2);

    a.compareImages = [
      { src: ok1 ? rel1 : null, name: p1.name },
      { src: ok2 ? rel2 : null, name: p2.name },
    ];
    a.imageIsAI = true;
    continue;
  }

  const destPath = path.join(AI_IMAGE_DIR, `${a.slug}.jpg`);
  const relPath = `images/ai/${a.slug}.jpg`;
  const ok = await ensureImage(aiPromptFor(a.category, a.imageSubject || a.title, a.slug), destPath);
  if (ok) {
    a.image = relPath;
    a.imageIsAI = true;
  }
}

function aiBadge(isAI) {
  return isAI
    ? `<div class="ai-badge" title="AI-generated reference image — not an actual product photo">AI ref</div>`
    : "";
}

function aiBadgeSm(isAI) {
  return isAI
    ? `<div class="ai-badge ai-badge-sm" title="AI-generated reference image — not an actual product photo">AI ref</div>`
    : "";
}

function vsCompareHtml(a) {
  if (!a.compareImages) return "";
  const [left, right] = a.compareImages;
  const side = (item) => `<div class="vs-item ${item.src ? "" : "no-photo"}" ${
    item.src ? `style="background-image:url('${item.src}')"` : ""
  }>
    ${aiBadgeSm(true)}
    <div class="vs-caption">${item.name}</div>
  </div>`;
  return `<div class="vs-compare">
  ${side(left)}
  <div class="vs-badge">VS</div>
  ${side(right)}
</div>
<div class="photo-credit">Reference images generated by AI for illustration only. See the Amazon listings via the buy links below for actual product photos.</div>`;
}

for (const a of articles) {
  let heroImg = "";
  let credit = "";

  if (a.compareImages) {
    heroImg = vsCompareHtml(a);
  } else if (a.image) {
    heroImg = `<div class="article-hero-image" style="background-image:url('${a.image}')">${aiBadge(a.imageIsAI)}</div>`;
    credit = a.imageCredit
      ? `<div class="photo-credit">${a.imageCredit}</div>`
      : a.imageIsAI
      ? `<div class="photo-credit">Reference image generated by AI for illustration only. See the Amazon listing via the buy link above for actual product photos.</div>`
      : "";
  }

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
    pageShell({
      title: `${a.title} — ${SITE_NAME}`,
      description: a.excerpt,
      bodyHtml: body,
      comingSoonText,
      categories,
      activeCategory: a.shopCategory,
    })
  );
}

function articlesForCategory(slug) {
  return articles.filter((a) => a.shopCategory === slug);
}

function categoryPageHtml(cat) {
  const prods = productsForCategory(cat.slug);
  const arts = articlesForCategory(cat.slug);

  const bySubcat = {};
  for (const p of prods) {
    const key = p.subcategory || "Other";
    if (!bySubcat[key]) bySubcat[key] = [];
    bySubcat[key].push(p);
  }

  const subcatHtml = (cat.subcategories || [])
    .map((sub) => {
      const items = bySubcat[sub] || [];
      if (!items.length) return "";
      const itemsHtml = items
        .map(
          (p) => `<div class="shop-pick-item">
  <div class="shop-pick-name">${p.name}</div>
  <div class="shop-pick-price">${p.price_range || ""}</div>
  <a class="shop-pick-buy" href="${p.url}" rel="nofollow sponsored" target="_blank">Check price on Amazon</a>
</div>`
        )
        .join("\n");
      return `<div class="sidebar-box shop-picks" style="margin-bottom:20px;">
  <div class="section-head" style="margin-bottom:12px;"><h2>${sub}</h2></div>
  ${itemsHtml}
</div>`;
    })
    .join("\n");

  const articleCardsHtml = arts.length
    ? `<div class="card-grid">${arts.map((a) => articleCard(a)).join("\n")}</div>`
    : `<p style="color:var(--text-faint)">No guides in this category yet. Check back soon.</p>`;

  const body = `<div class="article-header" style="padding-top:32px;">
    <div class="eyebrow">Category</div>
    <h1>${cat.name}</h1>
  </div>
  <div class="page-grid">
    <div>
      <div class="section-head"><h2>Guides</h2></div>
      ${articleCardsHtml}
    </div>
    <div>
      ${subcatHtml || '<p style="color:var(--text-faint)">Products coming soon.</p>'}
    </div>
  </div>`;

  return pageShell({
    title: `${cat.name} — ${SITE_NAME}`,
    description: `${cat.name} buying guides, comparisons, and recommended picks.`,
    bodyHtml: body,
    comingSoonText,
    categories,
    activeCategory: cat.slug,
  });
}

for (const cat of categories) {
  fs.writeFileSync(path.join(DOCS_DIR, `category-${cat.slug}.html`), categoryPageHtml(cat));
}

const [featured, ...rest] = articles;
const gridArticles = rest.slice(0, 8);
const sidebarArticles = articles.slice(0, 5);

const categoryStripHtml = categories
  .map((cat) => {
    const count = productsForCategory(cat.slug).length;
    return `<a href="category-${cat.slug}.html">${cat.name}<span class="count">${count} product${count === 1 ? "" : "s"}</span></a>`;
  })
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
    }>${aiBadge(featured.imageIsAI && !!featured.image)}</div>
</div>`
  : "";

const gridHtml = gridArticles.map((a) => articleCard(a)).join("\n");
const sidebarHtml = sidebarArticles.map((a) => sidebarItem(a)).join("\n");

const indexBody = `<div style="padding: 32px 0 4px;">
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
  </div>`;

fs.writeFileSync(
  path.join(DOCS_DIR, "index.html"),
  pageShell({
    title: SITE_NAME,
    description: SITE_TAGLINE,
    bodyHtml: indexBody,
    extraScript: searchScript,
    comingSoonText,
    categories,
  })
);

const aboutBody = `<div class="article-header">
    <div class="eyebrow">About</div>
    <h1>About &amp; Affiliate Disclosure</h1>
  </div>
  <article class="body" style="max-width:760px;">
    <p>${SITE_NAME} publishes practical, tested-on-paper guidance for setting up a real, functional home office in a small apartment, dorm, or shared room — no spare room required.</p>
    <h2>Affiliate Disclosure</h2>
    <p>${SITE_NAME} is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com. As an Amazon Associate, we earn from qualifying purchases. This comes at no additional cost to you.</p>
    <p>Product recommendations are based on publicly available specifications, pricing, and customer review data. We do not receive products for free from manufacturers in exchange for coverage.</p>
    <h2>About our images</h2>
    <p>Where we don't yet have a real, human-verified product photo, articles display clearly labeled AI-generated reference illustrations instead — never a fabricated depiction of the actual product. Always check the Amazon listing via the buy link for real product photos before purchasing.</p>
    <h2>Contact</h2>
    <p>Questions or corrections: use the contact method listed in this site's footer or repository.</p>
  </article>`;
fs.writeFileSync(
  path.join(DOCS_DIR, "about.html"),
  pageShell({
    title: `About — ${SITE_NAME}`,
    description: "About and affiliate disclosure",
    bodyHtml: aboutBody,
    comingSoonText,
    categories,
  })
);

fs.writeFileSync(path.join(DOCS_DIR, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/about.html`,
  ...categories.map((c) => `${SITE_URL}/category-${c.slug}.html`),
  ...articles.map((a) => `${SITE_URL}/articles/${a.slug}.html`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
fs.writeFileSync(path.join(DOCS_DIR, "sitemap.xml"), sitemap);

console.log(`Built ${articles.length} article(s) and ${categories.length} categor${categories.length === 1 ? "y" : "ies"} (with content) into /docs`);