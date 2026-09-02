/* ==========================================================
   Pulse Voice AI Studio - Smallest.ai Inspired Interactive Controller
   ========================================================== */

const LS_KEYS = "voice_agent_keys";
const LS_BASE = "voice_agent_base";
const DEFAULT_BASE = window.VOICE_API_BASE || window.BHUKKAD_API_BASE || "http://localhost:8100";

const state = {
  base: localStorage.getItem(LS_BASE) || localStorage.getItem("bhukkad_pg_base") || DEFAULT_BASE,
  keys: loadKeys(),
  session: "studio-" + Math.random().toString(36).slice(2) + Date.now().toString(36),
  ws: null,
  
  // Voice Call state
  isCalling: false,
  callPhase: "idle", // idle | listening | recording | thinking | speaking
  stream: null,
  ac: null,
  analyser: null,
  micDataBuf: null,
  ttsAnalyser: null,
  ttsDataBuf: null,
  audioQueue: [],
  source: null,
  isPlaying: false,
  turnStartTs: 0,
  firstAudioTs: 0,
  lastBubble: null,
  cancelled: false,
  echoGain: 0.35,
  bargeFrames: 0,
  noiseFloor: 0.012,
  recorder: null,
  recChunks: [],
  lastVoiceTs: 0,
  
  // TTS Playground state
  selectedVoice: "Sarah",
  selectedProvider: "elevenlabs",
  ttsAudioBlob: null,
};

const $ = (id) => document.getElementById(id);

function loadKeys() {
  try {
    return JSON.parse(
      localStorage.getItem(LS_KEYS) || localStorage.getItem("bhukkad_pg_keys") || "{}"
    );
  } catch {
    return {};
  }
}

function saveKeys(keys) {
  state.keys = keys;
  localStorage.setItem(LS_KEYS, JSON.stringify(keys));
}

function authHeaders(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (state.keys.openai) h["X-OpenAI-Key"] = state.keys.openai;
  if (state.keys.gemini) h["X-Gemini-Key"] = state.keys.gemini;
  if (state.keys.elevenlabs) h["X-ElevenLabs-Key"] = state.keys.elevenlabs;
  return h;
}

function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// ==========================================================
// Tab Switching
// ==========================================================
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const target = $(btn.dataset.target);
      if (target) target.classList.add("active");
    });
  });
}

// ==========================================================
// WebSocket Connection (Real-Time Voice Engine)
// ==========================================================
function initWebSocket() {
  const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
  let wsUrl;
  try {
    const parsed = new URL(state.base);
    wsUrl = `${parsed.protocol === "https:" ? "wss:" : "ws:"}//${parsed.host}/ws/voice`;
  } catch {
    wsUrl = `${wsProto}//${location.host}/ws/voice`;
  }

  const badge = $("wsBadge");

  try {
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.onopen = () => {
      if (badge) {
        badge.classList.add("live");
        $("wsStatusText").textContent = "WebSocket: Sub-600ms Live";
      }
      syncSession();
    };

    ws.onmessage = async (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "ready") {
          state.session = ev.session_id || state.session;
        } else if (ev.type === "llm_delta") {
          if (state.lastBubble && !state.cancelled) {
            state.lastBubble.textContent += ev.delta;
            scrollTranscript();
          }
        } else if (ev.type === "audio") {
          if (!state.cancelled && ev.audio) {
            const buf = base64ToArrayBuffer(ev.audio);
            if (!state.firstAudioTs) {
              state.firstAudioTs = performance.now();
              setCallPhase("speaking", "Speaking (talk to interrupt)");
            }
            enqueueAudio(buf);
          }
        } else if (ev.type === "turn_done") {
          if (!state.cancelled) {
            const ttfa = state.firstAudioTs ? Math.round(state.firstAudioTs - state.turnStartTs) : 0;
            updateTelemetry(ev.latency, ttfa);
          }
        } else if (ev.type === "interrupted") {
          stopAudioPlayback();
        } else if (ev.type === "error") {
          if (state.lastBubble) state.lastBubble.textContent += ` [Error: ${ev.error}]`;
          setCallPhase("listening", "Listening...");
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (badge) {
        badge.classList.remove("live");
        $("wsStatusText").textContent = "WebSocket: Reconnecting...";
      }
      setTimeout(initWebSocket, 3000);
    };

    ws.onerror = () => {
      if (badge) badge.classList.remove("live");
    };
  } catch (e) {
    if (badge) $("wsStatusText").textContent = "WebSocket: Offline";
  }
}

