// Bhukkad Conversational AI Widget (Bhukkad "Saffron & Mint" Theme Edition)
// Layout: ElevenLabs 3-State Architecture (Orb FAB, Compact Pill Bar, Expanded Chat Popover)
// Visual: Bhukkad Glowing Saffron & Mint Orb with Brand Logo, Warm Espresso Cards, Vibrant Saffron CTAs.

import { addToCart, removeFromCart, clearCart, applyCoupon, setLastOrder, showToast, computeBill, apiBase, getWhatsAppReceiptUrl } from "./cart-state.js";

let ws = null;
let isPlaying = false;
let audioQueue = [];
let isCallActive = false;
let recognition = null;
let currentMode = "pill"; // "orb" | "pill" | "expanded"
let selectedLang = "hinglish"; // "hinglish" | "english" | "hindi"
let isFullscreen = false;
let isMounted = false;

const GREETINGS = {
  hinglish: "Arre boss! Main hoon Foodie. Bhookh lagi hai toh tension mat lo, bas batao aaj kya khane ka mood hai - Masaledaar Biryani, Cheesy Pizza ya kuch meetha?",
  english: "Hey foodie! I'm Foodie. Feeling hungry? Just tell me what you're craving - Sizzling Biryani, Cheesy Pizza, or sweet desserts?",
  hindi: "नमस्ते! मैं हूँ Foodie. ज़ोरों की भूख लगी है? बस बताइए आज क्या खाने का मन है - गरमा-गरम बिरयानी, चीज़ी पिज़्ज़ा या कुछ मीठा?",
};

const LANG_LABELS = {
  hinglish: { flag: "🇮🇳", label: "Hinglish" },
  english: { flag: "🇺🇸", label: "English" },
  hindi: { flag: "🇮🇳", label: "हिन्दी" },
};

