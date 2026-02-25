const TRUSTED_SITES = ["RetailMeNot", "Honey", "Groupon", "Coupons.com"];

function detectRegion(hostname) {
  if (hostname.endsWith(".com.au")) return "AU";
  if (hostname.endsWith(".co.uk")) return "UK";
  if (hostname.endsWith(".ca")) return "CA";
  return "US";
}

function extractBrand(hostname) {
  // Strip www followed by any numbers (e.g. www2, www3) as well as plain www
  const raw = hostname.replace(/^www\d*\./, "").split(".")[0];
  // Capitalize first letter
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    // Some coupon sites return 200 even for missing brands, but return 404 for truly bad URLs
    return res.ok;
  } catch {
    // If fetch fails entirely (network error etc), include it anyway
    return true;
  }
}

async function generateUrls({ hostname, brand, region }) {
  const brandSlug = brand.toLowerCase();
  const candidates = [];

  candidates.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${brandSlug}.com`
  });

  candidates.push({
    name: "Honey",
    url: `https://www.joinhoney.com/shop/${brandSlug}`
  });

  if (region === "AU") {
    candidates.push({
      name: "Groupon",
      url: `https://www.groupon.com.au/coupons/${brandSlug}`
    });
  } else {
    candidates.push({
      name: "Groupon",
      url: `https://www.groupon.com/coupons/${brandSlug}`
    });
  }

  candidates.push({
    name: "Coupons.com",
    url: `https://www.coupons.com/coupon-codes/${brandSlug}`
  });

  const filtered = candidates.filter(site => TRUSTED_SITES.includes(site.name));

  // Check all URLs in parallel — as fast as the slowest single request
  const results = await Promise.all(
    filtered.map(async (site) => {
      const ok = await checkUrl(site.url);
      return ok ? site : null;
    })
  );

  return results.filter(Boolean);
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

    const generated = await generateUrls({ hostname, brand, region });

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
