module.exports = function (req, res) {
  try {
    // CORS for Chrome extensions
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const parsed = new URL(url);
    const hostname = parsed.hostname.replace("www.", "");
    const brand = hostname.split(".")[0];

    const couponSites = [
      {
        name: "RetailMeNot",
        url: `https://www.retailmenot.com/view/${hostname}`
      },
      {
        name: "Coupons.com",
        url: `https://www.coupons.com/coupon-codes/${brand}`
      },
    ];

    return res.status(200).json({
      coupons: [],
      couponSites,
      message:
        "Sorry, no reliable public coupon codes were found. However, these websites often list working deals."
    });

  } catch (err) {
    console.error("Coupon API crash:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message
    });
  }
};