function injectStyles() {
  if (document.getElementById("bhukkadWidgetStyles")) return;
  const style = document.createElement("style");
  style.id = "bhukkadWidgetStyles";
  style.textContent = `
    /* Bhukkad Radiant Saffron & Mint Orb */
    .bhukkad-ai-orb {
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #ffc0a8 0%, #ff5722 35%, #b02f00 70%, #006b5c 100%);
      box-shadow:
        inset 0 0 6px rgba(255, 230, 200, 0.9),
        0 0 16px rgba(255, 87, 34, 0.45),
        0 4px 14px rgba(0, 0, 0, 0.4);
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .bhukkad-ai-orb::after {
      content: '';
      position: absolute;
      top: 6%;
      left: 14%;
      width: 42%;
      height: 30%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 80%);
      transform: rotate(-25deg);
      pointer-events: none;
    }

    @keyframes bhukkadOrbSpin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes bhukkadOrbPulse {
      0% {
        transform: scale(0.96);
        box-shadow: 0 0 14px rgba(255, 87, 34, 0.5), 0 0 28px rgba(0, 107, 92, 0.3);
      }
      100% {
        transform: scale(1.08);
        box-shadow: 0 0 28px rgba(255, 87, 34, 0.9), 0 0 50px rgba(0, 107, 92, 0.6);
      }
    }

    .bhukkad-ai-orb.spinning {
      animation: bhukkadOrbSpin 4s linear infinite;
    }

    .bhukkad-ai-orb.calling {
      animation: bhukkadOrbSpin 2.5s linear infinite, bhukkadOrbPulse 1.2s ease-in-out infinite alternate;
    }

    /* Widget Glass Container (Bhukkad Warm Espresso Theme) */
    .bhukkad-widget-card {
      background: #181311;
      border: 1px solid rgba(255, 87, 34, 0.22);
      box-shadow: 0 20px 50px rgba(176, 47, 0, 0.25), 0 8px 24px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    /* Smooth Transitions */
    #bhukkadWidgetContainer {
      transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    /* Custom Chat Scrollbar */
    .bhukkad-chat-feed::-webkit-scrollbar {
      width: 4px;
    }
    .bhukkad-chat-feed::-webkit-scrollbar-track {
      background: transparent;
    }
    .bhukkad-chat-feed::-webkit-scrollbar-thumb {
      background: rgba(255, 87, 34, 0.25);
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}

export function mountVoiceAssistant() {
  if (isMounted || document.getElementById("bhukkadWidgetContainer")) return;
  isMounted = true;
  injectStyles();

  // On small mobile screens, default to compact glowing orb mode to keep navbar unobstructed
  if (typeof window !== "undefined" && window.innerWidth < 640) {
    currentMode = "orb";
  }

  const container = document.createElement("div");
  container.id = "bhukkadWidgetContainer";
  container.className = "fixed bottom-[74px] right-3 sm:bottom-6 sm:right-6 z-[75] text-white select-none";

  container.innerHTML = `
    <!-- 1. ORB ONLY FAB MODE (State A - Compact Rotating Saffron Orb) -->
    <div id="bhukkadOrbFab" class="hidden cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200" title="Foodie Assistant">
      <div class="w-10 h-10 sm:w-12 sm:h-12 bhukkad-ai-orb spinning shadow-xl p-1 flex items-center justify-center">
        <img src="assets/logo.png" alt="Bhukkad AI" class="w-full h-full object-contain rounded-full drop-shadow-sm" onerror="this.style.display='none'"/>
      </div>
    </div>

    <!-- 2. COMPACT PILL MODE (State B - Adjusted for mobile) -->
    <div id="bhukkadPillBar" class="bhukkad-widget-card rounded-[22px] sm:rounded-[26px] p-2.5 sm:p-3.5 flex flex-col gap-2 sm:gap-3 w-[calc(100vw-24px)] max-w-[310px] sm:max-w-[340px] shadow-2xl animate-[fadeIn_0.2s_ease-out]">
      <!-- Top Row -->
      <div class="flex items-center justify-between px-1 cursor-pointer" id="pillTopTrigger">
        <div class="flex items-center gap-2">
          <div class="w-5 h-5 sm:w-6 sm:h-6 bhukkad-ai-orb spinning p-0.5">
            <img src="assets/logo.png" alt="Bhukkad" class="w-full h-full object-contain rounded-full" onerror="this.style.display='none'"/>
          </div>
          <span class="font-bold text-xs sm:text-[14px] tracking-tight text-white/95">
            Bhookh lagi hai?
          </span>
        </div>
        <button id="pillMinimizeBtn" class="text-white/40 hover:text-primary transition-colors p-1 rounded-full text-xs cursor-pointer" title="Minimize to orb">
          <span class="material-symbols-outlined text-[16px] sm:text-[18px]">close</span>
        </button>
      </div>

      <!-- Bottom Row Controls -->
      <div class="flex items-center gap-1.5 sm:gap-2">
        <!-- Call Button (Saffron Pill CTA) -->
        <button id="pillCallBtn" class="flex-1 bg-gradient-to-r from-primary to-[#ff6b00] hover:brightness-110 text-white font-bold text-[11px] sm:text-xs py-1.5 sm:py-2.5 px-2.5 sm:px-3 rounded-full flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer">
          <span class="material-symbols-outlined text-[15px] sm:text-[16px]">call</span>
          <span>Ask anything</span>
        </button>

        <!-- Chat Button -->
        <button id="pillChatBtn" class="w-8 h-7 sm:w-10 sm:h-9 bg-[#261d1a] hover:bg-[#342723] border border-white/10 hover:border-primary/50 rounded-xl flex items-center justify-center text-white/90 hover:text-primary transition-all active:scale-95 cursor-pointer" title="Open Chat">
          <span class="material-symbols-outlined text-[15px] sm:text-[17px]">chat_bubble</span>
        </button>

        <!-- Language Selector -->
        <div class="relative">
          <button id="pillLangBtn" class="h-7 sm:h-9 px-1.5 sm:px-2.5 bg-[#261d1a] hover:bg-[#342723] border border-white/10 hover:border-primary/50 rounded-xl flex items-center gap-0.5 sm:gap-1 text-[11px] sm:text-xs font-semibold text-white/90 hover:text-white transition-all cursor-pointer">
            <span id="pillLangFlag">🇮🇳</span>
            <span class="material-symbols-outlined text-[13px] sm:text-[14px] text-white/60">expand_more</span>
          </button>
          <div id="pillLangMenu" class="hidden absolute bottom-10 right-0 bg-[#221815] border border-primary/30 rounded-2xl p-1.5 shadow-2xl min-w-[130px] flex flex-col gap-1 z-50">
            <button class="lang-option px-3 py-1.5 rounded-xl hover:bg-primary/20 text-xs font-semibold text-left flex items-center gap-2 text-white cursor-pointer" data-lang="hinglish">
              <span>🇮🇳</span> Hinglish
            </button>
            <button class="lang-option px-3 py-1.5 rounded-xl hover:bg-primary/20 text-xs font-semibold text-left flex items-center gap-2 text-white cursor-pointer" data-lang="english">
              <span>🇺🇸</span> English
            </button>
            <button class="lang-option px-3 py-1.5 rounded-xl hover:bg-primary/20 text-xs font-semibold text-left flex items-center gap-2 text-white cursor-pointer" data-lang="hindi">
              <span>🇮🇳</span> हिन्दी
            </button>
          </div>
        </div>

        <!-- Expand / Fullscreen Button -->
        <button id="pillExpandBtn" class="w-7 h-7 sm:w-9 sm:h-9 bg-[#261d1a] hover:bg-[#342723] border border-white/10 hover:border-primary/50 rounded-xl flex items-center justify-center text-white/90 hover:text-white transition-all active:scale-95 cursor-pointer" title="Expand">
          <span class="material-symbols-outlined text-[15px] sm:text-[16px]">open_in_full</span>
        </button>
      </div>
    </div>

    <!-- 3. EXPANDED CHAT POPOVER (State C - Mobile tuned) -->
    <div id="bhukkadExpandedModal" class="hidden flex flex-col gap-2 sm:gap-3">
      <!-- Main Chat Box -->
      <div id="bhukkadChatCard" class="bhukkad-widget-card rounded-[22px] sm:rounded-[28px] w-[calc(100vw-24px)] sm:w-[370px] max-w-[400px] h-[65vh] sm:h-[520px] max-h-[540px] flex flex-col p-3 sm:p-4 shadow-2xl relative overflow-hidden">
        
        <!-- Header -->
        <div class="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-white/10 mb-2 flex-shrink-0">
          <div class="flex items-center gap-2 sm:gap-2.5">
            <div id="expandedHeaderOrb" class="w-6 h-6 sm:w-7 sm:h-7 bhukkad-ai-orb spinning p-0.5">
              <img src="assets/logo.png" alt="Bhukkad" class="w-full h-full object-contain rounded-full" onerror="this.style.display='none'"/>
            </div>
            <div>
              <div class="text-xs font-bold text-white leading-tight flex items-center gap-1">
                <span>Foodie</span>
              </div>
              <div id="expandedLiveStatus" class="text-[10px] text-secondary font-medium flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                <span>Online</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1 sm:gap-2">
            <!-- Language Dropdown -->
            <div class="relative">
              <button id="expandedLangBtn" class="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-semibold text-white/90 transition-colors">
                <span id="expandedLangFlag">🇮🇳</span>
                <span id="expandedLangLabel" class="text-[10px] sm:text-[11px]">Hinglish</span>
                <span class="material-symbols-outlined text-[13px] sm:text-[14px] text-white/60">expand_more</span>
              </button>
              <div id="expandedLangMenu" class="hidden absolute top-8 right-0 bg-[#221815] border border-primary/30 rounded-2xl p-1.5 shadow-2xl min-w-[130px] flex flex-col gap-1 z-50">
                <button class="lang-option px-3 py-1.5 rounded-xl hover:bg-primary/20 text-xs font-semibold text-left flex items-center gap-2 text-white" data-lang="hinglish">
                  <span>🇮🇳</span> Hinglish
                </button>
                <button class="lang-option px-3 py-1.5 rounded-xl hover:bg-primary/20 text-xs font-semibold text-left flex items-center gap-2 text-white" data-lang="english">
                  <span>🇺🇸</span> English
                </button>
                <button class="lang-option px-3 py-1.5 rounded-xl hover:bg-primary/20 text-xs font-semibold text-left flex items-center gap-2 text-white" data-lang="hindi">
                  <span>🇮🇳</span> हिन्दी
                </button>
              </div>
            </div>

            <!-- Fullscreen / Size Toggle -->
            <button id="expandedFullscreenBtn" class="text-white/60 hover:text-primary p-1 rounded-lg transition-colors" title="Toggle Fullscreen">
              <span class="material-symbols-outlined text-[17px] sm:text-[18px]">open_in_full</span>
            </button>

            <!-- Close / Minimize to Pill -->
            <button id="expandedCloseBtn" class="text-white/60 hover:text-primary p-1 rounded-lg transition-colors" title="Minimize">
              <span class="material-symbols-outlined text-[17px] sm:text-[18px]">close</span>
            </button>
          </div>
        </div>

        <!-- Active Voice Call Live Banner (Visible during phone call) -->
        <div id="activeCallBanner" class="hidden bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/40 rounded-2xl p-2.5 sm:p-3 mb-2.5 sm:mb-3 flex items-center justify-between gap-2.5 animate-[fadeIn_0.2s_ease-out] flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 sm:w-8 sm:h-8 bhukkad-ai-orb calling p-0.5">
              <img src="assets/logo.png" alt="Bhukkad" class="w-full h-full object-contain rounded-full"/>
            </div>
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-white">Live Voice Call Active</div>
              <div class="text-[10px] sm:text-[11px] text-primary font-bold animate-pulse">AI Chef sun raha hai... Boliye</div>
            </div>
          </div>
          <button id="endCallBtn" class="bg-red-500 hover:bg-red-600 text-white p-1.5 sm:p-2 rounded-full shadow-md active:scale-95 transition-all" title="End Call">
            <span class="material-symbols-outlined text-[16px] sm:text-[18px]">call_end</span>
          </button>
        </div>

        <!-- Chat Feed -->
        <div id="bhukkadChatFeed" class="bhukkad-chat-feed flex-1 overflow-y-auto pr-1 space-y-2.5 sm:space-y-3 mb-2.5 sm:mb-3 text-xs sm:text-sm">
          <!-- Greeting Message -->
          <div class="flex flex-col items-start gap-1 max-w-[92%] sm:max-w-[90%]">
            <div class="bg-[#241c19] border border-white/10 text-white/95 rounded-2xl rounded-tl-sm px-3.5 py-2.5 sm:px-4 sm:py-3 leading-relaxed shadow-sm">
              <span id="chatGreetingText">${GREETINGS[selectedLang]}</span>
            </div>
          </div>
        </div>

        <!-- Bottom Input Container (Bhukkad Warm Theme Box) -->
        <div class="bg-[#15100f] border border-primary/30 rounded-2xl p-2 sm:p-2.5 flex flex-col gap-1.5 sm:gap-2 flex-shrink-0 focus-within:border-primary transition-colors">
          <textarea id="bhukkadChatInput" rows="2" placeholder="Dishes boliye ya type karein..." class="bg-transparent text-white text-xs placeholder-white/40 outline-none resize-none px-1 py-0.5 leading-normal w-full"></textarea>
          
          <div class="flex items-center justify-between pt-1 border-t border-white/5">
            <span class="text-[9px] sm:text-[10px] text-white/40 font-medium">Enter dabakar bhejo</span>
            <div class="flex items-center gap-1.5 sm:gap-2">
              <!-- Call / Mic Toggle -->
              <button id="chatMicCallBtn" class="w-7 h-7 sm:w-8 sm:h-8 bg-[#261d1a] hover:bg-primary/20 border border-primary/40 text-white rounded-xl flex items-center justify-center transition-all active:scale-95" title="Start Voice Call">
                <span id="chatMicIcon" class="material-symbols-outlined text-[15px] sm:text-[16px]">call</span>
              </button>
              <!-- Send Button (Saffron CTA) -->
              <button id="chatSendBtn" class="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-r from-primary to-[#ff6b00] hover:brightness-110 text-white rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm" title="Send Message">
                <span class="material-symbols-outlined text-[15px] sm:text-[16px]">arrow_upward</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Docked Bottom Control Bar -->
      <div class="flex justify-end gap-2 pr-1">
        <button id="dockMinimizeBtn" class="w-7 h-7 sm:w-8 sm:h-8 bg-[#201715] hover:bg-[#2c1f1c] border border-primary/25 text-white/80 hover:text-primary rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95" title="Minimize">
          <span class="material-symbols-outlined text-[15px] sm:text-[16px]">expand_more</span>
        </button>
        <button id="dockFullscreenBtn" class="w-7 h-7 sm:w-8 sm:h-8 bg-[#201715] hover:bg-[#2c1f1c] border border-primary/25 text-white/80 hover:text-primary rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95" title="Expand">
          <span class="material-symbols-outlined text-[15px] sm:text-[16px]">open_in_full</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  bindWidgetEvents();
  renderMode();
  restoreChatHistory();
}