function syncSession() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify({
    type: "init",
    session_id: state.session,
    config: {
      model_key: $("callModel")?.value || "openai-lite",
      tts_provider: state.selectedProvider,
      tts_voice: state.selectedVoice,
      use_rag: true,
      tools_enabled: true,
    },
    keys: state.keys,
  }));
}

// ==========================================================
// Web Audio API, Orb Animation & VAD
// ==========================================================
async function ensureAudioContext() {
  if (!state.ac) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.ac = new AudioCtx();
    state.ttsAnalyser = state.ac.createAnalyser();
    state.ttsAnalyser.fftSize = 128;
    state.ttsDataBuf = new Uint8Array(state.ttsAnalyser.frequencyBinCount);
  }
  if (!state.stream) {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    state.analyser = state.ac.createAnalyser();
    state.analyser.fftSize = 256;
    state.micDataBuf = new Uint8Array(state.analyser.frequencyBinCount);
    const micSrc = state.ac.createMediaStreamSource(state.stream);
    micSrc.connect(state.analyser);
  }
}

function micVolume() {
  if (!state.analyser || !state.micDataBuf) return 0;
  state.analyser.getByteTimeDomainData(state.micDataBuf);
  let sum = 0;
  for (let i = 0; i < state.micDataBuf.length; i++) {
    const v = (state.micDataBuf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / state.micDataBuf.length);
}

function ttsVolume() {
  if (!state.ttsAnalyser || !state.ttsDataBuf || !state.isPlaying) return 0;
  state.ttsAnalyser.getByteTimeDomainData(state.ttsDataBuf);
  let sum = 0;
  for (let i = 0; i < state.ttsDataBuf.length; i++) {
    const v = (state.ttsDataBuf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / state.ttsDataBuf.length);
}

function animateOrb() {
  const orbCore = $("orbCore");
  const orbContainer = $("orbContainer");
  if (!orbCore) return;

  const micLvl = micVolume();
  const ttsLvl = ttsVolume();
  const activeLvl = state.callPhase === "speaking" ? ttsLvl : micLvl;

  // Dynamic scaling with audio energy
  const scale = 1 + Math.min(0.4, activeLvl * 1.5);
  orbCore.style.transform = `scale(${scale})`;

  const now = performance.now();

  // Barge-In check while bot is speaking
  if (state.callPhase === "speaking") {
    const residual = micLvl - state.echoGain * ttsLvl;
    if (residual > 0.08 && now - state.firstAudioTs > 350) {
      state.bargeFrames++;
      if (state.bargeFrames >= 8) {
        bargeIn();
      }
    } else {
      state.bargeFrames = Math.max(0, state.bargeFrames - 1);
    }
  }

  // Server-side VAD recording logic
  if (state.isCalling && state.callPhase === "listening" && micLvl > 0.03) {
    beginRecording();
  } else if (state.callPhase === "recording") {
    if (micLvl > 0.03) state.lastVoiceTs = now;
    if (now - state.lastVoiceTs > 600) {
      endRecording();
    }
  }

  requestAnimationFrame(animateOrb);
}

function setCallPhase(phase, text) {
  state.callPhase = phase;
  const orbContainer = $("orbContainer");
  const statusEl = $("orbStatusText");
  const subtextEl = $("orbSubtext");

  if (orbContainer) {
    orbContainer.className = `orb-container ${phase}`;
  }
  if (statusEl) statusEl.textContent = text || phase;
  if (subtextEl) {
    subtextEl.textContent =
      phase === "listening"
        ? "Speak naturally, our AI is listening"
        : phase === "speaking"
        ? "AI is speaking (talk anytime to interrupt)"
        : phase === "recording"
        ? "Recording voice..."
        : phase === "thinking"
        ? "Generating response..."
        : "Tap Start Call to begin";
  }
}

// ==========================================================
// Conversational Voice Call Loop
// ==========================================================
async function toggleCall() {
  if (state.isCalling) {
    stopCall();
  } else {
    await startCall();
  }
}

async function startCall() {
  try {
    await ensureAudioContext();
    if (state.ac.state === "suspended") await state.ac.resume();
    state.isCalling = true;
    $("btnCall").classList.add("active");
    $("btnCall").innerHTML = `<span>🛑</span><span>End Call</span>`;
    setCallPhase("listening", "Listening...");
    animateOrb();
  } catch (e) {
    alert("Microphone permission required for Voice Agent: " + e.message);
  }
}

function stopCall() {
  state.isCalling = false;
  $("btnCall").classList.remove("active");
  $("btnCall").innerHTML = `<span>🎙️</span><span>Start Call</span>`;
  stopAudioPlayback();
  if (state.recorder && state.recorder.state !== "inactive") {
    try { state.recorder.stop(); } catch {}
  }
  setCallPhase("idle", "Ready to Talk");
}

function beginRecording() {
  state.recChunks = [];
  try {
    state.recorder = new MediaRecorder(state.stream, { mimeType: "audio/webm;codecs=opus" });
  } catch {
    state.recorder = new MediaRecorder(state.stream);
  }
  state.recorder.ondataavailable = (e) => { if (e.data.size) state.recChunks.push(e.data); };
  state.recorder.onstop = onRecordingStop;
  state.recorder.start();
  state.lastVoiceTs = performance.now();
  setCallPhase("recording", "Listening to you...");
}

function endRecording() {
  if (state.recorder && state.recorder.state !== "inactive") {
    state.recorder.stop();
  }
}

async function onRecordingStop() {
  const blob = new Blob(state.recChunks, { type: state.recorder.mimeType });
  if (blob.size < 1200) {
    setCallPhase("listening", "Listening...");
    return;
  }
  setCallPhase("thinking", "Transcribing & Thinking...");
  const fd = new FormData();
  fd.append("provider", "openai");
  fd.append("file", blob, "audio.webm");

  try {
    const r = await fetch(state.base + "/asr", { method: "POST", headers: authHeaders(), body: fd });
    const d = await r.json();
    if (!d.text) {
      setCallPhase("listening", "Listening...");
      return;
    }
    addTranscriptBubble("user", d.text);
    triggerVoiceTurn(d.text, d.asr_ms || 0);
  } catch (e) {
    setCallPhase("listening", "ASR error: " + e.message);
  }
}

function triggerVoiceTurn(text, asrMs) {
  state.cancelled = false;
  state.turnStartTs = performance.now();
  state.firstAudioTs = 0;
  state.lastBubble = addTranscriptBubble("agent", "");

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    syncSession();
    state.ws.send(JSON.stringify({ type: "prompt", text, asr_ms: asrMs }));
  }
}

function bargeIn() {
  stopAudioPlayback();
  if (state.lastBubble) state.lastBubble.classList.add("cancelled");
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "interrupt" }));
  }
  setCallPhase("listening", "Interrupted! Listening...");
}

