// Bhukkad Food Delivery - Page renderers.
import { el, tone, fromPrice, param, escapeHtml, icon, catIconName } from "./app.js";

const app = () => document.querySelector("#app");

function addToCartUI(productName, tier) {
  import("./cart.js").then((m) => m.addToCart(productName, tier || null, 1)).catch((e) => console.error(e));
}

function catTone(catalog, categoryId) {
  const idx = (catalog.categories || []).findIndex((c) => c.id === categoryId);
  return tone(idx < 0 ? 0 : idx);
}

function productCard(p, toneClass) {
  const price = fromPrice(p);
  const dietBadge = p.is_veg
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:#16a34a;font-weight:700;background:rgba(22,163,74,0.1);padding:2px 8px;border-radius:99px;border:1px solid rgba(22,163,74,0.3);">🟢 VEG</span>`
    : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;color:#e11d48;font-weight:700;background:rgba(225,29,72,0.1);padding:2px 8px;border-radius:99px;border:1px solid rgba(225,29,72,0.3);">🔴 NON-VEG</span>`;

  return el("div", { class: "card product-card reveal", style: "display:flex;flex-direction:column;justify-content:space-between;" }, [
    el("div", {}, [
      el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;" }, [
        el("div", { class: "pc-cat" }, p.category),
        el("div", { html: dietBadge }),
      ]),
      el("h3", { style: "margin:0 0 6px;font-size:1.15rem;" }, p.name),
      el("div", { style: "font-size:0.8rem;color:#d97706;font-weight:600;margin-bottom:6px;" }, `⭐ ${p.rating || 4.8} / 5.0  •  ⏱️ ${p.prepTimeMins || 20} mins  •  🔥 ${p.calories || '600 kcal'}`),
      el("div", { class: "pc-sum", style: "font-size:0.88rem;color:#64748b;line-height:1.45;margin-bottom:16px;" }, p.description),
    ]),
    el("div", { class: "pc-foot", style: "display:flex;justify-content:space-between;align-items:center;border-top:1px solid #eef2f6;padding-top:12px;" }, [
      el("span", { class: "pc-price", html: `${price.label} <small style="font-size:0.75rem;color:#94a3b8;">${price.sub}</small>` }),
      el("button", {
        class: "btn btn-primary btn-sm",
        onclick: (e) => {
          e.preventDefault();
          addToCartUI(p.name);
        },
      }, "Add to Cart 🛒"),
    ]),
  ]);
}

