// Bhukkad Shared Navigation Component (Stitch Saffron & Mint Edition)
import { computeBill, getLocation, setLocation } from "./cart-state.js";
import { openVoiceOverlay } from "./voice-modal.js";

const POPULAR_LOCATIONS = [
  { name: "Indiranagar", detail: "100 Feet Rd, 12th Main, HAL 2nd Stage", loc: "Indiranagar, Bengaluru" },
  { name: "Koramangala", detail: "4th Block, 5th Block, Sony World Signal", loc: "Koramangala, Bengaluru" },
  { name: "HSR Layout", detail: "Sector 1, Sector 2, 27th Main", loc: "HSR Layout, Bengaluru" },
  { name: "Whitefield", detail: "ITPL Main Rd, EPIP Zone", loc: "Whitefield, Bengaluru" },
  { name: "Jayanagar", detail: "4th Block, 9th Block, South End Circle", loc: "Jayanagar, Bengaluru" },
  { name: "BTM Layout", detail: "BTM 1st Stage, Madiwala", loc: "BTM Layout, Bengaluru" },
];

function renderLocationModal() {
  if (document.getElementById("bhukkadLocationModal")) return;
  const modal = document.createElement("div");
  modal.id = "bhukkadLocationModal";
  modal.className = "fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 hidden";
  modal.innerHTML = `
    <div class="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/40 shadow-2xl max-w-md w-full animate-[fadeIn_0.2s_ease-out]">
      <div class="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4">
        <h3 class="font-headline-md text-lg font-bold text-on-surface flex items-center gap-2">
          <span class="material-symbols-outlined text-primary text-[22px]" style="font-variation-settings: 'FILL' 1;">location_on</span>
          <span>Select Delivery Location</span>
        </h3>
        <button id="bhukkadCloseLocation" class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="relative mb-4">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">search</span>
        </div>
        <input id="bhukkadCustomLocation" type="text" placeholder="Type your area or society..." class="w-full bg-surface-container-low text-on-surface text-xs rounded-xl pl-9 pr-3 py-3 border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary-container"/>
      </div>
      <p class="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Popular Areas in Bengaluru</p>
      <div class="space-y-2 max-h-[220px] overflow-y-auto pr-1">
        ${POPULAR_LOCATIONS.map(loc => `
          <button class="bhukkad-loc-option w-full text-left p-3 rounded-2xl border border-outline-variant/20 hover:border-primary hover:bg-primary/5 flex items-center justify-between transition-all" data-loc="${loc.loc}">
            <div>
              <div class="font-bold text-xs text-on-surface">${loc.name}</div>
              <div class="text-[11px] text-on-surface-variant">${loc.detail}</div>
            </div>
            <span class="material-symbols-outlined text-primary text-[18px]">check_circle</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const open = () => modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");

  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  modal.querySelector("#bhukkadCloseLocation").addEventListener("click", close);
  modal.querySelectorAll(".bhukkad-loc-option").forEach(btn => {
    btn.addEventListener("click", () => {
      setLocation(btn.getAttribute("data-loc"));
      close();
    });
  });
  const custom = modal.querySelector("#bhukkadCustomLocation");
  custom.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && custom.value.trim()) {
      setLocation(custom.value.trim());
      close();
    }
  });
  return { open, close };
}

