import axios from "axios";

const TRUSTED_SITES = ["RetailMeNot", "Honey", "Groupon", "Coupons.com"];

/**
 * Detect region from store domain
 */
function detectRegion(hostname) {
  if (hostname.endsWith(".com.au")) return "AU";
  if (hostname.endsWith(".co.uk")) return "UK";
  if (hostname.endsWith(".ca")) return "CA";
  return "US";
}

/**
 * Extract brand slug from hostname
 * nike.com.au -> nike
 * adidas.co.uk -> adidas
 */
function extractBrand(hostname) {
  return hostname.replace(/^www\./, "").split(".")[0];
}

/**
 * Generate structured coupon URLs per region
 */
function generateUrls({ hostname, brand, region }) {
  const urls = [];

  // ---- RetailMeNot (uses full domain) ----
  urls.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${hostname}`
  });

  // ---- Honey (brand slug only, global) ----
  urls.push({
    name: "Honey",
    url: `https://www.joinhoney.com/shop/${brand}`
  });

  // ---- Groupon (region-specific quirks) ----
  if (region === "AU") {
    urls.push({
      name: "Groupon",
      url: `https://www.groupon.com.au/vouchers/${brand}`
    });
    urls.push({
      name: "Groupon",
      url: `https://www.groupon.com.au/vouchers/${brand}-au`
    });
  } else {
    urls.push({
      name: "Groupon",
      url: `https://www.groupon.com/coupons/${brand}`
    });
  }

  // ---- Coupons.com (brand slug only) ----
  urls.push({
    name: "Coupons.com",
    url: `https://www.coupons.com/coupon-codes/${brand}`
  });

  return urls;
}

/**
 * Validate URL with lightweight request
 */
async function isValidUrl(url) {
  try {
    const res = await axios.get(url, {
      maxRedirects: 5,
      timeout: 6000,
      validateStatus: status => status >= 200 && status < 400
    });

    // Reject homepage redirects or obvious failures
    if (!res.request?.res?.responseUrl) return false;

    const finalUrl = res.request.res.responseUrl.toLowerCase();
    if (
      finalUrl === "https://www.groupon.com.au/" ||
      finalUrl === "https://www.groupon.com/" ||
      finalUrl === "https://www.coupons.com/"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
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

    const validated = [];
    for (const site of generated) {
      if (!TRUSTED_SITES.includes(site.name)) continue;
      if (await isValidUrl(site.url)) {
        validated.push(site);
      }
    }

    return res.status(200).json({
      brand,
      region,
      couponSites: validated
    });
  } catch (err) {
    console.error("Couponify backend error:", err);
    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
