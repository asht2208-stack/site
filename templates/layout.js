export const SITE_NAME = "The Compact Office";
export const SITE_TAGLINE = "Smart Workspace Reviews";
export const SITE_URL = "https://asht2208-stack.github.io/site";

function head(title, description) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<base href="${SITE_URL}/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-VSH1ZQFS9Q"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-VSH1ZQFS9Q');
</script>`;
}

function header(categories = []) {
  const categoryLinks = categories
    .map((c) => `<a href="category-${c.slug}.html">${c.name}</a>`)
    .join("\n        ");

  return `<header class="site-header">
    <div class="wrap navbar">

      <a class="brand" href="index.html">
        <span class="brand-title">${SITE_NAME}</span>
        <span class="brand-tagline">${SITE_TAGLINE}</span>
      </a>

      <nav class="main-nav">
        <a href="index.html">Home</a>
        ${categoryLinks}
        <a href="about.html">About</a>
      </nav>

      <div class="header-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>

        <input
          id="site-search"
          type="text"
          placeholder="Search guides...">
      </div>

    </div>
  </header>`;
}

function footer(comingSoonText) {
  const comingSoonHtml = comingSoonText
    ? `<div class="coming-soon">📦 Coming soon: our guide on <span class="coming-soon-pulse">${comingSoonText}</span></div>`
    : "";
  return `<footer class="site-footer">
  <div class="wrap">
    ${comingSoonHtml}
    <p>© ${new Date().getFullYear()} ${SITE_NAME}. As an Amazon Associate we earn from qualifying purchases. See <a href="about.html">disclosure</a>.</p>
  </div>
</footer>`;
}

export function pageShell({ title, description, bodyHtml, extraScript = "", comingSoonText = "", categories = [] }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(title, description)}
</head>
<body>
${header(categories)}
${bodyHtml}
${footer(comingSoonText)}
${extraScript}
</body>
</html>`;
}

function thumbStyle(image) {
  return image ? `style="background-image:url('${image}')"` : "";
}

function aiBadgeSmall(isAI) {
  return isAI
    ? `<div class="ai-badge ai-badge-sm" title="AI-generated reference image — not an actual product photo">AI ref</div>`
    : "";
}

export function articleCard({ slug, title, excerpt, date, category, readTime, image, imageIsAI }) {
  return `<div class="article-card" data-search-title="${title.toLowerCase()}">
  <div class="thumb ${image ? "" : "no-photo"}" ${thumbStyle(image)}>${aiBadgeSmall(imageIsAI)}</div>
  <div class="card-body">
    <div class="eyebrow">${category || "Guide"}</div>
    <h3><a href="articles/${slug}.html">${title}</a></h3>
    <p class="excerpt">${excerpt}</p>
    <div class="meta"><span>${readTime}</span><span>${date}</span></div>
  </div>
</div>`;
}

export function sidebarItem({ slug, title, date, readTime, image, imageIsAI }) {
  return `<div class="sidebar-item">
  <div class="thumb ${image ? "" : "no-photo"}" ${thumbStyle(image)}>${aiBadgeSmall(imageIsAI)}</div>
  <div>
    <h4><a href="articles/${slug}.html">${title}</a></h4>
    <div class="meta">${readTime} &middot; ${date}</div>
  </div>
</div>`;
}

export const searchScript = `<script>
(function() {
  const input = document.getElementById('site-search');
  if (!input) return;

  const cards = Array.from(document.querySelectorAll('[data-search-title]'));

  input.addEventListener('input', function() {
    const q = input.value.trim().toLowerCase();

    cards.forEach(function(card) {
      const match = card.getAttribute('data-search-title').includes(q);
      card.style.display = match ? '' : 'none';
    });
  });
})();
</script>`;