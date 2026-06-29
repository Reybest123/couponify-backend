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
    return false;
  }
}

async function generateUrls({ brand, region }) {
  const brandSlug = brand.toLowerCase();

  const [honeyOk, couponsOk] = await Promise.all([
    checkHead(`https://www.joinhoney.com/shop/${brandSlug}`),
    checkHead(`https://www.coupons.com/coupon-codes/${brandSlug}`)
  ]);

  if (!honeyOk && !couponsOk) {
    return [];
  }

  const storeDomain = region === "AU" ? `${brandSlug}.com.au`
    : region === "UK" ? `${brandSlug}.co.uk`
    : region === "CA" ? `${brandSlug}.ca`
    : `${brandSlug}.com`;

  const results = [];

  results.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${storeDomain}`,
    verified: false
  });

  if (honeyOk) {
    results.push({
      name: "Honey",
      url: `https://www.joinhoney.com/shop/${brandSlug}`,
      verified: true
    });
  }

  results.push({
    name: "Groupon",
    url: region === "AU"
      ? `https://www.groupon.com.au/vouchers/${brandSlug}`
      : `https://www.groupon.com/coupons/${brandSlug}`,
    verified: false
  });

  if (couponsOk) {
    results.push({
      name: "Coupons.com",
      url: `https://www.coupons.com/coupon-codes/${brandSlug}`,
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
