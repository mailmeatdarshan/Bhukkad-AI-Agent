// Bhukkad Reactive Cart & State Store
// Synchronizes cart state across pages, UI buttons, and Voice AI assistant tool calls.

const CART_KEY = "bhukkad_cart";
const COUPON_KEY = "bhukkad_coupon";
const ORDER_KEY = "bhukkad_last_order";
const LOCATION_KEY = "bhukkad_location";
const DEFAULT_LOCATION = "Indiranagar, Bengaluru";

export function getLocation() {
  return localStorage.getItem(LOCATION_KEY) || DEFAULT_LOCATION;
}

export function setLocation(loc) {
  if (loc) {
    localStorage.setItem(LOCATION_KEY, loc);
  }
  window.dispatchEvent(new CustomEvent("bhukkad:location-change", { detail: { location: getLocation() } }));
}

export function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("bhukkad:cart-change", { detail: { items, bill: computeBill(items) } }));
}

export function getCoupon() {
  return localStorage.getItem(COUPON_KEY) || "";
}

export function setCoupon(code) {
  if (code) {
    localStorage.setItem(COUPON_KEY, code.toUpperCase().trim());
  } else {
    localStorage.removeItem(COUPON_KEY);
  }
  const items = loadCart();
  window.dispatchEvent(new CustomEvent("bhukkad:cart-change", { detail: { items, bill: computeBill(items) } }));
}

export function getLastOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLastOrder(order) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  window.dispatchEvent(new CustomEvent("bhukkad:order-placed", { detail: { order } }));
}

export function computeBill(items = null, coupon = null) {
  const cartItems = items || loadCart();
  const couponCode = coupon !== null ? coupon : getCoupon();

  const subtotal = cartItems.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity || it.seats || 1)), 0);
  let discount = 0;
  let discountMsg = "";

  if (couponCode) {
    const code = couponCode.toUpperCase().trim();
    if (code === "BHUKKAD50" || code === "BITE50") {
      if (subtotal >= 300.0) {
        discount = Math.min(500.0, subtotal * 0.5);
        discountMsg = "50% Discount Applied (BHUKKAD50)";
      } else {
        discountMsg = "Min order ₹300 required for BHUKKAD50";
      }
    } else if (code === "PARTY20") {
      if (subtotal >= 1000.0) {
        discount = Math.min(1500.0, subtotal * 0.2);
        discountMsg = "20% Discount Applied (PARTY20)";
      } else {
        discountMsg = "Min order ₹1000 required for PARTY20";
      }
    } else if (code === "FREEDEL") {
      discountMsg = "Free Delivery Applied (FREEDEL)";
    }
  }

  const deliveryFee = (subtotal >= 500.0 || couponCode.toUpperCase().trim() === "FREEDEL") ? 0.0 : 40.0;
  const taxes = Math.round((subtotal - discount) * 0.05 * 100) / 100;
  const grandTotal = Math.max(0, Math.round((subtotal - discount + deliveryFee + taxes) * 100) / 100);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    discountMsg,
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    taxes,
    grandTotal,
    count: cartItems.reduce((acc, it) => acc + (Number(it.quantity || it.seats || 1)), 0),
  };
}

export function addToCart(product, tierName = null, quantity = 1, customization = "") {
  const items = loadCart();
  const prodName = typeof product === "string" ? product : (product.name || "Dish");
  const prodId = typeof product === "object" && product.id ? product.id : prodName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  
  let chosenTierName = tierName;
  let price = 749;
  let isVeg = true;
  let imgUrl = "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80";

  if (typeof product === "object" && product !== null) {
    if (product.tiers && product.tiers.length) {
      if (!chosenTierName) {
        chosenTierName = product.tiers[0].name;
      }
      const t = product.tiers.find(x => (x.name || "").toLowerCase() === chosenTierName.toLowerCase()) || product.tiers[0];
      chosenTierName = t.name;
      price = t.priceMonthly || 749;
    }
    isVeg = product.is_veg !== false;
    if (product.image) imgUrl = product.image;
  }

  if (!chosenTierName) chosenTierName = "Regular";

  const numQty = Number(quantity) || 1;
  const existingIdx = items.findIndex(
    i => (i.product_name || i.name || "").toLowerCase().trim() === prodName.toLowerCase().trim() &&
         (i.tier || "Regular").toLowerCase().trim() === chosenTierName.toLowerCase().trim()
  );

  if (existingIdx >= 0) {
    const prev = Number(items[existingIdx].quantity || items[existingIdx].seats || 1);
    items[existingIdx].quantity = prev + numQty;
    items[existingIdx].seats = prev + numQty;
    if (customization) items[existingIdx].customization = customization;
  } else {
    items.push({
      product_id: prodId,
      product_name: prodName,
      name: prodName,
      tier: chosenTierName,
      price: Number(price),
      quantity: numQty,
      seats: numQty,
      is_veg: isVeg,
      image: imgUrl,
      customization: customization || "",
    });
  }

  saveCart(items);
  showToast(`${prodName} (${chosenTierName}) Cart mein add ho gaya! 🛒`);
  return items;
}

