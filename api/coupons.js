import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

if (!SERPAPI_KEY) {
  console.error("❌ SERPAPI_KEY is missing");
}

// ---------- HELPERS ----------

function getDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return null;
  }
}

function getBrand(domain) {
  return domain.split(".")[0];
}

/**
 * VERY STRICT coupon extraction
 * - Only if explicitly mentioned
 * - Long, non-generic codes only
 * - Heavy blacklist
 */
function extractRealCouponCodes(text) {
  if (!/(use code|promo code|coupon code)/i.test(text)) return [];

  const matches = text.match(/\b[A-Z0-9]{8,15}\b/g) || [];

  const blacklist = [
    "WELCOME",
    "SAVE",
    "DISCOUNT",
    "OFF",
    "DEAL",
    "PROMO",
    "ORDER",
    "ONLINE",
    "SHOP",
    "SALE",
    "EXAMPLE",
    "CODE"
  ];

  return matches.filter(code =>
    !blacklist.some(word => code.includes(word))
  );
}

function confidenceFromText(text) {
  if (/verified|official|working/i.test(text)) return "High";
  if (/reported|may work/i.test(text)) return "Medium";
  return "Low";
}

/**
 * Reject base pages and non-brand pages
 */
function isValidCouponPage(url, brand) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const b = brand.toLowerCase();

    if (!path.includes(b)) return false;
    if (path === "/" || path.length < 6) return false;

    return true;
  } catch {
    return false;
  }
}

// ---------- MAIN ROUTE ----------

app.get("/api/coupons", async (req, res) => {
  try {
    const pageUrl = req.query.url;
    const forceSearch = req.query.search === "true";

    if (!pageUrl || !forceSearch) {
      return res.json({
        coupons: [],
        couponSites: [],
        message: "Search not triggered"
      });
    }

    const domain = getDomain(pageUrl);
    if (!domain) {
      return res.json({
        coupons: [],
        couponSites: [],
        message: "Invalid URL"
      });
    }

    const brand = getBrand(domain);

    const query = `"${brand}" coupon code`;

    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(
        query
      )}&engine=google&api_key=${SERPAPI_KEY}`
    );

    const data = await serpRes.json();

    // ---------- COUPON CODE EXTRACTION ----------

    const coupons = [];

    (data.organic_results || []).forEach(r => {
      if (!r.snippet) return;

      const codes = extractRealCouponCodes(r.snippet);
      const confidence = confidenceFromText(r.snippet);

      // FAIL CLOSED: reject low confidence entirely
      if (confidence === "Low") return;

      codes.forEach(code => {
        coupons.push({
          code,
          description: r.snippet.slice(0, 120),
          confidence
        });
      });
    });

    const uniqueCoupons = Object.values(
      coupons.reduce((acc, c) => {
        acc[c.code] ??= c;
        return acc;
      }, {})
    );

    // ---------- COUPON WEBSITES (STRICT) ----------

    const couponSites = [];

    (data.organic_results || []).forEach(r => {
      if (
        r.link &&
        /(coupon|promo|deal)/i.test(r.link) &&
        isValidCouponPage(r.link, brand)
      ) {
        couponSites.push({
          name: new URL(r.link).hostname.replace("www.", ""),
          url: r.link
        });
      }
    });

    // Deduplicate sites
    const uniqueSites = Object.values(
      couponSites.reduce((acc, s) => {
        acc[s.url] ??= s;
        return acc;
      }, {})
    );

    // ---------- FINAL SAFETY ----------

    if (uniqueCoupons.length === 0) {
      return res.json({
        coupons: [],
        couponSites: uniqueSites,
        message:
          "Sorry, no reliable public coupon codes were found. However, these websites often list working deals."
      });
    }

    res.json({
      coupons: uniqueCoupons,
      couponSites: uniqueSites
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      coupons: [],
      couponSites: [],
      message: "Server error"
    });
  }
});

// ---------- START ----------

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
