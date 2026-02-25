const TRUSTED_SITES = ["RetailMeNot", "Honey", "Groupon", "Coupons.com"];

// Sites that return proper 404s for unknown brands — safe to check
const CHECKABLE_SITES = ["Honey", "Coupons.com"];

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

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow"
    });
    if (res.status === 404 || res.status === 410) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function generateUrls({ hostname, brand, region }) {
  const brandSlug = brand.toLowerCase();
  const candidates = [];

  // RetailMeNot — always include, never 404s properly
  candidates.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${brandSlug}.com`,
    alwaysInclude: true
  });

  // Honey — returns proper 404s, safe to check
  candidates.push({
    name: "Honey",
    url: `https://www.joinhoney.com/shop/${brandSlug}`,
    alwaysInclude: false
  });

  // Groupon — always include, never 404s properly, fixed AU path to /vouchers/
  if (region === "AU") {
    candidates.push({
      name: "Groupon",
      url: `https://www.groupon.com.au/vouchers/${brandSlug}`,
      alwaysInclude: true
    });
  } else {
    candidates.push({
      name: "Groupon",
      url: `https://www.groupon.com/coupons/${brandSlug}`,
      alwaysInclude: true
    });
  }

  // Coupons.com — returns proper 404s, safe to check
  candidates.push({
    name: "Coupons.com",
    url: `https://www.coupons.com/coupon-codes/${brandSlug}`,
    alwaysInclude: false
  });

  const filtered = candidates.filter(site => TRUSTED_SITES.includes(site.name));

  // Only run 404 checks on sites that actually return proper 404s
  const results = await Promise.all(
    filtered.map(async (site) => {
      if (site.alwaysInclude) return site;
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
