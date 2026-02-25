const TRUSTED_SITES = ["RetailMeNot", "Honey", "Groupon", "Coupons.com"];

function detectRegion(hostname) {
  if (hostname.endsWith(".com.au")) return "AU";
  if (hostname.endsWith(".co.uk")) return "UK";
  if (hostname.endsWith(".ca")) return "CA";
  return "US";
}

function extractBrand(hostname) {
  const raw = hostname.replace(/^www\d*\./, "").split(".")[0];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

async function checkHead(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.status !== 404 && res.status !== 410;
  } catch {
    return true;
  }
}

async function generateUrls({ brand, region }) {
  const brandSlug = brand.toLowerCase();

  // Check Honey and Coupons.com in parallel first
  const [honeyOk, couponsOk] = await Promise.all([
    checkHead(`https://www.joinhoney.com/shop/${brandSlug}`),
    checkHead(`https://www.coupons.com/coupon-codes/${brandSlug}`)
  ]);

  // If neither Honey nor Coupons.com has this brand, return empty
  // This means the banner won't show and no results will be displayed
  if (!honeyOk && !couponsOk) {
    return [];
  }

  // At least one verified result — now build the full list
  const results = [];

  // Always include RetailMeNot and Groupon if we have at least one verified site
  results.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${brandSlug}.com`
  });

  if (honeyOk) {
    results.push({
      name: "Honey",
      url: `https://www.joinhoney.com/shop/${brandSlug}`
    });
  }

  results.push({
    name: "Groupon",
    url: region === "AU"
      ? `https://www.groupon.com.au/vouchers/${brandSlug}`
      : `https://www.groupon.com/coupons/${brandSlug}`
  });

  if (couponsOk) {
    results.push({
      name: "Coupons.com",
      url: `https://www.coupons.com/coupon-codes/${brandSlug}`
    });
  }

  return results.filter(site => TRUSTED_SITES.includes(site.name));
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
    const brand = extractBrand(hostname);
    const region = detectRegion(hostname);

    const generated = await generateUrls({ brand, region });

    return res.status(200).json({
      brand,
      region,
      couponSites: generated
    });

  } catch (err) {
    console.error("Couponify backend error:", err);
    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
