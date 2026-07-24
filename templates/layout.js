export const SITE_NAME = "The Compact Office";
export const SITE_TAGLINE = "Small-footprint home office setups, reviewed for people who don't have a spare room.";
export const SITE_URL = "https://YOUR-USERNAME.github.io/YOUR-REPO"; // update after deploy

function head(title, description) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">`;
}

function header() {
  return `<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">${SITE_NAME} <span class="dim">≈ 6' × 8'</span></a>
    <nav>
      <a href="/">Articles</a>
      <a href="/about.html">About</a>
    </nav>
  </div>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="wrap">
    <p>© ${new Date().getFullYear()} ${SITE_NAME}. As an Amazon Associate we earn from qualifying purchases. See <a href="/about.html">disclosure</a>.</p>
  </div>
</footer>`;
}

export function pageShell({ title, description, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(title, description)}
</head>
<body>
${header()}
${bodyHtml}
${footer()}
</body>
</html>`;
}

export function articleCard({ slug, title, excerpt, date, category }) {
  return `<div class="article-card">
  <div class="eyebrow">${category || "Guide"}</div>
  <h2><a href="/articles/${slug}.html">${title}</a></h2>
  <p class="excerpt">${excerpt}</p>
  <div class="meta">${date}</div>
</div>`;
}