export function renderHeader(activeNav = "") {
  const bill = computeBill();
  const count = bill.count;

  const header = document.createElement("header");
  header.className = "fixed top-0 left-0 w-full z-50 bg-surface/90 backdrop-blur-md border-b border-outline-variant/30 shadow-sm transition-all";
  header.innerHTML = `
    <div class="max-w-[1200px] mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between gap-2 sm:gap-4">
      <!-- Brand Logo -->
      <a href="index.html" class="flex items-center gap-2 flex-shrink-0 text-decoration-none group" title="Bhukkad Home">
        <img alt="Bhukkad Logo" class="h-9 w-9 md:h-10 md:w-10 object-contain rounded-md group-hover:scale-105 transition-transform" src="assets/logo.png"/>
        <span class="font-headline-lg text-xl md:text-2xl font-black text-primary tracking-tight">Bhukkad</span>
      </a>

      <!-- Search Bar (Desktop only, untouched) -->
      <div class="hidden md:flex flex-1 max-w-md mx-4 lg:mx-8 relative">
        <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
        </div>
        <input id="globalSearchInput" class="w-full bg-[#F1F1F1] text-on-surface rounded-full py-2 pl-9 sm:pl-11 pr-3 sm:pr-4 focus:outline-none focus:ring-2 focus:ring-primary-container border-none text-xs sm:text-sm transition-all shadow-inner" placeholder="Search biryani, pizza, desserts..." type="text"/>
      </div>

      <!-- Navigation Links -->
      <nav class="hidden lg:flex items-center gap-6 font-label-lg text-sm">
        <a href="index.html" class="${activeNav === 'home' ? 'text-primary font-bold' : 'text-on-surface-variant hover:text-primary'} transition-colors">Home</a>
        <a href="menu.html" class="${activeNav === 'menu' ? 'text-primary font-bold' : 'text-on-surface-variant hover:text-primary'} transition-colors">Menu</a>
        <a href="checkout.html" class="${activeNav === 'checkout' ? 'text-primary font-bold' : 'text-on-surface-variant hover:text-primary'} transition-colors">Track Order</a>
        <a href="../playground/index.html" class="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
          <span>AI Studio</span>
          <span class="material-symbols-outlined text-[16px]">open_in_new</span>
        </a>
      </nav>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Location Selector -->
        <button id="btnNavLocation" class="flex items-center gap-1 sm:gap-1.5 text-on-surface-variant hover:text-primary transition-colors bg-surface-container/70 hover:bg-surface-container px-2 sm:px-3.5 py-1.5 rounded-full border border-outline-variant/30 text-xs font-semibold cursor-pointer">
          <span class="material-symbols-outlined text-primary text-[16px] sm:text-[18px]" style="font-variation-settings: 'FILL' 1;">location_on</span>
          <span id="navLocationLabel" class="max-w-[70px] sm:max-w-[120px] truncate">${getLocation()}</span>
          <span class="material-symbols-outlined text-[14px] sm:text-[16px] text-on-surface-variant">expand_more</span>
        </button>

        <!-- Voice Assistant Button -->
        <button id="btnNavVoice" class="open-voice-assistant flex items-center gap-1.5 sm:gap-2 bg-primary-container text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-label-lg font-bold text-xs shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer">
          <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">mic</span>
          <span class="hidden sm:inline">Voice AI</span>
        </button>

        <!-- Cart Button -->
        <a href="checkout.html" class="relative p-2 sm:p-2.5 bg-surface-container rounded-full text-on-surface hover:bg-surface-variant transition-colors flex items-center justify-center text-decoration-none">
          <span class="material-symbols-outlined text-[20px] sm:text-[22px]">shopping_bag</span>
          <span id="navCartBadge" class="absolute -top-1 -right-1 bg-primary text-white text-[10px] sm:text-[11px] font-bold w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shadow-sm ${count > 0 ? '' : 'hidden'}">
            ${count}
          </span>
        </a>
      </div>
    </div>
  `;

  document.body.prepend(header);

  // Bind Voice Trigger
  header.querySelector("#btnNavVoice").addEventListener("click", () => openVoiceOverlay());

  // Bind Location
  const locModal = renderLocationModal();
  header.querySelector("#btnNavLocation").addEventListener("click", () => locModal.open());
  const syncLoc = () => {
    const lbl = document.getElementById("navLocationLabel");
    if (lbl) lbl.textContent = getLocation();
  };
  window.addEventListener("bhukkad:location-change", syncLoc);

  // Reactive Cart Badge Update
  window.addEventListener("bhukkad:cart-change", (e) => {
    const badge = document.getElementById("navCartBadge");
    if (badge) {
      const c = e.detail.bill.count;
      badge.textContent = c;
      badge.classList.toggle("hidden", c <= 0);
    }
  });

  // Search Redirect (Desktop input)
  const searchInput = header.querySelector("#globalSearchInput");
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        window.location.href = `menu.html?q=${encodeURIComponent(searchInput.value.trim())}`;
      }
    });
  }
}

