const SHOPPING_KEYWORDS = [
  "cart", "checkout", "shop", "store", "buy", "product", "order",
  "basket", "shipping", "add to cart", "wishlist", "payment",
  "price", "discount", "sale", "delivery", "purchase", "returns"
];

const COUPON_SITE_DOMAINS = [
  "retailmenot.com", "joinhoney.com", "groupon.com", "coupons.com",
  "groupon.com.au"
];

const IGNORED_DOMAINS = [
  "google.com", "youtube.com", "facebook.com", "twitter.com",
  "instagram.com", "reddit.com", "wikipedia.org", "github.com",
  "gmail.com", "mail.google.com", "linkedin.com", "tiktok.com",
  "twitch.tv", "discord.com", "slack.com", "netflix.com", "spotify.com",
  "couponify-backend.vercel.app"
];

function isShoppingSite() {
  const hostname = window.location.hostname.replace(/^www\d*\./, "");

  if (COUPON_SITE_DOMAINS.some(d => hostname.includes(d))) return false;
  if (IGNORED_DOMAINS.some(d => hostname.includes(d))) return false;

  const bodyText = document.body.innerText.toLowerCase();
  const metaDesc = document.querySelector('meta[name="description"]')?.content?.toLowerCase() || "";
  const titleText = document.title.toLowerCase();
  const combined = bodyText.slice(0, 5000) + metaDesc + titleText;

  const matchCount = SHOPPING_KEYWORDS.filter(kw => combined.includes(kw)).length;
  return matchCount >= 5;
}

function createBanner() {
  // Remove any existing banner first
  const existing = document.getElementById("couponify-host");
  if (existing) existing.remove();

  const host = document.createElement("div");
  host.id = "couponify-host";

  // Apply positioning directly to the host element
  Object.assign(host.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "2147483647",
    display: "block",
    width: "auto",
    height: "auto",
    border: "none",
    background: "none",
    padding: "0",
    margin: "0"
  });

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }

      #banner {
        display: flex;
        align-items: center;
        gap: 10px;
        background: linear-gradient(135deg, #5f2cff, #4a90e2);
        color: white;
        padding: 12px 16px;
        border-radius: 14px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        max-width: 360px;
        animation: slide-in 0.4s ease forwards;
        font-family: Inter, Arial, sans-serif;
      }

      #icon { font-size: 20px; flex-shrink: 0; }

      #text {
        font-size: 13px;
        font-weight: 500;
        flex: 1;
        color: white;
      }

      #find-btn {
        background: white;
        color: #5f2cff;
        border: none;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        font-family: Inter, Arial, sans-serif;
        display: block;
        outline: none;
      }

      #find-btn:hover { background: #f0f0f0; }

      #close-btn {
        all: unset;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        color: white;
        font-size: 16px;
        cursor: pointer;
        flex-shrink: 0;
        opacity: 0.8;
        border-radius: 4px;
        user-select: none;
      }

      #close-btn:hover { opacity: 1; background: rgba(255,255,255,0.15); }

      @keyframes slide-in {
        from { opacity: 0; transform: translateY(20px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    </style>

    <div id="banner">
      <span id="icon">🏷️</span>
      <span id="text">Couponify found coupon sites for this store!</span>
      <button id="find-btn">Find Coupons</button>
      <div id="close-btn" role="button" tabindex="0">✕</div>
    </div>
  `;

  document.body.appendChild(host);

  const closeBtn = shadow.getElementById("close-btn");
  const findBtn = shadow.getElementById("find-btn");

  // Use pointerdown with capture:true — fires before the page can intercept anything
  closeBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    host.remove();
  }, { capture: true });

  // Also handle keyboard close for accessibility
  closeBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      host.remove();
    }
  });

  findBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    chrome.runtime.sendMessage({
      type: "OPEN_RESULTS",
      encodedUrl: encodeURIComponent(window.location.href)
    });
    host.remove();
  }, { capture: true });
}

async function checkForCouponsAndShowBanner() {
  if (sessionStorage.getItem("couponify_banner_shown")) return;

  try {
    const response = await fetch(
      `https://couponify-backend.vercel.app/api/coupons?url=${encodeURIComponent(window.location.href)}`
    );
    const data = await response.json();
    const sites = data.couponSites || [];

    // Only show banner if we actually got valid coupon sites back
    if (sites.length === 0) return;

    sessionStorage.setItem("couponify_banner_shown", "true");
    createBanner();

  } catch (err) {
    // If backend is unreachable, silently do nothing
    console.error("Couponify: could not check for coupons", err);
  }
}

window.addEventListener("load", () => {
  setTimeout(() => {
    if (isShoppingSite()) {
      checkForCouponsAndShowBanner();
    }
  }, 3000);
});