// ==========================================================
// Audio Playback Queue
// ==========================================================
async function enqueueAudio(arrayBuffer) {
  if (state.cancelled) return;
  try {
    const audioBuf = await state.ac.decodeAudioData(arrayBuffer.slice(0));
    state.audioQueue.push(audioBuf);
    if (!state.isPlaying) playNextAudio();
  } catch {}
}

function playNextAudio() {
  if (state.cancelled) {
    state.audioQueue = [];
    state.isPlaying = false;
    return;
  }
  const buf = state.audioQueue.shift();
  if (!buf) {
    state.isPlaying = false;
    if (state.isCalling && state.callPhase === "speaking") {
      setCallPhase("listening", "Listening...");
    }
    return;
  }
  state.isPlaying = true;
  const src = state.ac.createBufferSource();
  src.buffer = buf;
  src.connect(state.ttsAnalyser);
  state.ttsAnalyser.connect(state.ac.destination);
  src.onended = () => {
    state.source = null;
    playNextAudio();
  };
  state.source = src;
  src.start();
}

function stopAudioPlayback() {
  state.cancelled = true;
  state.audioQueue = [];
  if (state.source) {
    try { state.source.onended = null; state.source.stop(); } catch {}
    state.source = null;
  }
  state.isPlaying = false;
}