function bindWidgetEvents() {
  // Orb click -> Pill on desktop, or Expanded on mobile for instant access
  document.getElementById("bhukkadOrbFab")?.addEventListener("click", () => {
    if (window.innerWidth < 640) {
      setVoiceMode("expanded");
    } else {
      setVoiceMode("pill");
    }
  });

  // Pill Minimize -> Orb
  document.getElementById("pillMinimizeBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setVoiceMode("orb");
  });

  // Pill Top click -> Expanded
  document.getElementById("pillTopTrigger")?.addEventListener("click", () => setVoiceMode("expanded"));

  // Pill Chat -> Expanded
  document.getElementById("pillChatBtn")?.addEventListener("click", () => setVoiceMode("expanded"));
  document.getElementById("pillExpandBtn")?.addEventListener("click", () => setVoiceMode("expanded"));

  // Pill Call -> Expanded + Start Voice Call
  document.getElementById("pillCallBtn")?.addEventListener("click", () => {
    setVoiceMode("expanded");
    startVoiceCall();
  });

  // Pill Language Dropdown
  const pillLangBtn = document.getElementById("pillLangBtn");
  const pillLangMenu = document.getElementById("pillLangMenu");
  pillLangBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    pillLangMenu?.classList.toggle("hidden");
  });

  // Expanded Language Dropdown
  const expLangBtn = document.getElementById("expandedLangBtn");
  const expLangMenu = document.getElementById("expandedLangMenu");
  expLangBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    expLangMenu?.classList.toggle("hidden");
  });

  // Global click outside language menus
  window.addEventListener("click", () => {
    pillLangMenu?.classList.add("hidden");
    expLangMenu?.classList.add("hidden");
  });

  // Language options
  document.querySelectorAll(".lang-option").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const lang = btn.dataset.lang;
      changeLanguage(lang);
      pillLangMenu?.classList.add("hidden");
      expLangMenu?.classList.add("hidden");
    });
  });

  // Expanded Close / Minimize
  document.getElementById("expandedCloseBtn")?.addEventListener("click", () => {
    if (window.innerWidth < 640) {
      setVoiceMode("orb");
    } else {
      setVoiceMode("pill");
    }
  });
  document.getElementById("dockMinimizeBtn")?.addEventListener("click", () => {
    if (window.innerWidth < 640) {
      setVoiceMode("orb");
    } else {
      setVoiceMode("pill");
    }
  });

  // Fullscreen toggle
  document.getElementById("expandedFullscreenBtn")?.addEventListener("click", toggleFullscreen);
  document.getElementById("dockFullscreenBtn")?.addEventListener("click", toggleFullscreen);

  // Chat Send Actions
  const chatInput = document.getElementById("bhukkadChatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");

  chatSendBtn?.addEventListener("click", () => submitChatInput());
  chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChatInput();
    }
  });

  // Chat Mic / Call Button
  document.getElementById("chatMicCallBtn")?.addEventListener("click", () => {
    if (isCallActive) {
      stopVoiceCall();
    } else {
      startVoiceCall();
    }
  });

  // Call End Banner Button
  document.getElementById("endCallBtn")?.addEventListener("click", () => {
    stopVoiceCall();
  });

  // Global external triggers (.open-voice-assistant)
  document.querySelectorAll(".open-voice-assistant").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setVoiceMode("expanded");
      startVoiceCall();
    });
  });
}

