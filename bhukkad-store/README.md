# Bhukkad: a fictitious food delivery storefront (voice-agent starter)

This is a static food-delivery website for **Bhukkad**, a made-up gourmet
fast-casual kitchen (think a fictional Swiggy / Zomato storefront). It is the
**frontend surface for the Bhukkad Voice Agent build** in this repo: the food
catalog, the menus, and the policies that the voice agent answers questions
about and acts on.

## What's here

```
.
├── index.html        # home
├── products.html     # filterable menu (?cat=<id>)
├── product.html      # dish detail (?id=<slug>)
├── pricing.html      # pricing + coupon / combo deals
├── support.html      # delivery / refund / allergy policies + FAQs
├── about.html        # company profile
├── assets/
│   ├── styles.css    # design system
│   ├── app.js        # catalog loader, shared layout (nav/footer), helpers
│   ├── cart.js       # client-side cart (localStorage key: bhukkad_cart)
│   ├── widget.js     # embedded "Talk to Bhukkad" voice agent widget
│   ├── render.js     # per-page renderers
│   └── favicon.svg
└── data/
    └── catalog.json  # single source of truth: menu + policies + dishes
```

Everything is driven by `data/catalog.json`. There is **no build step** and **no
backend** in this folder: plain HTML, CSS, and ES modules. The voice agent
backend lives in `../backend/`.

## Run locally

`fetch()` needs HTTP (not `file://`), so serve the folder:

```bash
python3 -m http.server 8093
# then open http://localhost:8093/
```

The embedded `widget.js` calls the backend at `window.BHUKKAD_API_BASE` (default
`http://localhost:8100`) with the server cart mirrored into the `bhukkad_cart`
localStorage key (see `assets/cart.js`).

## Notes

- Bhukkad is **not a real company**. Names, prices, and policies are invented
  for teaching.
- Coupons that work with the backend agent: `BHUKKAD50` (50% off, min $15),
  `PARTY20` (20% off, min $30), and `FREEDEL` (free delivery).