import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "content/products.json");
const ARTICLES_DIR = path.join(ROOT, "content/articles");
const TOPICS_PATH = path.join(ROOT, "content/topics.txt");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable / GitHub secret.");
  process.exit(1);
}

function loadProducts() {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8"));
  return data.products.filter((p) => !p.name.startsWith("REPLACE ME"));
}

function nextTopic() {
  const lines = fs.readFileSync(TOPICS_PATH, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 3) {
    return null;
  }
  const topic = lines[0];
  fs.writeFileSync(TOPICS_PATH, lines.slice(1).join("\n") + "\n");
  return topic;
}

function popTopic() {
  const lines = fs.readFileSync(TOPICS_PATH, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    console.error("No topics left in content/topics.txt even after replenishing — check the replenish step.");
    process.exit(1);
  }
  const topic = lines[0];
  fs.writeFileSync(TOPICS_PATH, lines.slice(1).join("\n") + "\n");
  return topic;
}

async function replenishTopics() {
  console.log("Topic queue running low — asking Gemini for more topics.");
  const existing = fs.readFileSync(TOPICS_PATH, "utf-8");
  const prompt = `You write topic ideas for a niche content site called "The Compact Office", which publishes buying guides, comparisons, and setup tips for people creating a functional home office in a small apartment, dorm, or shared room in the US.

Here are topics already used or queued (do not repeat these or anything too similar):
${existing}

Generate 20 new topic ideas for future articles, in the same style (short, specific, practical, each focused on one aspect of small-space home offices — desks, chairs, storage, lighting, cables, soundproofing, dual-use furniture, small-room layouts, budget setups, dorm setups, etc). Whenever two products of the same general type exist (e.g. two office chairs, two printers, two monitors), prioritize topics that directly compare them (e.g. "Office Chair A vs Office Chair B: Which Fits a Small Room Better").

Output ONLY a plain list, one topic per line, no numbering, no bullets, no extra commentary.`;
  const text = await callGemini(prompt);
  const newTopics = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  fs.writeFileSync(TOPICS_PATH, existing.trim() + "\n" + newTopics.join("\n") + "\n");
  console.log(`Added ${newTopics.length} new topics to content/topics.txt`);
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function callGemini(prompt) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4000 },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("\n");
}

function modeCategorySlug(products) {
  if (!products.length) return null;
  const counts = {};
  for (const p of products) {
    if (!p.category_slug) continue;
    counts[p.category_slug] = (counts[p.category_slug] || 0) + 1;
  }
  let best = null;
  let bestCount = 0;
  for (const [slug, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = slug;
      bestCount = count;
    }
  }
  return best;
}

function imageSubjectFor(products, topic) {
  if (!products.length) return topic;
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))];
  if (cats.length === 0) return topic;
  if (cats.length === 1) return cats[0];
  return cats.join(" and ");
}

function sanitizeMarkdown(text) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

function addFrontmatterFields(markdown, extraFields) {
  try {
    const parsed = matter(markdown + "\n");
    Object.assign(parsed.data, extraFields);
    return matter.stringify(parsed.content, parsed.data);
  } catch (err) {
    console.warn(`Could not cleanly parse frontmatter (${err.message}) — inserting fields manually instead.`);
    const lines = Object.entries(extraFields)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    const closingDelimIndex = markdown.startsWith("---") ? markdown.indexOf("\n---", 3) : -1;
    if (closingDelimIndex !== -1) {
      return (
        markdown.slice(0, closingDelimIndex) +
        "\n" +
        lines.join("\n") +
        markdown.slice(closingDelimIndex)
      );
    }
    return `---\n${lines.join("\n")}\n---\n\n${markdown}`;
  }
}