export function removeFromCart(productName, quantity = 1, tierName = null) {
  let items = loadCart();
  const pName = (productName || "").toLowerCase().trim();
  const tName = tierName ? tierName.toLowerCase().trim() : null;

  const idx = items.findIndex(i => {
    const matchName = (i.product_name || i.name || "").toLowerCase().trim() === pName ||
                      (i.product_id || "").toLowerCase().trim() === pName;
    const matchTier = !tName || (i.tier || "Regular").toLowerCase().trim() === tName;
    return matchName && matchTier;
  });

  if (idx >= 0) {
    const currentQty = Number(items[idx].quantity || items[idx].seats || 1);
    const itemTier = items[idx].tier || "Regular";
    const itemName = items[idx].product_name || items[idx].name;
    if (quantity && currentQty > quantity) {
      items[idx].quantity = currentQty - quantity;
      items[idx].seats = currentQty - quantity;
      showToast(`${itemName} ki quantity kam kar di`);
    } else {
      items.splice(idx, 1);
      showToast(`${itemName} cart se hata diya`);
    }
    saveCart(items);
  }
  return items;
}

export function clearCart() {
  saveCart([]);
  setCoupon("");
}

export function applyCoupon(code) {
  const raw = (code || "").toString().trim();
  const codeUpper = raw.toUpperCase();
  const items = loadCart();
  if (!raw) {
    setCoupon("");
    return { ok: false, message: "Please enter a coupon code." };
  }
  const valid = ["BHUKKAD50", "BITE50", "PARTY20", "FREEDEL"];
  if (!valid.includes(codeUpper)) {
    return { ok: false, message: `Invalid coupon code '${raw}'.` };
  }
  if (!items.length) {
    return { ok: false, message: "Your cart is empty. Add some dishes first." };
  }
  const bill = computeBill(items, codeUpper);
  if (bill.discount <= 0 && codeUpper !== "FREEDEL") {
    return { ok: false, message: bill.discountMsg || `Coupon ${codeUpper} requires a minimum order.` };
  }
  setCoupon(codeUpper);
  showToast(`Coupon ${codeUpper} applied! 🎉`);
  return { ok: true, coupon: codeUpper, bill: computeBill(items, codeUpper) };
}

let _sessionId = null;
export function sessionId() {
  if (_sessionId) return _sessionId;
  _sessionId =
    localStorage.getItem("bhukkad_session") ||
    "bhuk-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  localStorage.setItem("bhukkad_session", _sessionId);
  return _sessionId;
}

export function apiBase() {
  return "http://localhost:8100";
}

export async function placeOrder({ address, payment, coupon = null } = {}) {
  const items = loadCart();
  if (!items.length) throw new Error("Your cart is empty.");
  const res = await fetch(`${apiBase()}/order/place`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId(),
      items: items.map(it => ({
        product: it.product_name || it.name,
        tier: it.tier && it.tier !== "Standard" ? it.tier : null,
        quantity: Number(it.quantity || it.seats || 1),
        customization: it.customization || "",
      })),
      delivery_address: address || getLocation(),
      payment_method: payment || "UPI",
      coupon: coupon || getCoupon() || undefined,
    }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data.error) {
    throw new Error(data.error || `Order failed (HTTP ${res.status})`);
  }
  setLastOrder(data);
  clearCart();
  return data;
}

export async function trackOrder(orderId) {
  const id = encodeURIComponent(String(orderId || "").trim());
  if (!id) return null;
  const res = await fetch(`${apiBase()}/order/${id}`);
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data.error) throw new Error(data.error || "Could not fetch order.");
  return data;
}

export function showToast(message) {
  let el = document.getElementById("bhukkad-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "bhukkad-toast";
    el.className = "fixed bottom-24 right-6 z-[100] bg-surface-container-lowest text-on-surface border border-outline-variant shadow-xl px-5 py-3 rounded-2xl font-label-lg flex items-center gap-3 transition-all duration-300 transform translate-y-8 opacity-0 pointer-events-none";
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="material-symbols-outlined text-primary" style="font-variation-settings:'FILL' 1;">check_circle</span> <span>${message}</span>`;
  el.classList.remove("translate-y-8", "opacity-0", "pointer-events-none");
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.classList.add("translate-y-8", "opacity-0", "pointer-events-none");
  }, 2200);
}
