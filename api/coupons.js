import Anthropic from "@anthropic-ai/sdk";

// Small, fast model — this runs on every shopping page load, so latency and
// cost matter more than raw capability. Bump to "claude-opus-4-8" or
// "claude-sonnet-4-6" if you want more nuanced store detection.
const MODEL = "claude-haiku-4-5";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const STORE_SCHEMA = {
  type: "object",
  properties: {
    brand: {
      type: "string",
      description: "Canonical store/brand name, properly capitalized (e.g. 'Nike', 'ASOS', 'Best Buy')"
    },
    slug: {
      type: "string",
      description: "Lowercase URL slug for the brand, letters/numbers only, no spaces or punctuation (e.g. 'nike', 'bestbuy')"
    },
    region: {
      type: "string",
      enum: ["US", "UK", "CA", "AU"],
      description: "Primary shopping region for this store"
    },
    isOnlineStore: {
      type: "boolean",
      description: "True only if this is a genuine online shop where a person can buy products"
    }
  },
  required: ["brand", "slug", "region", "isOnlineStore"],
  additionalProperties: false
};

function detectRegion(hostname) {
  if (hostname.endsWith(".com.au")) return "AU";
  if (hostname.endsWith(".co.uk")) return "UK";
  if (hostname.endsWith(".ca")) return "CA";
  return "US";
}

// Heuristic fallback used when the AI is unavailable or errors out.
function heuristicStore(hostname) {
  const raw = hostname.replace(/^www\d*\./, "").split(".")[0];
  const brand = raw.charAt(0).toUpperCase() + raw.slice(1);
  return {
    brand,
    slug: raw.toLowerCase().replace(/[^a-z0-9]/g, ""),
    region: detectRegion(hostname),
    isOnlineStore: true
  };
}

// AI store detection: turns a messy hostname into a clean brand + slug + region.
async function analyzeStore({ hostname, url }) {
  if (!anthropic) return null;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      output_config: { format: { type: "json_schema", schema: STORE_SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            "Identify the online store from the URL below. Return the canonical brand " +
            "name, a lowercase url slug for it, the primary shopping region, and whether " +
            "it is a genuine online store.\n\n" +
            `URL: ${url}\nHostname: ${hostname}`
        }
      ]
    });

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    // Sanitize the slug defensively before it goes into coupon-site URLs.
    parsed.slug = String(parsed.slug || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!parsed.slug) return null;
    return parsed;
  } catch (err) {
    console.error("Couponify AI analysis failed:", err);
    return null;
  }
}

async function checkHead(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.status !== 404 && res.status !== 410;
  } catch {
    return false;
  }
}

async function generateUrls({ slug, region }) {
  const [honeyOk, couponsOk] = await Promise.all([
    checkHead(`https://www.joinhoney.com/shop/${slug}`),
    checkHead(`https://www.coupons.com/coupon-codes/${slug}`)
  ]);

  if (!honeyOk && !couponsOk) {
    return [];
  }

  const storeDomain =
    region === "AU" ? `${slug}.com.au`
    : region === "UK" ? `${slug}.co.uk`
    : region === "CA" ? `${slug}.ca`
    : `${slug}.com`;

  const results = [];

  results.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${storeDomain}`,
    verified: false
  });

  if (honeyOk) {
    results.push({
      name: "Honey",
      url: `https://www.joinhoney.com/shop/${slug}`,
      verified: true
    });
  }

  results.push({
    name: "Groupon",
    url: region === "AU"
      ? `https://www.groupon.com.au/vouchers/${slug}`
      : `https://www.groupon.com/coupons/${slug}`,
    verified: false
  });

  if (couponsOk) {
    results.push({
      name: "Coupons.com",
      url: `https://www.coupons.com/coupon-codes/${slug}`,
      verified: true
    });
  }

  return results;
}

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const inputUrl = req.query.url;
    if (!inputUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const parsed = new URL(inputUrl);
    const hostname = parsed.hostname.replace(/^www\d*\./, "");

    // AI first, heuristic fallback.
    const store = (await analyzeStore({ hostname, url: inputUrl })) || heuristicStore(hostname);

    // If the AI is confident this isn't a real store, return nothing.
    if (store.isOnlineStore === false) {
      return res.status(200).json({
        brand: store.brand,
        region: store.region,
        aiUsed: !!anthropic,
        couponSites: []
      });
    }

    const couponSites = await generateUrls({ slug: store.slug, region: store.region });

    return res.status(200).json({
      brand: store.brand,
      region: store.region,
      aiUsed: !!anthropic,
      couponSites
    });
  } catch (err) {
    console.error("Couponify backend error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
