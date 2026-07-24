import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import { pageShell, articleCard, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../templates/layout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTICLES_DIR = path.join(ROOT, "content/articles");
const DOCS_DIR = path.join(ROOT, "docs");
const DOCS_ARTICLES_DIR = path.join(DOCS_DIR, "articles");

fs.mkdirSync(DOCS_ARTICLES_DIR, { recursive: true });

// Copy stylesheet
fs.copyFileSync(path.join(ROOT, "templates/style.css"), path.join(DOCS_DIR, "style.css"));

// Load + parse all articles
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
    html: marked.parse(content),
  };
});

// Sort newest first
articles.sort((a, b) => new Date(b.date) - new Date(a.date));

// Build each article page
for (const a of articles) {
  const body = `<div class="wrap">
  <div class="article-header">
    <div class="eyebrow">${a.category}</div>
    <h1>${a.title}</h1>
    <div class="meta">${a.date}</div>
  </div>
  <article class="body">
    ${a.html}
    <p class="disclosure-note">As an Amazon Associate, this site earns from qualifying purchases made through links above, at no extra cost to you. See our <a href="about.html">full disclosure</a>.</p>
  </article>
</div>`;
  const html = pageShell({
    title: `${a.title} — ${SITE_NAME}`,
    description: a.excerpt,
    bodyHtml: body,
  });
  fs.writeFileSync(path.join(DOCS_ARTICLES_DIR, `${a.slug}.html`), html);
}

// Build index page
const cardsHtml = articles.map(articleCard).join("\n");
const indexBody = `<div class="wrap">
  <div style="padding: 40px 0 10px;">
    <h1 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0 0 6px;">${SITE_NAME}</h1>
    <p style="color:#555; max-width: 60ch;">${SITE_TAGLINE}</p>
  </div>
  <div class="dimline">Latest guides</div>
  ${cardsHtml || "<p>New guides publish weekly. Check back soon.</p>"}
</div>`;
fs.writeFileSync(
  path.join(DOCS_DIR, "index.html"),
  pageShell({ title: SITE_NAME, description: SITE_TAGLINE, bodyHtml: indexBody })
);

// Build about/disclosure page
const aboutBody = `<div class="wrap">
  <div class="article-header">
    <div class="eyebrow">About</div>
    <h1>About &amp; Affiliate Disclosure</h1>
  </div>
  <article class="body">
    <p>${SITE_NAME} publishes practical, tested-on-paper guidance for setting up a real, functional home office in a small apartment, dorm, or shared room — no spare room required.</p>
    <h2>Affiliate Disclosure</h2>
    <p>${SITE_NAME} is a participant in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com. As an Amazon Associate, we earn from qualifying purchases. This comes at no additional cost to you.</p>
    <p>Product recommendations are based on publicly available specifications, pricing, and customer review data. We do not receive products for free from manufacturers in exchange for coverage.</p>
    <h2>Contact</h2>
    <p>Questions or corrections: use the contact method listed in this site's footer or repository.</p>
  </article>
</div>`;
fs.writeFileSync(
  path.join(DOCS_DIR, "about.html"),
  pageShell({ title: `About — ${SITE_NAME}`, description: "About and affiliate disclosure", bodyHtml: aboutBody })
);

// robots.txt + sitemap.xml
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