const TRUSTED_SITES = ["RetailMeNot", "Honey", "Groupon", "Coupons.com"];

function detectRegion(hostname) {
  if (hostname.endsWith(".com.au")) return "AU";
  if (hostname.endsWith(".co.uk")) return "UK";
  if (hostname.endsWith(".ca")) return "CA";
  return "US";
}

function extractBrand(hostname) {
  return hostname.replace(/^www\./, "").split(".")[0];
}

function generateUrls({ hostname, brand, region }) {
  const urls = [];

  urls.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${hostname}`
  });

  urls.push({
    name: "Honey",
    url: `https://www.joinhoney.com/shop/${brand}`
  });

  if (region === "AU") {
    urls.push({
      name: "Groupon",
      url: `https://www.groupon.com.au/vouchers/${brand}`
    });
  } else {
    urls.push({
      name: "Groupon",
      url: `https://www.groupon.com/coupons/${brand}`
    });
  }

  urls.push({
    name: "Coupons.com",
    url: `https://www.coupons.com/coupon-codes/${brand}`
  });

  return urls.filter(site => TRUSTED_SITES.includes(site.name));
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
    const hostname = parsed.hostname.replace(/^www\./, "");
    const brand = extractBrand(hostname);
    const region = detectRegion(hostname);

    const generated = generateUrls({ hostname, brand, region });

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