export function setVoiceMode(mode) {
  currentMode = mode;
  renderMode();
}

function renderMode() {
  const orbFab = document.getElementById("bhukkadOrbFab");
  const pillBar = document.getElementById("bhukkadPillBar");
  const expandedModal = document.getElementById("bhukkadExpandedModal");
  const container = document.getElementById("bhukkadWidgetContainer");

  if (!orbFab || !pillBar || !expandedModal || !container) return;

  orbFab.classList.toggle("hidden", currentMode !== "orb");
  pillBar.classList.toggle("hidden", currentMode !== "pill");
  expandedModal.classList.toggle("hidden", currentMode !== "expanded");

  if (currentMode === "expanded") {
    // If not in fullscreen, position neatly above bottom nav or centered
    if (!isFullscreen) {
      if (window.innerWidth < 640) {
        container.className = "fixed inset-x-3 bottom-[76px] z-[80] text-white flex justify-center";
      } else {
        container.className = "fixed bottom-6 right-6 z-[75] text-white select-none";
      }
    }
    // Ensure the chat card fits within small screens (account for browser UI)
    const cardEl = document.getElementById("bhukkadChatCard");
    if (cardEl) {
      if (isFullscreen) {
        cardEl.style.maxHeight = "100%";
      } else if (window.innerWidth < 640) {
        cardEl.style.height = "min(540px, calc(100dvh - 190px))";
      } else {
        cardEl.style.height = "";
      }
    }
    setTimeout(() => {
      const input = document.getElementById("bhukkadChatInput");
      if (input) input.focus();
    }, 150);
  } else {
    // Reset container for floating modes
    if (!isFullscreen) {
      container.className = "fixed bottom-[76px] right-3 sm:bottom-6 sm:right-6 z-[75] text-white select-none";
    }
  }
}

