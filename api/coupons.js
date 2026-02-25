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

// For sites that return proper 404s — fast HEAD check
async function checkHead(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.status !== 404 && res.status !== 410;
  } catch {
    return true;
  }
}

// For RetailMeNot — fetch page and check if it redirected back to homepage
async function checkRetailMeNot(url, brandSlug) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    // If we got redirected to the homepage it means brand wasn't found
    const finalUrl = res.url;
    if (
      finalUrl === "https://www.retailmenot.com/" ||
      finalUrl === "https://www.retailmenot.com" ||
      !finalUrl.includes(brandSlug)
    ) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

// For Groupon — fetch page and check if it shows generic deals vs brand page
async function checkGroupon(url, brandSlug) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const finalUrl = res.url;
    // If redirected away from the brand URL it's generic
    if (!finalUrl.includes(brandSlug)) {
      return false;
    }
    // Read a chunk of the page and check for the brand name in the content
    const text = await res.text();
    const lower = text.toLowerCase();
    // If the page mentions the brand slug it's a real brand page
    return lower.includes(brandSlug.toLowerCase());
  } catch {
    return true;
  }
}

async function generateUrls({ hostname, brand, region }) {
  const brandSlug = brand.toLowerCase();
  const candidates = [];

  candidates.push({
    name: "RetailMeNot",
    url: `https://www.retailmenot.com/view/${brandSlug}.com`,
    check: () => checkRetailMeNot(
      `https://www.retailmenot.com/view/${brandSlug}.com`,
      brandSlug
    )
  });

  candidates.push({
    name: "Honey",
    url: `https://www.joinhoney.com/shop/${brandSlug}`,
    check: () => checkHead(`https://www.joinhoney.com/shop/${brandSlug}`)
  });

  if (region === "AU") {
    candidates.push({
      name: "Groupon",
      url: `https://www.groupon.com.au/vouchers/${brandSlug}`,
      check: () => checkGroupon(
        `https://www.groupon.com.au/vouchers/${brandSlug}`,
        brandSlug
      )
    });
  } else {
    candidates.push({
      name: "Groupon",
      url: `https://www.groupon.com/coupons/${brandSlug}`,
      check: () => checkGroupon(
        `https://www.groupon.com/coupons/${brandSlug}`,
        brandSlug
      )
    });
  }

  candidates.push({
    name: "Coupons.com",
    url: `https://www.coupons.com/coupon-codes/${brandSlug}`,
    check: () => checkHead(`https://www.coupons.com/coupon-codes/${brandSlug}`)
  });

  const filtered = candidates.filter(site => TRUSTED_SITES.includes(site.name));

  // Run all checks in parallel
  const results = await Promise.all(
    filtered.map(async (site) => {
      const ok = await site.check();
      return ok ? { name: site.name, url: site.url } : null;
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
