# Bhukkad Voice Agent 🍕

A full-duplex, low-latency, real-time **Voice AI Food Delivery & Ordering Platform** (like Swiggy / Zomato / Domino's voice ordering). Built with FastAPI, WebSocket streaming, FAISS vector RAG, sentence-chunked TTS, and an embedded voice ordering chef.

---

## Key Features

- 🍕 **Gourmet Food Catalog**: 32 items across 8 categories (Pizzas, Biryanis, Burgers, Healthy Bowls, Combos, Desserts, Shakes) with Veg/Non-Veg indicators, allergens, and nutritional info.
- ⚡ **Full-Duplex Real-Time Voice Streaming**: Sub-600ms latency via `/ws/voice` WebSocket, sentence-chunked streaming TTS synthesis, and zero-lag barge-in interruption (<50ms).
- 🛠️ **11 Food Ordering Tools**:
  - `add_to_cart(dish, size, quantity, customization)` (e.g. *"Extra cheese"*, *"Less spicy"*)
  - `view_cart()` & `calculate_bill(tip)` (Subtotal, 5% tax, delivery fee, discounts, tips)
  - `apply_coupon(code)` (`BHUKKAD50` / `BITE50` 50% off min $15, `PARTY20` 20% off min $30, `FREEDEL` Free delivery)
  - `filter_menu(is_veg, category, max_price)` (e.g. *"Show veg dishes under $10"*)
  - `item_details(dish)` (Ratings, calories, prep time, allergen warnings)
  - `remove_from_cart(dish, tier, quantity)` (Partial or full item removal)
  - `checkout(address, payment_method)` (Places order & generates Order ID `#BK-XXXXX`)
  - `track_order(order_id)` (Live kitchen preparation & rider status)
  - `recommend_combos()` (Curated money-saving bundles)
  - `clear_cart()`
- 📚 **FAISS Vector RAG Knowledge Base**:
  - Pure food delivery knowledge base (30-minute delivery guarantees, 100% cold food instant refund guarantee, pure-veg prep stations, certified Halal sourcing).
- 🛡️ **Security Hardening**:
  - IP-based sliding window rate limiter to protect server and API budgets.
  - Admin auth token guards (`X-Admin-Key`) on `/agent/config`, `/rag/ingest`, and `/rag/build`.
  - Strict payload bounds on file uploads (15MB), prompt length (8,000 chars), and RAG search parameters.
  - Bounded in-memory session and cart storage (LRU eviction max 500 sessions) to prevent memory exhaustion DoS.
- 🌐 **Food Delivery Web Store + Live Voice Assistant**:
  - Visual storefront with live cart drawer and floating **🍕 Bhukkad Voice Chef** widget.

---

## Project Structure

```
backend/                      FastAPI Backend
  app/
    scraping/                 Food catalog -> docs/*.md + context.md
    rag/                      FAISS index · chunker · embeddings · 2D visualization
    llm/                      Gemini / OpenAI providers · orchestrator · history · prompts
    tools/                    11 food ordering tools (`domain_food.py`) + bounded cart store
    asr/  tts/                Whisper / ElevenLabs adapters + sentence chunker
    voice_ws.py               Full-duplex WebSocket voice engine (/ws/voice)
    security.py               Rate limiter & admin auth verification
  data/                       Food catalog + 32 dish docs + context.md
playground/                   Bhukkad Voice AI Studio (3D Voice Orb, Lightning TTS, Telemetry)
bhukkad-store/                 Bhukkad Food Delivery Web Storefront + embedded Voice Chef
```

---

## 🚀 Quick Start (Run Locally in 3 Steps)

Anyone can clone and run this project with zero hassle:

### 1. Clone the repository
```bash
git clone https://github.com/mailmeatdarshan/Bhukkad-AI-Agent.git
cd Bhukkad-AI-Agent
```

### 2. Setup Environment & Install Dependencies
```bash
# Create virtual environment (optional but recommended)
python3 -m venv .venv && source .venv/bin/activate

# Install requirements
pip install -r backend/requirements.txt

# Create your .env from template and add your Gemini / OpenAI API key
cp .env.example .env
```

### 3. Start the Platform
```bash
uvicorn app.main:app --app-dir backend --port 8082 --reload
```

Open in your browser:
- 🍕 **Food Store + Voice AI**: [http://localhost:8082](http://localhost:8082)
- 🎙️ **Voice AI Studio & RAG**: [http://localhost:8082/playground/index.html](http://localhost:8082/playground/index.html)
- 📖 **FastAPI Interactive Docs**: [http://localhost:8082/docs](http://localhost:8082/docs)

---

## Running Tests

```bash
cd backend
.venv/bin/pytest -v test_security_and_fixes.py test_bhukkad_food.py test_websocket_voice.py
```