function toggleFullscreen() {
  isFullscreen = !isFullscreen;
  const card = document.getElementById("bhukkadChatCard");
  const container = document.getElementById("bhukkadWidgetContainer");
  if (!card || !container) return;

  if (isFullscreen) {
    container.className = "fixed inset-2 sm:inset-8 z-[999] text-white flex items-center justify-center";
    card.style.width = "100%";
    card.style.height = "100%";
    card.style.maxWidth = "800px";
    card.style.maxHeight = "760px";
  } else {
    card.style.width = "";
    card.style.height = "";
    card.style.maxWidth = "";
    card.style.maxHeight = "";
    renderMode();
  }
}

function changeLanguage(lang) {
  if (!LANG_LABELS[lang]) return;
  selectedLang = lang;

  const pillFlag = document.getElementById("pillLangFlag");
  const expFlag = document.getElementById("expandedLangFlag");
  const expLabel = document.getElementById("expandedLangLabel");
  const greetText = document.getElementById("chatGreetingText");

  if (pillFlag) pillFlag.textContent = LANG_LABELS[lang].flag;
  if (expFlag) expFlag.textContent = LANG_LABELS[lang].flag;
  if (expLabel) expLabel.textContent = LANG_LABELS[lang].label;
  if (greetText) greetText.textContent = GREETINGS[lang];

  showToast(`Language set to ${LANG_LABELS[lang].label} ✨`);
}

export function openVoiceOverlay(startCall = false) {
  mountVoiceAssistant();
  setVoiceMode("expanded");
  if (startCall) {
    startVoiceCall();
  }
}

