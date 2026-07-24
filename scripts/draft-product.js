import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "content/products.json");
const PENDING_PATH = path.join(ROOT, "content/products-pending.json");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable / GitHub secret.");
  process.exit(1);
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
        generationConfig: { maxOutputTokens: 1500 },
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

function loadJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const existingData = loadJsonSafe(PRODUCTS_PATH, { products: [] });
  const existingNames = existingData.products.map((p) => p.name).join(", ");

  const pendingData = loadJsonSafe(PENDING_PATH, { pending: [] });
  const pendingNames = pendingData.pending.map((p) => p.suggested_name).join(", ");

  const prompt = `You help find product ideas for a niche site called "The Compact Office", which covers compact desks, chairs, storage, and organization products for small home offices, apartments, dorms, and shared rooms, for a USA audience.

Products already added: ${existingNames || "none yet"}
Products already suggested and awaiting review: ${pendingNames || "none yet"}

Suggest ONE genuinely popular, well-reviewed, currently-available product category item that would fit this niche and isn't already listed above (e.g. a specific type of compact desk, chair, monitor arm, storage cart, cable organizer, etc — a general product idea, not a fabricated specific model you aren't certain is real).

IMPORTANT: Do not invent a specific brand/model/price/ASIN as if it were verified fact — a human will verify the real product on Amazon before this is used. Give your best real-world knowledge of what tends to sell well in this category, phrased as a suggestion to research, not a confirmed listing.

Respond ONLY in this exact JSON format, no other text:
{
  "suggested_name": "general product type/category, e.g. 'Compact monitor arm for small desks'",
  "category": "one word, e.g. desk/chair/storage/lighting/cables",
  "why_it_fits": "one sentence on why this fits the small-space niche",
  "estimated_price_range": "a realistic rough USD range based on general market knowledge, e.g. '$30-$60', clearly a starting estimate to verify",
  "search_hint": "a short Amazon search phrase to find real options, e.g. 'compact monitor arm single'"
}`;

  console.log("Asking Gemini for a product suggestion to research...");
  const raw = await callGemini(prompt);
  const cleaned = raw.trim().replace(/^```json\n?/, "").replace(/```$/, "");
  let suggestion;
  try {
    suggestion = JSON.parse(cleaned);
  } catch (err) {
    console.error("Could not parse Gemini's response as JSON:", cleaned);
    process.exit(1);
  }

  suggestion.status = "pending_review";
  suggestion.note =
    "AI-suggested category, NOT a verified product. Find a real matching item on Amazon, confirm its actual price/specs/ASIN, then add it to content/products.json yourself with your affiliate tag. Delete this entry once handled.";
  suggestion.suggested_on = new Date().toISOString().slice(0, 10);

  pendingData.pending = pendingData.pending || [];
  pendingData.pending.push(suggestion);
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pendingData, null, 2) + "\n");
  console.log(`Added a pending suggestion to content/products-pending.json: ${suggestion.suggested_name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});