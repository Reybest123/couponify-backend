import axios from "axios";

export default async function handler(req, res) {
  // CORS (required for Chrome extensions)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        error: "Missing url parameter"
      });
    }

    const hostname = new URL(url).hostname.replace("www.", "");
    const brand = hostname.split(".")[0];

    // ✅ Trusted coupon aggregators ONLY
    // ❌ No AI = no hallucinations
    const couponSites = [
      {
        name: "RetailMeNot",
        url: `https://www.retailmenot.com/view/${hostname}`
      },
      {
        name: "Coupons.com",
        url: `https://www.coupons.com/coupon-codes/${brand}`
      },
      {
        name: "Groupon",
        url: `https://www.groupon.com/coupons/${brand}`
      },
      {
        name: "Honey",
        url: `https://www.joinhoney.com/shop/${brand}`
      }
    ];

    return res.status(200).json({
      coupons: [], // intentionally empty
      couponSites,
      message:
        "Sorry, no reliable public coupon codes were found. However, these websites often list working deals."
    });

  } catch (error) {
    console.error("Coupon API error:", error);

    return res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
}