function addTranscriptBubble(role, text) {
  const feed = $("transcriptFeed");
  if (!feed) return null;
  const bubble = document.createElement("div");
  bubble.className = `msg-bubble msg-${role}`;
  bubble.textContent = text;
  feed.appendChild(bubble);
  scrollTranscript();
  return bubble;
}

function scrollTranscript() {
  const feed = $("transcriptFeed");
  if (feed) feed.scrollTop = feed.scrollHeight;
}

// ==========================================================
// TAB 2: Lightning TTS Playground (Smallest.ai Waves style)
// ==========================================================
const VOICES = [
  { id: "alloy", name: "Alloy", tag: "Warm & Natural", icon: "🧑", provider: "openai" },
  { id: "echo", name: "Echo", tag: "Authoritative", icon: "👨", provider: "openai" },
  { id: "fable", name: "Fable", tag: "Expressive Story", icon: "👩", provider: "openai" },
  { id: "onyx", name: "Onyx", tag: "Deep & Crisp", icon: "👨", provider: "openai" },
  { id: "nova", name: "Nova", tag: "Energetic Female", icon: "👩", provider: "openai" },
  { id: "shimmer", name: "Shimmer", tag: "Clear & Soft", icon: "👩", provider: "openai" },
];

function initTTSPlayground() {
  const grid = $("voiceCardsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  VOICES.forEach((v) => {
    const card = document.createElement("div");
    card.className = `voice-card ${v.id === state.selectedVoice ? "selected" : ""}`;
    card.innerHTML = `
      <div class="voice-avatar">${v.icon}</div>
      <div class="voice-name">${v.name}</div>
      <div class="voice-tag">${v.tag}</div>
    `;
    card.addEventListener("click", () => {
      document.querySelectorAll(".voice-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      state.selectedVoice = v.id;
      state.selectedProvider = v.provider;
      syncSession();
    });
    grid.appendChild(card);
  });

  $("btnGenerateTTS")?.addEventListener("click", generateTTS);
  $("btnDownloadTTS")?.addEventListener("click", downloadTTSAudio);
}

async function generateTTS() {
  const text = $("ttsInputText")?.value.trim();
  if (!text) return;
  await ensureAudioContext();
  if (state.ac.state === "suspended") await state.ac.resume();

  const statusBadge = $("ttsLatencyBadge");
  if (statusBadge) statusBadge.textContent = "Synthesizing...";

  const t0 = performance.now();
  try {
    const r = await fetch(state.base + "/tts", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        text,
        provider: state.selectedProvider,
        voice: state.selectedVoice,
      }),
    });
    if (!r.ok) {
      if (statusBadge) statusBadge.textContent = "TTS Error";
      return;
    }
    const ttsMs = Number(r.headers.get("X-TTS-Ms") || Math.round(performance.now() - t0));
    const arrayBuf = await r.arrayBuffer();
    state.ttsAudioBlob = new Blob([arrayBuf], { type: "audio/mpeg" });

    if (statusBadge) statusBadge.textContent = `Generated in ${ttsMs}ms ⚡`;
    $("btnDownloadTTS")?.removeAttribute("disabled");

    // Play synthesized audio
    stopAudioPlayback();
    state.cancelled = false;
    enqueueAudio(arrayBuf);
    drawAudioWaveform();
  } catch (e) {
    if (statusBadge) statusBadge.textContent = "Failed: " + e.message;
  }
}

function downloadTTSAudio() {
  if (!state.ttsAudioBlob) return;
  const url = URL.createObjectURL(state.ttsAudioBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `voice-${state.selectedVoice}-${Date.now()}.mp3`;
  a.click();
}

function drawAudioWaveform() {
  const canvas = $("ttsWaveformCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.offsetWidth);
  const H = (canvas.height = canvas.offsetHeight);

  function draw() {
    if (!state.isPlaying) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    requestAnimationFrame(draw);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0, 242, 254, 0.6)";
    const barCount = 48;
    const barW = W / barCount - 2;
    for (let i = 0; i < barCount; i++) {
      const h = Math.random() * H * (0.2 + ttsVolume() * 1.5);
      ctx.fillRect(i * (barW + 2), (H - h) / 2, barW, h);
    }
  }
  draw();
}

// ==========================================================
// TAB 3: Knowledge Base (Instant RAG Ingestion)
// ==========================================================
function initKnowledgeBase() {
  const dropzone = $("dropzone");
  const fileInput = $("ragFileInput");

  dropzone?.addEventListener("click", () => fileInput?.click());
  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
  });

  fileInput?.addEventListener("change", () => {
    if (fileInput.files.length) uploadFile(fileInput.files[0]);
  });

  $("btnRagQuery")?.addEventListener("click", queryRAG);
}

