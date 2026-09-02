// Core: Bhukkad Food Delivery catalog loading, shared layout (nav/footer), icons, and helpers.

const asset = (rel) => new URL(rel, import.meta.url).href;

const NAV_LINKS = [
  { href: "products.html", label: "Menu" },
  { href: "pricing.html", label: "Deals & Combos" },
  { href: "support.html", label: "Delivery & Hygiene" },
  { href: "about.html", label: "Cloud Kitchens" },
  { href: "../playground/index.html", label: "AI Voice Studio" },
];

const ICONS = {
  "pizzas-pastas": '<path d="M12 2L2 19h20L12 2z"/><circle cx="12" cy="11" r="1.5"/><circle cx="8" cy="15" r="1"/><circle cx="15" cy="16" r="1"/>',
  "burgers-wraps": '<rect x="4" y="6" width="16" height="4" rx="2"/><rect x="3" y="14" width="18" height="4" rx="2"/><path d="M4 11h16"/>',
  "biryanis-meals": '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M12 3v4"/><path d="M8 5v2"/><path d="M16 5v2"/>',
  "healthy-salads": '<path d="M12 3a9 9 0 0 0-9 9c0 5 4 9 9 9s9-4 9-9a9 9 0 0 0-9-9z"/><path d="M12 7v10"/><path d="M8 11l4-4 4 4"/>',
  "sides-appetizers": '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8v8"/><path d="M15 8v8"/><path d="M12 8v8"/>',
  desserts: '<path d="M12 4v4"/><path d="M4 10h16v10H4z"/><circle cx="12" cy="2" r="1.5"/>',
  beverages: '<path d="M6 3h12l-2 18H8L6 3z"/><path d="M6 7h12"/><path d="M10 12l2 2 4-4"/>',
  combos: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M10 4v16"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
};

export function icon(name, cls = "") {
  const body = ICONS[name] || ICONS.sparkle;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const catIconName = (id) => (ICONS[id] ? id : "sparkle");

let _catalog = null;

export async function loadCatalog() {
  if (_catalog) return _catalog;
  const url = asset("../data/catalog.json");
  let res;
  try {
    res = await fetch(url, { cache: "no-cache" });
  } catch (networkErr) {
    throw new Error("Could not reach catalog. Serve over HTTP.");
  }
  if (!res.ok) throw new Error(`Failed to load catalog (HTTP ${res.status})`);
  const data = await res.json();
  _catalog = data;
  return data;
}

export const tone = (i) => `tone-${((i % 8) + 8) % 8}`;

export const initials = (name) => name.trim().slice(0, 2).toUpperCase();

export function fromPrice(product) {
  const tiers = product.tiers || [];
  if (!tiers.length) return { label: "₹0", sub: "" };
  const first = tiers[0].priceMonthly || 0;
  return { label: `₹${first.toFixed(2)}`, sub: tiers[0].unit ? `/${tiers[0].unit}` : "" };
}

export const param = (k) => new URLSearchParams(location.search).get(k);

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const brandMark = (size = 34) =>
  `<span style="font-size:${size}px;display:inline-block;line-height:1;margin-right:6px;">🍕</span>`;

export function mountHeader(active = "") {
  const links = NAV_LINKS.map(
    (l) => `<a href="${l.href}" class="${l.label.toLowerCase() === active ? "active" : ""}">${l.label}</a>`
  ).join("");
  const header = el("div", {
    class: "nav",
    html: `<div class="container nav-inner">
      <a href="index.html" class="brand" style="font-weight:700;font-size:1.35rem;">${brandMark(28)} Bhukkad <span style="font-size:0.75rem;background:#ff3366;color:#fff;padding:2px 8px;border-radius:99px;margin-left:6px;font-weight:600;">FOOD EXPRESS</span></a>
      <nav class="nav-links">${links}</nav>
      <div class="nav-cta">
        <a href="products.html" class="btn btn-primary btn-sm">Order Food 🛵</a>
      </div>
    </div>`,
  });
  document.body.prepend(header);

  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

export function mountFooter(catalog) {
  const c = catalog.company;
  const cats = (catalog.categories || [])
    .slice(0, 6)
    .map((cat) => `<li><a href="products.html?cat=${cat.id}">${escapeHtml(cat.name)}</a></li>`)
    .join("");
  const footer = el("footer", {
    class: "footer",
    html: `<div class="container">
      <div class="footer-cols">
        <div>
          <div class="brand" style="font-size:1.25rem;font-weight:700;">${brandMark(26)} ${escapeHtml(c.name)}</div>
          <p class="footer-tag">${escapeHtml(c.tagline || "")}</p>
          <p class="fictitious">AI-Powered Voice Food Delivery & Cloud Kitchen Network.</p>
        </div>
        <div><h4>Cuisines & Menu</h4><ul>${cats}</ul></div>
        <div><h4>Bhukkad</h4><ul>
          <li><a href="about.html">Cloud Kitchens</a></li>
          <li><a href="pricing.html">Deals & Combos</a></li>
          <li><a href="support.html">Delivery & Hygiene Policy</a></li>
        </ul></div>
        <div><h4>Guarantees</h4><ul>
          <li>⏱️ 30-Min Delivery or 100% Free</li>
          <li>🟢 Dedicated Pure-Veg Stations</li>
          <li>🍗 100% Certified Halal Chicken</li>
        </ul></div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${escapeHtml(String(c.founded || "2023"))} ${escapeHtml(c.legalName || c.name)}. Fast & Fresh Food Delivery.</span>
        <span>${escapeHtml(c.hq || "")}</span>
      </div>
    </div>`,
  });
  document.body.append(footer);
}

function observeReveals() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || !els.length) {
    els.forEach((e) => e.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  els.forEach((e) => io.observe(e));
}

export function bootstrap(activeNav, renderFn) {
  loadCatalog()
    .then((catalog) => {
      mountHeader(activeNav);
      import("./cart.js").then((m) => m.mountCart()).catch(() => {});
      renderFn(catalog);
      mountFooter(catalog);
      observeReveals();
    })
    .catch((err) => {
      document.body.innerHTML = `<div class="container" style="padding:40px;color:red;">Failed to initialize Bhukkad: ${escapeHtml(err.message)}</div>`;
    });
}