export function closeVoiceOverlay() {
  setVoiceMode("pill");
  stopVoiceCall();
}

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const api = apiBase().replace(/^https?:\/\//, "");
  const savedSessionId = sessionStorage.getItem("bhukkad_session_id");
  const wsUrl = "ws://" + api + "/ws/voice" + (savedSessionId ? `?session_id=${encodeURIComponent(savedSessionId)}` : "");
  updateLiveStatus("Connecting...", "text-amber-400");

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateLiveStatus("Online", "text-secondary");
    const savedSessionId = sessionStorage.getItem("bhukkad_session_id");
    const initMsg = {
      type: "init",
      config: {
        model_key: "gemini-flash",
        tts_provider: "elevenlabs",
        tts_voice: "Sarah",
        use_rag: true,
        tools_enabled: true,
      }
    };
    if (savedSessionId) initMsg.session_id = savedSessionId;
    ws.send(JSON.stringify(initMsg));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error("WS Parse error", e);
    }
  };

  ws.onerror = (err) => {
    console.error("WS Error", err);
    updateLiveStatus("Offline", "text-red-400");
  };

  ws.onclose = () => {
    updateLiveStatus("Disconnected", "text-white/40");
  };
}

let activeAIBubbleEl = null;

function handleServerMessage(msg) {
  if (msg.type === "ready") {
    if (msg.session_id) {
      sessionStorage.setItem("bhukkad_session_id", msg.session_id);
    }
    updateLiveStatus("Online", "text-secondary");
  } else if (msg.type === "llm_delta") {
    if (!activeAIBubbleEl) {
      activeAIBubbleEl = createAIBubble("");
    }
    const textSpan = activeAIBubbleEl.querySelector(".ai-bubble-text");
    if (textSpan) {
      textSpan.textContent += msg.delta;
      scrollToBottom();
    }
  } else if (msg.type === "turn_done") {
    if (msg.text) saveChatMessage("assistant", msg.text);
    activeAIBubbleEl = null;
  } else if (msg.type === "audio") {
    playAudioChunk(msg.data || msg.audio);
  } else if (msg.type === "interrupted") {
    clearAudioQueue();
    activeAIBubbleEl = null;
  } else if (msg.type === "tool_call") {
    handleToolCallSync(msg.name, msg.arguments, msg.result);
  } else if (msg.type === "error") {
    appendSystemMessage(`Error: ${msg.error}`);
  }
}

function handleToolCallSync(name, args, result) {
  if (name === "add_to_cart") {
    const itemData = (result && result.added) ? {
      id: result.added.id || (result.added.name || result.added.item || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: result.added.name || result.added.item || (typeof args.product === "string" ? args.product : args.product?.name),
      is_veg: result.added.is_veg !== false,
      image: result.added.image,
      tiers: [{ name: result.added.tier || result.added.portion || args.tier || "Regular", priceMonthly: result.added.price }]
    } : args.product;

    const chosenTier = result?.added?.tier || result?.added?.portion || args.tier || "Regular";
    const chosenQty = result?.added?.quantity || args.seats || args.quantity || 1;
    const chosenCust = result?.added?.customization || args.customization || "";

    addToCart(itemData, chosenTier, chosenQty, chosenCust);
    const bill = computeBill();
    const dishDisplayName = result?.added?.name || result?.added?.item || (typeof args.product === "string" ? args.product : args.product?.name);
    renderCartToolCard(dishDisplayName, chosenTier, bill.grandTotal);
  } else if (name === "remove_from_cart") {
    removeFromCart(args.product, args.quantity || 1, args.tier);
  } else if (name === "clear_cart") {
    clearCart();
  } else if (name === "apply_coupon") {
    applyCoupon(args.coupon_code);
    appendSystemMessage(`Coupon ${args.coupon_code} apply ho gaya!`);
  } else if (name === "checkout") {
    if (result && result.order_id) {
      setLastOrder(result);
      appendSystemMessage(`Order #${result.order_id} confirm ho gaya! ~28 mins mein delivery.`);
      renderWhatsAppReceiptCard(result);
    }
  } else if (name === "send_whatsapp_receipt") {
    if (result && result.order_id) {
      renderWhatsAppReceiptCard(result);
      if (result.whatsapp_url) {
        window.open(result.whatsapp_url, "_blank");
      }
    }
  }
}

function submitChatInput() {
  const input = document.getElementById("bhukkadChatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  appendUserBubble(text);
  sendPrompt(text);
}

function sendPrompt(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    setTimeout(() => sendPrompt(text), 500);
    return;
  }

  activeAIBubbleEl = null;
  ws.send(JSON.stringify({ type: "prompt", text }));
}

function startVoiceCall() {
  isCallActive = true;
  connectWebSocket();

  const callBanner = document.getElementById("activeCallBanner");
  const micIcon = document.getElementById("chatMicIcon");
  const micBtn = document.getElementById("chatMicCallBtn");
  const orb = document.getElementById("expandedHeaderOrb");

  if (callBanner) callBanner.classList.remove("hidden");
  if (micIcon) micIcon.textContent = "call_end";
  if (micBtn) {
    micBtn.classList.remove("bg-[#261d1a]", "border-primary/40");
    micBtn.classList.add("bg-red-500", "border-red-400");
  }
  if (orb) {
    orb.classList.remove("spinning");
    orb.classList.add("calling");
  }

  startSpeechRecognition();
}

function stopVoiceCall() {
  isCallActive = false;

  const callBanner = document.getElementById("activeCallBanner");
  const micIcon = document.getElementById("chatMicIcon");
  const micBtn = document.getElementById("chatMicCallBtn");
  const orb = document.getElementById("expandedHeaderOrb");

  if (callBanner) callBanner.classList.add("hidden");
  if (micIcon) micIcon.textContent = "call";
  if (micBtn) {
    micBtn.classList.remove("bg-red-500", "border-red-400");
    micBtn.classList.add("bg-[#261d1a]", "border-primary/40");
  }
  if (orb) {
    orb.classList.remove("calling");
    orb.classList.add("spinning");
  }

  stopSpeechRecognition();
  clearAudioQueue();
}

function startSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    appendSystemMessage("Voice recognition unavailable in this browser. Please type or use Chrome.");
    return;
  }

  try {
    recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = selectedLang === "hindi" ? "hi-IN" : "en-IN";

    recognition.onresult = (event) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript.trim();
      if (transcript) {
        appendUserBubble(transcript);
        sendPrompt(transcript);
      }
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition notice:", e.error);
    };

    recognition.onend = () => {
      if (isCallActive) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognition.start();
  } catch (err) {
    console.error("SpeechRec start error", err);
  }
}