async function uploadFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    const dropDesc = $("dropzoneDesc");
    if (dropDesc) dropDesc.textContent = `Uploading ${file.name}...`;

    try {
      const r = await fetch(state.base + "/rag/ingest", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          filename: file.name,
          content,
          rebuild_rag: true,
        }),
      });
      const d = await r.json();
      if (dropDesc) dropDesc.textContent = `✓ Ingested ${file.name} successfully! (Indexed in FAISS)`;
      loadRagStatus();
    } catch (err) {
      if (dropDesc) dropDesc.textContent = "Upload failed: " + err.message;
    }
  };
  reader.readAsText(file);
}

async function queryRAG() {
  const q = $("ragQueryInput")?.value.trim();
  if (!q) return;
  const resultBox = $("ragQueryResult");
  if (resultBox) resultBox.textContent = "Searching FAISS vector index...";

  try {
    const r = await fetch(state.base + "/rag/query", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query: q, top_k: 4 }),
    });
    const d = await r.json();
    if (resultBox) {
      resultBox.innerHTML = (d.results || [])
        .map((res) => `<div class="doc-item-card"><b>${res.heading || res.doc}</b> (score: ${res.score.toFixed(3)})<p style="font-size:0.8rem;color:#94a3b8;margin-top:4px;">${res.text.slice(0, 180)}...</p></div>`)
        .join("");
    }
  } catch (e) {
    if (resultBox) resultBox.textContent = "Query failed: " + e.message;
  }
}

async function loadRagStatus() {
  try {
    const r = await fetch(state.base + "/rag/status");
    const d = await r.json();
    $("ragDocCount").textContent = `${d.chunks || 0} chunks indexed in FAISS`;
  } catch {}
}

// ==========================================================
// TAB 4 & 5: Tools & Live Telemetry
// ==========================================================
async function loadTools() {
  const grid = $("toolsGrid");
  if (!grid) return;
  try {
    const r = await fetch(state.base + "/tools");
    const d = await r.json();
    grid.innerHTML = (d.tools || []).map((t) => `
      <div class="tool-card">
        <div class="tool-header">
          <span class="tool-name">${t.name}</span>
          <label class="switch">
            <input type="checkbox" checked data-tool="${t.name}" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="tool-desc">${t.description}</div>
      </div>
    `).join("");
  } catch {}
}

function updateTelemetry(lat = {}, ttfa = 0) {
  const asr = lat.asr_ms || 0;
  const llm = lat.llm_total_ms || 0;
  const tts = lat.tts_ms || 0;
  const rag = lat.rag_ms || 0;
  const total = ttfa || asr + llm + tts;

  $("valTTFA").textContent = `${Math.round(total)}ms`;
  $("valASR").textContent = `${Math.round(asr)}ms`;
  $("valLLM").textContent = `${Math.round(llm)}ms`;
  $("valTTS").textContent = `${Math.round(tts)}ms`;
  $("valRAG").textContent = `${Math.round(rag)}ms`;

  $("barASR").style.width = Math.min(100, (asr / total) * 100) + "%";
  $("barLLM").style.width = Math.min(100, (llm / total) * 100) + "%";
  $("barTTS").style.width = Math.min(100, (tts / total) * 100) + "%";
  $("barRAG").style.width = Math.min(100, (rag / total) * 100) + "%";
}

// ==========================================================
// Studio Initialization
// ==========================================================
function initStudio() {
  initTabs();
  initTTSPlayground();
  initKnowledgeBase();
  loadTools();
  loadRagStatus();
  initWebSocket();

  $("btnCall")?.addEventListener("click", toggleCall);
}

window.addEventListener("DOMContentLoaded", initStudio);
