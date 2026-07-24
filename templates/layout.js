export const SITE_NAME = "The Compact Office";
export const SITE_TAGLINE = "Small-footprint home office setups, reviewed for people who don't have a spare room.";
export const SITE_URL = "https://asht2208-stack.github.io/site";

function head(title, description) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<base href="${SITE_URL}/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">`;
}

function header() {
  return `<header class="site-header">
  <div class="wrap row">
    <a class="brand" href="index.html">[<span class="bracket">${SITE_NAME}</span>]</a>
    <nav>
      <a href="index.html">Home</a>
      <a href="index.html">Guides</a>
      <a href="about.html">About</a>
    </nav>
    <div class="header-search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="site-search" type="text" placeholder="Search guides...">
    </div>
  </div>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="wrap">
    <p>© ${new Date().getFullYear()} ${SITE_NAME}. As an Amazon Associate we earn from qualifying purchases. See <a href="about.html">disclosure</a>.</p>
  </div>
</footer>`;
}

export function pageShell({ title, description, bodyHtml, extraScript = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(title, description)}
</head>
<body>
${header()}
${bodyHtml}
${footer()}
${extraScript}
</body>
</html>`;
}

function thumbStyle(image) {
  return image ? `style="background-image:url('${image}')"` : "";
}

export function articleCard({ slug, title, excerpt, date, category, readTime, image }) {
  return `<div class="article-card" data-search-title="${title.toLowerCase()}">
  <div class="thumb ${image ? "" : "no-photo"}" ${thumbStyle(image)}></div>
  <div class="card-body">
    <div class="eyebrow">${category || "Guide"}</div>
    <h3><a href="articles/${slug}.html">${title}</a></h3>
    <p class="excerpt">${excerpt}</p>
    <div class="meta"><span>${readTime}</span><span>${date}</span></div>
  </div>
</div>`;
}

export function sidebarItem({ slug, title, date, readTime, image }) {
  return `<div class="sidebar-item">
  <div class="thumb ${image ? "" : "no-photo"}" ${thumbStyle(image)}></div>
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