// ---------------- Home ----------------
export function renderHome(catalog) {
  const c = catalog.company;
  const cats = catalog.categories || [];
  const prods = catalog.products || [];

  const tiles = cats
    .slice(0, 6)
    .map(
      (cat, i) =>
        `<div class="app-tile" style="padding:14px;background:#fff;border-radius:14px;border:1px solid #e6e8ee;display:flex;align-items:center;gap:10px;box-shadow:0 2px 6px rgba(0,0,0,0.04);"><span class="ic ${tone(i)}" style="font-size:22px;">🍕</span><b>${escapeHtml(
          cat.name
        )}</b></div>`
    )
    .join("");

  app().append(
    el("section", {
      class: "hero",
      html: `<div class="container">
        <div class="hero-grid">
          <div>
            <span class="pill pill-brand" style="background:#ff3366;color:#fff;border:none;">🔥 30-Min Express Food Delivery</span>
            <h1 style="font-size:2.8rem;line-height:1.15;margin:16px 0 12px;">Hungry? Feed the <span class="grad-text" style="background:linear-gradient(135deg,#ff3366,#ff8800);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Bhukkad in You!</span></h1>
            <p class="lead" style="font-size:1.1rem;color:#475569;margin-bottom:24px;">${escapeHtml(
              c.about ||
                "Bhukkad brings chef-crafted pizzas, dum biryanis, crispy burgers, and gourmet desserts straight to your doorstep with average delivery under 28 minutes."
            )}</p>
            <div class="hero-actions" style="display:flex;gap:12px;margin-bottom:28px;">
              <a href="products.html" class="btn btn-primary" style="background:linear-gradient(135deg,#ff3366,#ff8800);border:none;padding:12px 24px;">Explore Food Menu 🍕</a>
              <a href="pricing.html" class="btn btn-ghost" style="padding:12px 20px;">Deals & Combos 🍱</a>
            </div>
            <div class="hero-trust" style="font-size:0.9rem;color:#64748b;"><span class="pill" style="background:#16a34a;color:#fff;padding:3px 10px;border-radius:99px;font-weight:600;">⏱️ 28 Mins Avg</span> Trusted by 500,000+ happy foodies</div>
          </div>
          <div class="hero-visual">
            <div class="hero-panel" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:20px;padding:20px;box-shadow:0 12px 30px rgba(0,0,0,0.06);">
              <div style="font-weight:700;font-size:1.1rem;margin-bottom:14px;color:#0f172a;">🔥 Top Cuisines on Bhukkad</div>
              <div class="app-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${tiles}</div>
            </div>
          </div>
        </div>
      </div>`,
    })
  );

  // Active Deals Banner
  app().append(
    el("div", {
      class: "container",
      style: "margin:30px auto;",
      html: `<div style="background:linear-gradient(135deg,#ff3366 0%,#ff8800 100%);color:#fff;padding:24px 30px;border-radius:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;box-shadow:0 10px 25px rgba(255,51,102,0.3);">
        <div>
          <h2 style="color:#fff;margin:0 0 6px;font-size:1.5rem;">🎉 Get 50% OFF up to ₹500 with Coupon BHUKKAD50!</h2>
          <p style="margin:0;opacity:0.9;font-size:0.95rem;">Tell the AI Voice Chef: <i>"Add Farmhouse Pizza and apply coupon BHUKKAD50"</i></p>
        </div>
        <a href="products.html" class="btn" style="background:#fff;color:#ff3366;font-weight:700;border-radius:99px;padding:10px 24px;">Order Now 🛵</a>
      </div>`,
    })
  );

  // Bestseller Food Grid
  const bento = el("div", { class: "container", style: "margin:40px auto;" });
  bento.append(
    el("div", { style: "display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;" }, [
      el("div", {}, [
        el("h2", { style: "font-size:2rem;margin:0 0 6px;" }, "Chef's Bestsellers 🔥"),
        el("p", { style: "color:#64748b;margin:0;" }, "Our most loved dishes, prepared fresh to order"),
      ]),
      el("a", { href: "products.html", class: "btn btn-ghost btn-sm" }, "View Full Menu ➔"),
    ])
  );

  const grid = el("div", { class: "grid-3", style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:24px;" });
  prods.slice(0, 6).forEach((p, i) => {
    grid.append(productCard(p, catTone(catalog, p.categoryId)));
  });
  bento.append(grid);
  app().append(bento);
}

// ---------------- Menu Page ----------------
export function renderProducts(catalog) {
  const cats = catalog.categories || [];
  const prods = catalog.products || [];
  const activeCat = param("cat") || "all";

  const catBtns = [
    `<a href="products.html" class="tab-pill ${activeCat === "all" ? "active" : ""}">All Dishes (${prods.length})</a>`,
    ...cats.map(
      (c) =>
        `<a href="products.html?cat=${c.id}" class="tab-pill ${activeCat === c.id ? "active" : ""}">${escapeHtml(
          c.name
        )}</a>`
    ),
  ].join("");

  const filtered = activeCat === "all" ? prods : prods.filter((p) => p.categoryId === activeCat);

  const container = el("div", { class: "container", style: "padding:40px 24px;" });
  container.append(
    el("div", { style: "margin-bottom:28px;" }, [
      el("h1", { style: "font-size:2.4rem;margin:0 0 8px;" }, "Bhukkad Food Menu 🍽️"),
      el("p", { style: "color:#64748b;font-size:1.05rem;" }, "Handcrafted gourmet meals, fresh ingredients, delivered in under 30 minutes."),
      el("div", { class: "tab-pills", style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;" }, catBtns),
    ])
  );

  const grid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:24px;" });
  filtered.forEach((p) => {
    grid.append(productCard(p, catTone(catalog, p.categoryId)));
  });
  container.append(grid);
  app().append(container);
}

// ---------------- Deals & Combos Page ----------------
export function renderPricing(catalog) {
  const combos = (catalog.products || []).filter((p) => p.categoryId === "combos");
  const coupons = catalog.policies?.coupons || [];

  const container = el("div", { class: "container", style: "padding:40px 24px;" });
  container.append(
    el("div", { style: "text-align:center;max-width:700px;margin:0 auto 40px;" }, [
      el("span", { class: "pill pill-brand" }, "Value Deals & Offers"),
      el("h1", { style: "font-size:2.5rem;margin:12px 0;" }, "Feast More, Spend Less 🍱"),
      el("p", { style: "color:#64748b;font-size:1.1rem;" }, "Curated meal combos with up to 30% savings and active promo coupons."),
    ])
  );

  // Active Promo Cards
  const couponRow = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:40px;" });
  coupons.forEach((c) => {
    couponRow.append(
      el("div", { style: "background:#fff;border:2px dashed #ff3366;border-radius:16px;padding:20px;box-shadow:0 4px 12px rgba(0,0,0,0.05);" }, [
        el("div", { style: "font-weight:700;font-size:1.2rem;color:#ff3366;margin-bottom:6px;" }, `🎟️ ${c.code}`),
        el("p", { style: "font-size:0.92rem;color:#475569;margin:0 0 10px;" }, c.description),
        el("small", { style: "color:#94a3b8;" }, `Min order: ₹${c.minOrder || 0}`),
      ])
    );
  });
  container.append(couponRow);

  // Combos Grid
  const comboGrid = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:24px;" });
  combos.forEach((p) => {
    comboGrid.append(productCard(p, "tone-1"));
  });
  container.append(comboGrid);

  app().append(container);
}

// ---------------- Delivery & Hygiene Policy Page ----------------
export function renderSupport(catalog) {
  const policies = catalog.policies || {};
  const del = policies.delivery || {};
  const ref = policies.refunds || {};
  const diet = policies.dietary || {};

  const container = el("div", { class: "container", style: "padding:40px 24px;" });
  container.append(
    el("div", { style: "max-width:800px;margin:0 auto;" }, [
      el("h1", { style: "font-size:2.4rem;margin-bottom:12px;" }, "Delivery & Food Safety Guarantee 🛡️"),
      el("p", { style: "color:#64748b;font-size:1.1rem;margin-bottom:32px;" }, "At Bhukkad, we uphold the highest hygiene, speed, and packaging standards in cloud kitchen gastronomy."),

      el("div", { style: "display:flex;flex-direction:column;gap:24px;" }, [
        el("div", { class: "card", style: "padding:24px;" }, [
          el("h3", { style: "color:#ff3366;margin:0 0 10px;" }, "⏱️ 30-Minute Express Guarantee"),
          el("p", { style: "color:#475569;margin:0;" }, del.expressGuarantee || "If your order takes longer than 40 minutes, you get 100% refund credit in your wallet."),
        ]),
        el("div", { class: "card", style: "padding:24px;" }, [
          el("h3", { style: "color:#16a34a;margin:0 0 10px;" }, "🟢 Pure-Veg Preparation Segregation"),
          el("p", { style: "color:#475569;margin:0;" }, diet.pureVegKitchens || "Dedicated separate preparation areas and cookware for 100% vegetarian dishes."),
        ]),
        el("div", { class: "card", style: "padding:24px;" }, [
          el("h3", { style: "color:#0284c7;margin:0 0 10px;" }, "❄️ 100% Cold/Spill Refund Policy"),
          el("p", { style: "color:#475569;margin:0;" }, ref.coldFood || "100% instant refund or free replacement if food arrives cold or damaged."),
        ]),
      ]),
    ])
  );
  app().append(container);
}

// ---------------- About / Cloud Kitchens Page ----------------
export function renderAbout(catalog) {
  const c = catalog.company;
  const container = el("div", { class: "container", style: "padding:40px 24px;" });
  container.append(
    el("div", { style: "max-width:800px;margin:0 auto;" }, [
      el("h1", { style: "font-size:2.4rem;margin-bottom:12px;" }, "About Bhukkad Kitchens 👨‍🍳"),
      el("p", { style: "color:#64748b;font-size:1.1rem;margin-bottom:24px;" }, c.about),
      el("h3", { style: "margin:24px 0 10px;" }, "Our Mission"),
      el("p", { style: "color:#475569;line-height:1.6;" }, c.mission),
    ])
  );
  app().append(container);
}
