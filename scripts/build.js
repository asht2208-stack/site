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
const FIREBASE_CONFIG_PATH = path.join(ROOT, "content/firebase-config.json");

const BUY_ME_A_COFFEE_URL = "https://ko-fi.com/umk161918";

fs.mkdirSync(DOCS_ARTICLES_DIR, { recursive: true });
fs.mkdirSync(AI_IMAGE_DIR, { recursive: true });
fs.copyFileSync(path.join(ROOT, "templates/style.css"), path.join(DOCS_DIR, "style.css"));

const productsData = fs.existsSync(PRODUCTS_PATH)
  ? JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8"))
  : { products: [] };

const categoriesData = fs.existsSync(CATEGORIES_PATH)
  ? JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf-8"))
  : { categories: [] };

// Reader ratings & reviews are stored in Firebase Firestore (free tier, no
// credit card). If content/firebase-config.json hasn't been filled in yet,
// the reviews widget renders a "not set up yet" message instead of a form,
// so the site never breaks while Firebase setup is pending.
const firebaseConfig = fs.existsSync(FIREBASE_CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, "utf-8"))
  : { projectId: "", apiKey: "" };
const firebaseReady =
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== "YOUR_FIREBASE_PROJECT_ID" &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_FIREBASE_WEB_API_KEY";

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
    `professional product photograph of ${safeSubject}, a ${category.toLowerCase()}, ` +
    `${variant}, placed in a small modern home office, clean tidy desk, soft natural window light, ` +
    `neutral warm tones, photorealistic, sharp focus on the item, no text, no logos, no brand names, no people, no watermarks`
  );
}

async function generateAiImage(prompt, seed, destPath) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=450&nologo=true&seed=${seed}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
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