function stopSpeechRecognition() {
  if (recognition) {
    try {
      recognition.stop();
    } catch (_) {}
    recognition = null;
  }
}

function appendUserBubble(text) {
  const feed = document.getElementById("bhukkadChatFeed");
  if (!feed) return;
  const div = document.createElement("div");
  div.className = "flex justify-end";
  div.innerHTML = `
    <div class="bg-gradient-to-r from-primary to-[#ff6b00] text-white font-medium rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] shadow-md leading-relaxed text-xs sm:text-sm">
      ${escapeHtml(text)}
    </div>
  `;
  feed.appendChild(div);
  scrollToBottom();
  saveChatMessage("user", text);
}

function createAIBubble(initialText = "") {
  const feed = document.getElementById("bhukkadChatFeed");
  if (!feed) return null;
  const div = document.createElement("div");
  div.className = "flex flex-col items-start gap-1 max-w-[90%]";
  div.innerHTML = `
    <div class="bg-[#241c19] border border-white/10 text-white/95 rounded-2xl rounded-tl-sm px-4 py-3 leading-relaxed shadow-sm text-xs sm:text-sm">
      <span class="ai-bubble-text">${escapeHtml(initialText)}</span>
    </div>
  `;
  feed.appendChild(div);
  scrollToBottom();
  return div;
}

function renderCartToolCard(dishName, tier, grandTotal, save = true) {
  const feed = document.getElementById("bhukkadChatFeed");
  if (!feed) return;
  const card = document.createElement("div");
  card.className = "w-full max-w-[92%] bg-gradient-to-r from-secondary/25 to-primary/20 border border-secondary/50 rounded-2xl p-3 my-1 flex items-center justify-between gap-3 shadow-md";
  card.innerHTML = `
    <div class="flex items-center gap-2.5">
      <div class="w-7 h-7 rounded-full bg-secondary/30 flex items-center justify-center text-secondary">
        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">shopping_bag</span>
      </div>
      <div>
        <div class="text-xs font-bold text-white">${escapeHtml(dishName)} <span class="text-white/60 font-normal">(${escapeHtml(tier)})</span></div>
        <div class="text-[10px] text-secondary font-bold">Cart mein add ho gaya • Total ₹${grandTotal}</div>
      </div>
    </div>
    <a href="checkout.html" class="bg-primary hover:bg-primary-container text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-sm transition-all flex items-center gap-0.5 flex-shrink-0">
      <span>Cart</span>
      <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
    </a>
  `;
  feed.appendChild(card);
  scrollToBottom();
  if (save) saveChatMessage("card", { dishName, tier, grandTotal });
}

