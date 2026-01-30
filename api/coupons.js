import fetch from "node-fetch";

const SERPAPI_KEY = process.env.SERPAPI_KEY;

// ---------- HELPERS ----------

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getBrand(domain) {
  return domain ? domain.split(".")[0] : null;
}

function isProductPage(url) {
  return /(product|products|item|sku|\/p\/|\/dp\/)/i.test(url);
}

function extractRealCouponCodes(text) {
  if (!/(code|promo)/i.test(text)) return [];

  const blacklist = [
    "SAVE", "DISCOUNT", "WELCOME", "ORDER",
    "ONLINE", "SHOP", "SALE", "OFFER"
  ];

  const matches = text.match(/\b[A-Z0-9]{6,12}\b/g) || [];

  return matches.filter(code =>
    !blacklist.some(b => code.includes(b))
  );
}

function confidenceFromText(text) {
  if (/verified|official|working/i.test(text)) return "High";
  if (/reported|may work/i.test(text)) return "Medium";
  return "Low";
}

// ---------- COUPON SITES ----------

const COUPON_SITES = [
  { name: "RetailMeNot", domain: "retailmenot.com" },
  { name: "Coupons.com", domain: "coupons.com" },
  { name: "Groupon", domain: "groupon.com" },
  { name: "Honey", domain: "joinhoney.com" }
];

async function findCouponSitePage(site, brand) {
  const query = `${brand} site:${site.domain} coupon`;

  const res = await fetch(
    `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${SERPAPI_KEY}`
  );

  const data = await res.json();

  const result = (data.organic_results || []).find(r => {
    if (!r.link || !r.link.includes(site.domain)) return false;

    let path;
    try {
      path = new URL(r.link).pathname;
    } catch {
      return false;
    }

    if (path === "/" || path.length < 3) return false;

    if (site.domain === "coupons.com") {
      if (!path.startsWith("/coupon-codes/")) return false;
      const slug = path.split("/coupon-codes/")[1];
      if (!slug || slug.includes(".")) return false;
    }

    return true;
  });

  return result ? { name: site.name, url: result.link } : null;
}

// ---------- MAIN HANDLER ----------

export default async function handler(req, res) {
  try {
    const pageUrl = req.query.url;
    const forceSearch = req.query.search === "true";

    if (!pageUrl || !forceSearch) {
      return res.status(200).json({
        coupons: [],
        couponSites: [],
        disclaimer:
          "We do our best to find real coupon information, but results may occasionally be incomplete."
      });
    }

    const domain = getDomain(pageUrl);
    const brand = getBrand(domain);
    const productMode = isProductPage(pageUrl);

    const query = productMode
      ? `"${domain}" product coupon code`
      : `"${domain}" promo code`;

    const serpRes = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${SERPAPI_KEY}`
    );

    const data = await serpRes.json();

    const snippets = (data.organic_results || [])
      .map(r => r.snippet)
      .filter(Boolean);

    const coupons = [];

    snippets.forEach(text => {
      extractRealCouponCodes(text).forEach(code => {
        coupons.push({
          code,
          description: text.slice(0, 100),
          confidence: confidenceFromText(text)
        });
      });
    });

    const uniqueCoupons = Object.values(
      coupons.reduce((a, c) => {
        a[c.code] ??= c;
        return a;
      }, {})
    );

    const sites = (
      await Promise.all(
        COUPON_SITES.map(site => findCouponSitePage(site, brand))
      )
    ).filter(Boolean);

    if (uniqueCoupons.length === 0) {
      return res.status(200).json({
        coupons: [],
        couponSites: sites,
        message:
          "Sorry, no reliable public coupon codes were found. However, these websites often list working deals."
      });
    }

    res.status(200).json({
      coupons: uniqueCoupons,
      couponSites: sites
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