export function renderBottomNav(activeNav = "") {
  const bill = computeBill();
  const count = bill.count;

  const nav = document.createElement("nav");
  nav.className = "fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 bg-white dark:bg-[#181311] border-t border-outline-variant/30 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.12)] rounded-t-2xl";
  nav.innerHTML = `
    <a href="index.html" class="flex flex-col items-center justify-center ${activeNav === 'home' ? 'text-primary font-bold' : 'text-on-surface-variant'} transition-colors px-3 py-1 text-decoration-none">
      <span class="material-symbols-outlined text-[22px]" ${activeNav === 'home' ? "style=\"font-variation-settings: 'FILL' 1;\"" : ""}>home</span>
      <span class="text-[11px] font-medium">Home</span>
    </a>

    <a href="menu.html" class="flex flex-col items-center justify-center ${activeNav === 'menu' ? 'text-primary font-bold' : 'text-on-surface-variant'} transition-colors px-3 py-1 text-decoration-none">
      <span class="material-symbols-outlined text-[22px]" ${activeNav === 'menu' ? "style=\"font-variation-settings: 'FILL' 1;\"" : ""}>restaurant_menu</span>
      <span class="text-[11px] font-medium">Menu</span>
    </a>

    <!-- Center Voice AI Button (Elevated FAB) -->
    <button class="open-voice-assistant flex flex-col items-center justify-end pb-1.5 relative h-full px-3 bg-transparent border-none cursor-pointer">
      <div class="absolute -top-8 bg-primary-container text-white p-3.5 rounded-full shadow-[0_4px_18px_rgba(238,99,34,0.5)] border-4 border-white dark:border-[#181311] flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
        <span class="material-symbols-outlined text-[26px]" style="font-variation-settings: 'FILL' 1;">mic</span>
      </div>
      <span class="text-[11px] font-bold text-primary tracking-tight">Voice AI</span>
    </button>

    <a href="checkout.html" class="flex flex-col items-center justify-center ${activeNav === 'checkout' ? 'text-primary font-bold' : 'text-on-surface-variant'} transition-colors px-3 py-1 relative">
      <span class="material-symbols-outlined text-[22px]" ${activeNav === 'checkout' ? "style=\"font-variation-settings: 'FILL' 1;\"" : ""}>shopping_bag</span>
      <span class="text-[11px] font-medium">Cart</span>
      <span id="bottomCartBadge" class="absolute top-1 right-2 bg-primary text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${count > 0 ? '' : 'hidden'}">
        ${count}
      </span>
    </a>
  `;

  document.body.append(nav);

  nav.querySelectorAll(".open-voice-assistant").forEach(btn => {
    btn.addEventListener("click", () => openVoiceOverlay());
  });

  window.addEventListener("bhukkad:cart-change", (e) => {
    const badge = document.getElementById("bottomCartBadge");
    if (badge) {
      const c = e.detail.bill.count;
      badge.textContent = c;
      badge.classList.toggle("hidden", c <= 0);
    }
  });
}

export function renderFooter() {
  const footer = document.createElement("footer");
  footer.className = "bg-[#f6f3f2] border-t border-outline-variant/30 py-12 px-4 md:px-8 mt-20 text-on-surface-variant text-sm";
  footer.innerHTML = `
    <div class="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-2xl">🍕</span>
          <span class="font-headline-lg text-xl font-black text-primary">Bhukkad</span>
        </div>
        <p class="text-xs text-on-surface-variant leading-relaxed">
          AI-Powered Voice Food Delivery & Cloud Kitchen Network. Chef-crafted gourmet meals delivered in under 28 minutes.
        </p>
      </div>

      <div>
        <h4 class="font-headline-md text-sm font-bold text-on-surface mb-3">Popular Cuisines</h4>
        <ul class="space-y-2 text-xs">
          <li><a href="menu.html?cat=biryanis-meals" class="hover:text-primary transition-colors">Dum Biryani</a></li>
          <li><a href="menu.html?cat=pizzas-pastas" class="hover:text-primary transition-colors">Gourmet Pizzas</a></li>
          <li><a href="menu.html?cat=burgers-wraps" class="hover:text-primary transition-colors">Crispy Burgers</a></li>
          <li><a href="menu.html?cat=desserts" class="hover:text-primary transition-colors">Molten Desserts</a></li>
        </ul>
      </div>

      <div>
        <h4 class="font-headline-md text-sm font-bold text-on-surface mb-3">Guarantees</h4>
        <ul class="space-y-2 text-xs">
          <li>⏱️ 30-Min Delivery or 100% Free</li>
          <li>🟢 Dedicated Pure-Veg Stations</li>
          <li>🍗 100% Certified Halal Sourcing</li>
          <li>❄️ 100% Cold/Spill Free Replacement</li>
        </ul>
      </div>

      <div>
        <h4 class="font-headline-md text-sm font-bold text-on-surface mb-3">Active Offers</h4>
        <div class="bg-surface p-3 rounded-xl border border-outline-variant/40 space-y-1.5">
          <div class="text-xs font-bold text-primary">🎟️ BHUKKAD50</div>
          <div class="text-[11px] text-on-surface-variant">50% off up to ₹500 on orders above ₹300. Tell Voice Chef to apply!</div>
        </div>
      </div>
    </div>

    <div class="max-w-[1200px] mx-auto pt-6 border-t border-outline-variant/20 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-on-surface-variant/80">
      <span>&copy; 2026 Bhukkad Foods Technologies Inc. All rights reserved.</span>
      <span>Bengaluru, Karnataka, India</span>
    </div>
  `;
  document.body.append(footer);
}