function renderWhatsAppReceiptCard(order, save = true) {
  const feed = document.getElementById("bhukkadChatFeed");
  if (!feed || !order) return;

  const orderId = order.order_id || "BK-00000";
  const grandTotal = order.grand_total || order.bill?.grand_total || 0;
  const whatsappUrl = order.whatsapp_url || getWhatsAppReceiptUrl(order);

  const card = document.createElement("div");
  card.className = "w-full max-w-[95%] bg-[#18261e] border border-[#25D366]/40 rounded-2xl p-3 my-2 flex flex-col gap-2.5 shadow-xl animate-[fadeIn_0.25s_ease-out]";
  card.innerHTML = `
    <div class="flex items-center justify-between border-b border-white/10 pb-2">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[#25D366]">
          <span class="material-symbols-outlined text-[17px]">receipt_long</span>
        </div>
        <div>
          <div class="text-xs font-bold text-white">Order Confirmed • #${escapeHtml(orderId)}</div>
          <div class="text-[10px] text-white/60">Grand Total: ₹${grandTotal}</div>
        </div>
      </div>
      <span class="text-[10px] font-bold text-[#25D366] bg-[#25D366]/10 px-2 py-0.5 rounded-full border border-[#25D366]/20">Active</span>
    </div>
    <div class="text-[11px] text-white/85 leading-snug">
      Aapka order confirm ho gaya hai. Kya aap receipt WhatsApp par lena chahte hain?
    </div>
    <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="bg-[#25D366] hover:bg-[#20ba59] active:scale-95 text-black font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md">
      <span class="material-symbols-outlined text-[16px]">chat</span>
      <span>WhatsApp par Receipt lein</span>
    </a>
  `;
  feed.appendChild(card);
  scrollToBottom();
  if (save) saveChatMessage("receipt", order);
}

function appendSystemMessage(text, save = true) {
  const feed = document.getElementById("bhukkadChatFeed");
  if (!feed) return;
  const div = document.createElement("div");
  div.className = "text-center my-1";
  div.innerHTML = `
    <span class="text-[11px] text-white/60 bg-white/5 border border-primary/20 px-3 py-1 rounded-full inline-block">
      ${escapeHtml(text)}
    </span>
  `;
  feed.appendChild(div);
  scrollToBottom();
  if (save) saveChatMessage("system", text);
}

function playAudioChunk(base64Audio) {
  if (!base64Audio) return;
  audioQueue.push(base64Audio);
  if (!isPlaying) {
    processNextAudio();
  }
}

function processNextAudio() {
  if (!audioQueue.length) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const chunk = audioQueue.shift();
  const audio = new Audio("data:audio/mp3;base64," + chunk);
  audio.onended = () => processNextAudio();
  audio.onerror = () => processNextAudio();
  audio.play().catch(e => {
    console.warn("Audio autoplay notice", e);
    processNextAudio();
  });
}

function clearAudioQueue() {
  audioQueue = [];
  isPlaying = false;
}

function updateLiveStatus(text, colorClass) {
  const statusEl = document.getElementById("expandedLiveStatus");
  if (statusEl) {
    statusEl.className = `text-[10px] ${colorClass} font-medium flex items-center gap-1`;
    statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${colorClass.replace('text-', 'bg-')} animate-pulse"></span><span>${text}</span>`;
  }
}

function scrollToBottom() {
  const feed = document.getElementById("bhukkadChatFeed");
  if (feed) feed.scrollTop = feed.scrollHeight;
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Chat History Persistence (sessionStorage) ----
const CHAT_HISTORY_KEY = "bhukkad_chat_history";

function saveChatMessage(role, content) {
  try {
    const history = JSON.parse(sessionStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    history.push({ role, content });
    // Keep last 50 messages to avoid storage bloat
    if (history.length > 50) history.splice(0, history.length - 50);
    sessionStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
  } catch (e) { /* ignore storage errors */ }
}

function restoreChatHistory() {
  try {
    const history = JSON.parse(sessionStorage.getItem(CHAT_HISTORY_KEY) || "[]");
    if (!history.length) return;
    const feed = document.getElementById("bhukkadChatFeed");
    if (!feed) return;
    for (const msg of history) {
      if (msg.role === "user") {
        const div = document.createElement("div");
        div.className = "flex justify-end";
        div.innerHTML = `
          <div class="bg-gradient-to-r from-primary to-[#ff6b00] text-white font-medium rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] shadow-md leading-relaxed text-xs sm:text-sm">
            ${escapeHtml(msg.content)}
          </div>
        `;
        feed.appendChild(div);
      } else if (msg.role === "assistant") {
        const div = document.createElement("div");
        div.className = "flex flex-col items-start gap-1 max-w-[90%]";
        div.innerHTML = `
          <div class="bg-[#241c19] border border-white/10 text-white/95 rounded-2xl rounded-tl-sm px-4 py-3 leading-relaxed shadow-sm text-xs sm:text-sm">
            <span class="ai-bubble-text">${escapeHtml(msg.content)}</span>
          </div>
        `;
        feed.appendChild(div);
      } else if (msg.role === "card" && msg.content) {
        renderCartToolCard(msg.content.dishName, msg.content.tier, msg.content.grandTotal, false);
      } else if (msg.role === "receipt" && msg.content) {
        renderWhatsAppReceiptCard(msg.content, false);
      } else if (msg.role === "system" && msg.content) {
        appendSystemMessage(msg.content, false);
      }
    }
    scrollToBottom();
  } catch (e) { /* ignore */ }
}

// Auto mount on document load
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", () => mountVoiceAssistant());
  } else {
    mountVoiceAssistant();
  }
}

