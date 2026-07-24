import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (lines.length === 0) {
    console.error("No topics left in content/topics.txt — add more before the next run.");
    process.exit(1);
  }
  const topic = lines[0];
  fs.writeFileSync(TOPICS_PATH, lines.slice(1).join("\n") + "\n");
  return topic;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/