async function main() {
  const products = loadProducts();
  if (products.length === 0) {
    console.error(
      "content/products.json has no real products yet. Add at least one real Amazon product (with your affiliate tag) before generating articles."
    );
    process.exit(1);
  }

  let topic = nextTopic();
  if (topic === null) {
    await replenishTopics();
    topic = popTopic();
  }

  const productBlock = products
    .map(
      (p) =>
        `- id: ${p.id} | name: ${p.name} | category: ${p.category} | footprint: ${p.footprint} | price: ${p.price_range} | specs: ${p.key_specs.join(
          ", "
        )} | url: ${p.url}`
    )
    .join("\n");

  const prompt = `You are writing one article for a niche site called "The Compact Office", which helps people in the USA set up a real, functional home office in a small apartment, dorm, or shared room.

Topic for this article: "${topic}"

You may ONLY recommend products from this exact list (do not invent products, prices, or specs — use only what's given):
${productBlock}

Write the article as Markdown with YAML frontmatter in exactly this format:

---
title: "..."
excerpt: "one sentence, under 25 words"
category: "Buying Guide" | "Setup Tips" | "Comparison"
date: "${new Date().toISOString().slice(0, 10)}"
---

(article markdown body here)

Requirements:
- 700-1200 words, USA audience, practical and specific to small spaces.
- Use H2 sections.
- DECIDE THE FORMAT FIRST:
  - If two or more products from the list above share the SAME category (e.g. two office chairs, two printers, two monitors), you MUST write this as a COMPARISON + REVIEW article: start with an H2 "Quick Comparison" section containing a Markdown table with columns Product | Price | Key Specs | Best For, using only the compared products. After the table, include a separate pick block (format below) for EACH compared product, then continue with prose sections reviewing each in more depth.
  - If only one product from the list genuinely fits, write a single in-depth REVIEW article with one pick block for that product.
  - If none of the provided products genuinely fit this topic, say so plainly in the article rather than forcing a mismatched recommendation, and skip the pick block(s) entirely.
- For each product you recommend, insert this exact HTML block once, at the point where you first introduce it (fill in the values from the matching product):
<div class="pick">
  <div class="label">Recommended pick</div>
  <div class="name">PRODUCT NAME</div>
  <p>One or two sentences on why it fits, using only the specs given.</p>
  <a class="buy" href="PRODUCT URL" rel="nofollow sponsored" target="_blank">Check price on Amazon</a>
</div>
- After a product's pick block, you will likely mention its name again naturally in later paragraphs (e.g. "The Monomi desk stands out because..."). Whenever you do, write that mention as an inline HTML link to the exact same product URL, in exactly this form: <a href="PRODUCT URL" rel="nofollow sponsored" target="_blank">Monomi Small Electric Standing Desk</a>. Do this for genuine, naturally-occurring mentions only — do not add extra sentences or paragraphs just to create more links, and do not link generic words like "desk" or "it," only the actual product name.
- Do not make medical, legal, or guaranteed-outcome claims.
- Do not fabricate reviews, ratings, or sales figures.
- Output ONLY the frontmatter + markdown. No preamble, no code fences.`;

  console.log(`Generating article for topic: ${topic}`);
  const rawArticleMd = await callGemini(prompt);
  const articleMd = sanitizeMarkdown(rawArticleMd);

  const titleMatch = articleMd.match(/title:\s*"(.*?)"/);
  const title = titleMatch ? titleMatch[1] : topic;
  const slug = slugify(title);

  const referencedProducts = products.filter((p) => articleMd.includes(p.url));

  let image = null;
  if (referencedProducts.length === 1 && referencedProducts[0].image) {
    console.log(`Using the real product photo for: ${referencedProducts[0].name}`);
    image = {
      url: referencedProducts[0].image,
      credit: referencedProducts[0].image_credit || "",
    };
  }

  const shopCategory = modeCategorySlug(referencedProducts.length ? referencedProducts : products);
  const imageSubject = imageSubjectFor(referencedProducts, topic);

  // Force comparison format whenever 2+ referenced products share the same
  // product category — rather than leaving it to chance based on how the
  // topic was phrased or how the model interpreted it.
  const hasComparableCategory =
    referencedProducts.length >= 2 &&
    referencedProducts[0].category === referencedProducts[1]?.category;
  const format = hasComparableCategory ? "comparison" : "review";

  const extraFields = {
    shop_category: shopCategory,
    image_subject: imageSubject,
    format,
  };
  if (format === "comparison" && !image) {
    extraFields.compare_products = referencedProducts.slice(0, 2).map((p) => ({
      name: p.name,
      category: p.category,
    }));
  }
  if (image) {
    extraFields.image = image.url;
    if (image.credit) extraFields.image_credit = image.credit;
  }

  const finalMd = addFrontmatterFields(articleMd, extraFields).trim() + "\n";

  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTICLES_DIR, `${slug}.md`), finalMd);
  console.log(
    `Wrote content/articles/${slug}.md (${format}${image ? ", with real product photo" : format === "comparison" ? ", vs-style AI images" : ", AI reference image"})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});