async function ensureImage(prompt, seed, destPath) {
  if (fs.existsSync(destPath)) return true;
  let ok = await generateAiImage(prompt, seed, destPath);
  if (!ok) {
    console.log("Retrying after rate-limit cooldown...");
    await sleep(20000);
    ok = await generateAiImage(prompt, seed, destPath);
  }
  await sleep(17000);
  return ok;
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

// Renders a clean side-by-side comparison strip for 2 OR 3 products, with
// a small "VS" divider between each pair. Layout adapts automatically —
// no separate code path needed for 2-way vs 3-way comparisons.
function vsCompareHtml(a) {
  if (!a.compareImages || a.compareImages.length < 2) return "";
  const side = (item) => `<div class="vs-item ${item.src ? "" : "no-photo"}" ${
    item.src ? `style="background-image:url('${item.src}')"` : ""
  }>
    ${aiBadgeSm(true)}
    <div class="vs-caption">${item.name}</div>
  </div>`;

  const parts = [];
  a.compareImages.forEach((item, i) => {
    if (i > 0) parts.push(`<div class="vs-badge">VS</div>`);
    parts.push(side(item));
  });

  return `<div class="vs-compare vs-compare-${a.compareImages.length}">
  ${parts.join("\n")}
</div>
<div class="photo-credit">Reference images generated by AI for illustration only. See the Amazon listings via the buy links below for actual product photos.</div>`;
}

// Renders the reader ratings & reviews widget for a single article page.
// Reviews are stored in Firestore at articles/{slug}/reviews/{autoId} and
// read/written directly from the browser via the Firestore REST API — no
// server needed, works fine on static GitHub Pages hosting. If Firebase
// hasn't been configured yet, the widget shows a "not set up yet" message
// and hides the form instead of breaking the page.
function reviewsSectionHtml(slug) {
  const projectId = firebaseReady ? firebaseConfig.projectId : "";
  const apiKey = firebaseReady ? firebaseConfig.apiKey : "";

  return `<div class="reviews-section">
  <div class="section-head"><h2>Reader Ratings &amp; Reviews</h2></div>
  <div class="reviews-summary" id="reviews-summary-${slug}">
    <div class="reviews-summary-loading">Loading reviews…</div>
  </div>
  <div class="reviews-list" id="reviews-list-${slug}"></div>

  <div class="review-form-box" id="review-form-box-${slug}">
    <div class="review-form-title">Leave a rating &amp; review</div>
    <div class="star-input" id="star-input-${slug}">
      <span class="star-input-star" data-value="1">★</span>
      <span class="star-input-star" data-value="2">★</span>
      <span class="star-input-star" data-value="3">★</span>
      <span class="star-input-star" data-value="4">★</span>
      <span class="star-input-star" data-value="5">★</span>
    </div>
    <input type="text" id="review-name-${slug}" class="review-input" placeholder="Name (optional)" maxlength="60">
    <textarea id="review-comment-${slug}" class="review-input review-textarea" placeholder="What did you think? (required)" maxlength="1000"></textarea>
    <button type="button" id="review-submit-${slug}" class="btn-primary">Submit Review</button>
    <div class="review-form-msg" id="review-form-msg-${slug}"></div>
  </div>
</div>
<script>
(function(){
  var FIREBASE_PROJECT_ID = "${projectId}";
  var FIREBASE_API_KEY = "${apiKey}";
  var SLUG = "${slug}";
  var BASE_URL = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents/articles/" + SLUG + "/reviews";

  var summaryEl = document.getElementById("reviews-summary-" + SLUG);
  var listEl = document.getElementById("reviews-list-" + SLUG);
  var starInput = document.getElementById("star-input-" + SLUG);
  var stars = starInput ? starInput.querySelectorAll(".star-input-star") : [];
  var nameInput = document.getElementById("review-name-" + SLUG);
  var commentInput = document.getElementById("review-comment-" + SLUG);
  var submitBtn = document.getElementById("review-submit-" + SLUG);
  var msgEl = document.getElementById("review-form-msg-" + SLUG);
  var formBox = document.getElementById("review-form-box-" + SLUG);

  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) {
    if (summaryEl) summaryEl.innerHTML = '<div class="reviews-summary-loading">Reviews are not set up yet.</div>';
    if (formBox) formBox.style.display = "none";
    return;
  }

  var currentRating = 0;

  function setStars(value){
    currentRating = value;
    for (var i = 0; i < stars.length; i++){
      var v = parseInt(stars[i].getAttribute("data-value"), 10);
      if (v <= value) { stars[i].classList.add("filled"); }
      else { stars[i].classList.remove("filled"); }
    }
  }

  for (var i = 0; i < stars.length; i++){
    stars[i].addEventListener("click", function(e){
      setStars(parseInt(e.target.getAttribute("data-value"), 10));
    });
  }

  function starsHtml(rating, size){
    var out = "";
    for (var i = 1; i <= 5; i++){
      out += '<span class="static-star' + (i <= Math.round(rating) ? ' filled' : '') + (size ? ' ' + size : '') + '">★</span>';
    }
    return out;
  }

  function renderReviews(reviews){
    if (!reviews.length){
      summaryEl.innerHTML = '<div class="reviews-summary-empty">No reviews yet — be the first to share your experience.</div>';
      listEl.innerHTML = "";
      return;
    }
    var total = 0;
    for (var i = 0; i < reviews.length; i++) total += reviews[i].rating;
    var avg = total / reviews.length;
    summaryEl.innerHTML =
      '<div class="reviews-avg-number">' + avg.toFixed(1) + '</div>' +
      '<div class="reviews-avg-stars">' + starsHtml(avg, "lg") + '</div>' +
      '<div class="reviews-avg-count">' + reviews.length + ' review' + (reviews.length === 1 ? '' : 's') + '</div>';

    reviews.sort(function(a,b){ return (b.createdAt || "").localeCompare(a.createdAt || ""); });

    listEl.innerHTML = reviews.map(function(r){
      var d = r.createdAt ? new Date(r.createdAt) : null;
      var dateStr = (d && !isNaN(d)) ? d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
      var safeName = (r.name || "Anonymous").replace(/</g, "&lt;");
      var safeComment = (r.comment || "").replace(/</g, "&lt;");
      return '<div class="review-item">' +
        '<div class="review-item-head">' +
          '<span class="review-item-name">' + safeName + '</span>' +
          '<span class="review-item-stars">' + starsHtml(r.rating) + '</span>' +
          '<span class="review-item-date">' + dateStr + '</span>' +
        '</div>' +
        '<p class="review-item-comment">' + safeComment + '</p>' +
      '</div>';
    }).join("");
  }

  function parseDoc(doc){
    var f = doc.fields || {};
    return {
      rating: (f.rating && f.rating.integerValue) ? parseInt(f.rating.integerValue, 10) : 0,
      name: (f.name && f.name.stringValue) ? f.name.stringValue : "",
      comment: (f.comment && f.comment.stringValue) ? f.comment.stringValue : "",
      createdAt: (f.createdAt && f.createdAt.timestampValue) ? f.createdAt.timestampValue : ""
    };
  }

  function loadReviews(){
    fetch(BASE_URL + "?pageSize=300&key=" + FIREBASE_API_KEY)
      .then(function(res){ return res.json(); })
      .then(function(data){
        var docs = (data && data.documents) || [];
        renderReviews(docs.map(parseDoc));
      })
      .catch(function(){
        summaryEl.innerHTML = '<div class="reviews-summary-empty">Could not load reviews right now.</div>';
      });
  }

  function alreadyReviewed(){
    try { return localStorage.getItem("reviewed-" + SLUG) === "1"; } catch(e){ return false; }
  }

  function markReviewed(){
    try { localStorage.setItem("reviewed-" + SLUG, "1"); } catch(e){}
  }

  if (alreadyReviewed() && formBox){
    formBox.innerHTML = '<div class="review-form-msg review-form-msg-done">You already left a review for this guide. Thanks!</div>';
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", function(){
      var comment = (commentInput.value || "").trim();
      if (currentRating < 1 || currentRating > 5){
        msgEl.textContent = "Please select a star rating.";
        return;
      }
      if (!comment){
        msgEl.textContent = "Please write a short review.";
        return;
      }
      if (comment.length > 1000){
        msgEl.textContent = "Review is too long (max 1000 characters).";
        return;
      }
      var name = (nameInput.value || "").trim().slice(0, 60);

      submitBtn.disabled = true;
      msgEl.textContent = "Submitting…";

      var body = {
        fields: {
          rating: { integerValue: String(currentRating) },
          comment: { stringValue: comment },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      };
      if (name) body.fields.name = { stringValue: name };

      fetch(BASE_URL + "?key=" + FIREBASE_API_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
        .then(function(res){
          if (!res.ok) throw new Error("Request failed");
          return res.json();
        })
        .then(function(){
          markReviewed();
          msgEl.textContent = "Thanks for your review!";
          commentInput.value = "";
          nameInput.value = "";
          setStars(0);
          submitBtn.disabled = true;
          loadReviews();
        })
        .catch(function(){
          msgEl.textContent = "Something went wrong submitting your review. Please try again.";
          submitBtn.disabled = false;
        });
    });
  }

  loadReviews();
})();
</script>`;
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

// Fill in images: real photo (already set) > vs-style set for comparisons
// (2 or 3 items) > single AI image for regular reviews.
for (const a of articles) {
  if (a.image) continue;

  if (a.format === "comparison" && a.compareProducts && a.compareProducts.length >= 2) {
    const items = a.compareProducts.slice(0, 3);
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const letter = String.fromCharCode(97 + i); // a, b, c
      const destPath = path.join(AI_IMAGE_DIR, `${a.slug}-${letter}.jpg`);
      const relPath = `images/ai/${a.slug}-${letter}.jpg`;
      const ok = await ensureImage(aiPromptFor(p.category, p.name, a.slug + "-" + letter), seedFromString(a.slug + "-" + letter), destPath);
      results.push({ src: ok ? relPath : null, name: p.name });
    }
    a.compareImages = results;
    a.imageIsAI = true;
    continue;
  }

  const destPath = path.join(AI_IMAGE_DIR, `${a.slug}.jpg`);
  const relPath = `images/ai/${a.slug}.jpg`;
  const ok = await ensureImage(aiPromptFor(a.category, a.imageSubject || a.title, a.slug), seedFromString(a.slug), destPath);
  if (ok) {
    a.image = relPath;
    a.imageIsAI = true;
  }
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
  ${reviewsSectionHtml(a.slug)}
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

const supportBody = `<div class="article-header">
    <div class="eyebrow">Support</div>
    <h1>Buy Us a Coffee</h1>
  </div>
  <article class="body" style="max-width:640px;">
    <p>${SITE_NAME} is an independent, one-person project. Every guide is researched, written, and published to help people set up a real, functional home office in a small space — without pushy sales tactics or fake reviews.</p>
    <p>If a guide saved you time, helped you make a better purchase, or just made your small-space setup a little nicer, you can support the site by buying us a coffee. It genuinely helps cover hosting, tools, and the time spent keeping recommendations accurate and honest.</p>
    <p>Every contribution, big or small, goes directly toward keeping this site independent and ad-free beyond our Amazon affiliate disclosures.</p>
    <a class="btn-primary" href="${BUY_ME_A_COFFEE_URL}" target="_blank" rel="noopener" style="margin-top:12px;">☕ Buy Me a Coffee</a>
    <p style="margin-top:32px; font-size:.85rem; color:var(--text-faint);">Support is entirely optional and never required to access any guide, comparison, or recommendation on this site.</p>
  </article>`;
fs.writeFileSync(
  path.join(DOCS_DIR, "support.html"),
  pageShell({
    title: `Support Us — ${SITE_NAME}`,
    description: "Support The Compact Office with a small donation",
    bodyHtml: supportBody,
    comingSoonText,
    categories,
  })
);

fs.writeFileSync(path.join(DOCS_DIR, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/about.html`,
  `${SITE_URL}/support.html`,
  ...categories.map((c) => `${SITE_URL}/category-${c.slug}.html`),
  ...articles.map((a) => `${SITE_URL}/articles/${a.slug}.html`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
fs.writeFileSync(path.join(DOCS_DIR, "sitemap.xml"), sitemap);

console.log(`Built ${articles.length} article(s) and ${categories.length} categor${categories.length === 1 ? "y" : "ies"} (with content) into /docs`);