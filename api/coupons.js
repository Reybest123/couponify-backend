const axios = require("axios");

module.exports = async function (req, res) {
  try {
    // ---- CORS (Chrome extension safe) ----
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const pageUrl = req.query.url;
    if (!pageUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    // ---- URL PARSING ----
    const parsed = new URL(pageUrl);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    const brand = parts.length >= 3 ? parts[parts.length - 2] : parts[0];

    // ---- BASELINE (ALWAYS SAFE) ----
    const baselineSites = [
      {
        name: "RetailMeNot",
        url: `https://www.retailmenot.com/view/${hostname}`,
        confidence: "high",
        source: "baseline"
      },
      {
        name: "Honey",
        url: `https://www.joinhoney.com/shop/${brand}`,
        confidence: "medium",
        source: "baseline"
      },
      {
        name: "Groupon",
        url: `https://www.groupon.com/coupons/${brand}`,
        confidence: "medium",
        source: "baseline"
      }
    ];

    // ---- BLOCK SERPAPI FOR BAD BRANDS (SAVE MONEY) ----
    const blockedBrands = [
      "amazon",
      "apple",
      "steam",
      "google",
      "playstation",
      "xbox"
    ];

    const serpapiEnabled =
      process.env.SERPAPI_KEY &&
      !blockedBrands.includes(brand.toLowerCase());

    // ---- TRUSTED DOMAIN WHITELIST + RANKING ----
    const trustedDomains = {
      "retailmenot.com": 100,
      "offers.com": 90,
      "dealspotr.com": 85,
      "couponbirds.com": 80,
      "couponfollow.com": 75
    };

    let serpapiSites = [];

    // ---- SERPAPI ENHANCEMENT (CONDITIONAL) ----
    if (serpapiEnabled) {
      const serpResponse = await axios.get(
        "https://serpapi.com/search.json",
        {
          params: {
            engine: "google",
            q: `${brand} coupon codes`,
            api_key: process.env.SERPAPI_KEY,
            num: 10
          },
          timeout: 4000
        }
      );

      const results = serpResponse.data.organic_results || [];

      serpapiSites = results
        .map(r => {
          try {
            const u = new URL(r.link);
            const domain = u.hostname.replace(/^www\./, "");

            if (!trustedDomains[domain]) return null;

            return {
              name: domain.replace(".com", ""),
              url: r.link,
              confidence: trustedDomains[domain] >= 90 ? "high" : "medium",
              source: "search",
              rank: trustedDomains[domain]
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 3);
    }

    // ---- A/B LOGIC: BASELINE vs SEARCH-ENHANCED ----
    const finalSites =
      serpapiSites.length > 0
        ? [...baselineSites, ...serpapiSites]
        : baselineSites;

    return res.status(200).json({
      coupons: [], // Couponify does NOT auto-reveal codes
      brand,
      hostname,
      serpapiUsed: Boolean(serpapiSites.length),
      couponSites: finalSites,
      message:
        "Couponify searches trusted sources for coupon pages. Deals are revealed directly on partner websites."
    });

  } catch (err) {
    console.error("Couponify API error:", err.message);
    return res.status(500).json({
      error: "Internal server error"
    });
  }
};
