// ============================================================
// রিল কারখানা — বাংলা স্ক্রিপ্ট থেকে ভিডিও তৈরি
// সম্পূর্ণ ক্লায়েন্ট-সাইড অ্যাসেম্বলি (FFmpeg.wasm), Netlify Functions
// শুধু Groq/OpenRouter/Pexels/Pixabay API প্রক্সি করার জন্য ব্যবহৃত হয়।
// ============================================================

import { t, getLang, setLang, applyI18n, onLangChange } from "./i18n.js?v=20261015";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- ভাষা-সচেতন স্ট্যাটাস মেসেজ ----------
// parts: [{key, params}] বা [{raw}] — ভাষা বদলালে নতুন ভাষায় আবার আঁকা হয়
const msgEls = new Set();
function renderParts(parts) {
  return parts.map((p) => (p.raw !== undefined ? p.raw : t(p.key, p.params))).join(" — ");
}
function setMsg(el, parts, cls) {
  if (!Array.isArray(parts)) parts = parts ? [parts] : [];
  el._msg = parts;
  msgEls.add(el);
  if (cls !== undefined) el.className = cls;
  el.textContent = renderParts(parts);
}
function refreshMsgs() {
  msgEls.forEach((el) => {
    if (el._msg) el.textContent = renderParts(el._msg);
  });
}

// স্থির লেখাগুলো (data-i18n) বর্তমান ভাষায় বসানো হচ্ছে
applyI18n();

// ---------- state ----------
const state = {
  keys: { groq: "", openrouter: "", pexels: "", pixabay: "", shotstack: "", geminiTranscribe: "", pollinations: "", pollModel: "", ghToken: "", ghRepo: "" },
  audioFile: null,
  bgMusicFile: null,
  segments: [], // {id, start, end, startSec, endSec, duration, text, query, entity, mediaType, media:{source,url,thumb,file}}
};

// ---------- persisted keys ----------
function loadKeys() {
  try {
    const raw = localStorage.getItem("rk_keys");
    if (raw) state.keys = { ...state.keys, ...JSON.parse(raw) };
  } catch (_) {}
  $("#groqKey").value = state.keys.groq || "";
  $("#openrouterKey").value = state.keys.openrouter || "";
  $("#pexelsKey").value = state.keys.pexels || "";
  $("#pixabayKey").value = state.keys.pixabay || "";
  $("#shotstackKey").value = state.keys.shotstack || "";
  $("#geminiTranscribeKey").value = state.keys.geminiTranscribe || "";
  $("#pollinationsKey").value = state.keys.pollinations || "";
  $("#pollinationsModel").value = state.keys.pollModel || "";
  $("#ghToken").value = state.keys.ghToken || "";
  $("#ghRepo").value = state.keys.ghRepo || "";
}
function saveKeys() {
  state.keys.groq = $("#groqKey").value.trim();
  state.keys.openrouter = $("#openrouterKey").value.trim();
  state.keys.pexels = $("#pexelsKey").value.trim();
  state.keys.pixabay = $("#pixabayKey").value.trim();
  state.keys.shotstack = $("#shotstackKey").value.trim();
  state.keys.geminiTranscribe = $("#geminiTranscribeKey").value.trim();
  state.keys.pollinations = $("#pollinationsKey").value.trim();
  state.keys.pollModel = $("#pollinationsModel").value.trim();
  state.keys.ghToken = $("#ghToken").value.trim();
  state.keys.ghRepo = $("#ghRepo").value.trim();
  localStorage.setItem("rk_keys", JSON.stringify(state.keys));
  const el = $("#keysStatus");
  if (!(state.keys.groq || state.keys.openrouter) || !state.keys.pexels || !state.keys.shotstack) {
    setMsg(el, { key: "keysNeed" }, "status-line err");
  } else {
    setMsg(el, { key: "keysSaved" }, "status-line ok");
    markStepDone(1);
    toast(t("keysSaved"));
    markStepDone(1);
  }
}

// ---------- step indicator ----------
// ---------- wizard / stepper ----------
const wiz = { active: 2, done: new Set(), max: 2 };
function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = "toast" + (type === "err" ? " err" : "");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
function panelFor(n) {
  return n <= 2 ? 2 : n <= 4 ? 4 : 5;
}
function renderStepper() {
  $$(".rail-steps li, .m-steps li").forEach((li) => {
    const n = Number(li.dataset.step);
    const isDone = wiz.done.has(n) && n !== wiz.active;
    li.classList.toggle("done", isDone);
    li.classList.toggle("active", n === wiz.active);
    li.classList.toggle("clickable", n === 1 || n <= wiz.max);
    li.querySelector(".ind").textContent = isDone ? "✓" : n === wiz.active ? "●" : "○";
  });
  $$(".step-of").forEach((el) => (el.textContent = t("stepOf", { n: wiz.active })));
  $$(".step-name").forEach((el) => (el.textContent = t("step" + wiz.active)));
}
function goStep(n) {
  wiz.active = n;
  wiz.max = Math.max(wiz.max, n);
  document.body.dataset.step = String(panelFor(n));
  renderStepper();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function markStepDone(n) {
  wiz.done.add(n);
  renderStepper();
}
function markStepActive(n) {
  for (let k = 1; k < n; k++) if (k !== 1 || wiz.done.has(1) || n > 2) wiz.done.add(k);
  wiz.active = n;
  wiz.max = Math.max(wiz.max, n);
  if (n >= 4) document.body.dataset.step = String(panelFor(n));
  renderStepper();
}
$$(".rail-steps li, .m-steps li").forEach((li) =>
  li.addEventListener("click", () => {
    const n = Number(li.dataset.step);
    if (n === 1) return openSettings();
    if (n > wiz.max) return;
    if (n === 3 && !state.segments.length) return goStep(2);
    goStep(n);
  })
);

// ---------- timestamp parsing ----------
function tsToSeconds(ts) {
  const parts = ts.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function parseScript(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const segments = [];
  lines.forEach((line, idx) => {
    const [timePart, ...rest] = line.split("|");
    const text = rest.join("|").trim();
    if (!timePart || !text) return;
    const [startRaw, endRaw] = timePart.split("-").map((s) => s.trim());
    const startSec = tsToSeconds(startRaw);
    const endSec = tsToSeconds(endRaw);
    if (startSec === null || endSec === null || endSec <= startSec) return;
    segments.push({
      id: `seg_${idx}`,
      start: startRaw,
      end: endRaw,
      startSec,
      endSec,
      duration: endSec - startSec,
      text,
      query: "",
      entity: "",
      mediaType: "video",
      media: null,
    });
  });
  return segments;
}

// ---------- render segment timeline ----------
function segStatus(seg) {
  if (seg.status === "searching") return "searching";
  if (seg.media) return "ready";
  return seg.status === "none" ? "none" : "attention";
}
const ST_KEY = { ready: "stReady", searching: "stSearching", none: "stNone", attention: "stAttention" };

function mediaTag(src, type, cls = "") {
  return type === "video"
    ? `<video src="${escapeAttr(src)}" muted playsinline preload="metadata" class="${cls}"></video>`
    : `<img src="${escapeAttr(src)}" alt="" loading="lazy" class="${cls}" />`;
}

function renderSegments() {
  const list = $("#segmentsList");
  list.innerHTML = "";
  state.segments.forEach((seg, idx) => {
    const st = segStatus(seg);
    const row = document.createElement("article");
    row.className = "segment scene st-" + st;
    row.dataset.id = seg.id;
    const preview = seg.media
      ? mediaTag(seg.media.thumb || seg.media.url, seg.media.source === "upload" ? seg.media.type : "photo") + `<span class="badge">${seg.media.type === "video" ? t("mVideo") : t("mPhoto")}</span>`
      : `<span class="placeholder">${t(st === "searching" ? "stSearching" : "notPicked")}</span>`;
    const choices = (seg.choices || []).length > 1
      ? `<div class="choices"><small>${t("choicesLabel")}</small>${seg.choices
          .map((c, i) => `<button type="button" class="choice${seg.media && seg.media.url === c.downloadUrl ? " selected" : ""}" data-i="${i}">${mediaTag(c.thumb || c.downloadUrl, "photo")}</button>`)
          .join("")}</div>`
      : "";
    row.innerHTML = `
      <div class="scene-head">
        <span class="scene-no">${t("sceneNo", { n: idx + 1 })}</span>
        <span class="scene-time">${seg.start} – ${seg.end} · ${seg.duration}s</span>
        <span class="pill">${t(ST_KEY[st])}</span>
      </div>
      <div class="scene-main">
        <div class="segment-media" role="button" tabindex="0" aria-label="${t("pickMediaAria")}">${preview}</div>
        <div class="scene-info">
          <p class="segment-text">${escapeHtml(seg.text)}</p>
          <label class="q-label">${t("qLabel")} ${seg.entity ? `<span class="chip entity">${escapeHtml(seg.entity)}</span>` : ""}</label>
          <input type="text" class="query-input" readonly value="${escapeAttr(seg.query)}" placeholder="${t("queryPlaceholder")}" />
          <div class="scene-actions">
            <button type="button" class="btn btn-secondary edit-btn">✎ ${t("editQ")}</button>
            <button type="button" class="btn btn-secondary regen-btn">↻ ${t("regenQ")}</button>
            <button type="button" class="btn btn-secondary research-btn">🔍 ${t("researchBtn")}</button>
            <button type="button" class="btn btn-secondary upload-btn">⤒ ${t("uploadBtn")}</button>
            <button type="button" class="btn btn-secondary ai-btn">✨ ${t("aiBtn")}</button>
          </div>
        </div>
      </div>${choices}`;

    const input = row.querySelector(".query-input");
    input.addEventListener("input", (e) => (seg.query = e.target.value));
    const commit = () => {
      if (!input.readOnly) {
        input.readOnly = true;
        fillSegment(seg, [seg.query]).then(renderSegments);
      }
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && commit());
    input.addEventListener("blur", commit);
    row.querySelector(".edit-btn").addEventListener("click", () => {
      input.readOnly = false;
      input.focus();
      input.select();
    });
    row.querySelector(".regen-btn").addEventListener("click", () => {
      const qs = seg.allQueries && seg.allQueries.length ? seg.allQueries : [seg.text];
      seg.qIdx = ((seg.qIdx || 0) + 1) % qs.length;
      fillSegment(seg, [qs[seg.qIdx], ...qs.filter((_, i) => i !== seg.qIdx)]).then(renderSegments);
    });
    row.querySelector(".research-btn").addEventListener("click", () => openPicker(seg));
    row.querySelector(".upload-btn").addEventListener("click", () => {
      activeSeg = seg;
      $("#pickerUpload").click();
    });
    row.querySelector(".ai-btn").addEventListener("click", (e) => generateAiImage(seg, e.currentTarget));
    row.querySelector(".segment-media").addEventListener("click", () => openPicker(seg));
    row.querySelectorAll(".choice").forEach((b) =>
      b.addEventListener("click", () => {
        applyMediaChoice(seg, seg.choices[Number(b.dataset.i)]);
        seg.status = "ready";
        renderSegments();
      })
    );
    list.appendChild(row);
  });
  $("#timeline").hidden = state.segments.length === 0;
  updateSummaries();
  refreshBuildAvailability();
}

function fmtDur(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}
function updateSummaries() {
  const total = state.segments.length;
  const ready = state.segments.filter((s) => s.media).length;
  $("#sceneProgress").textContent = t("scenesReady", { a: ready, b: total });
  $("#sceneBar").style.width = total ? `${(ready / total) * 100}%` : "0%";
  $("#toRenderBtn").disabled = !total || ready < total;
  const end = total ? Math.max(...state.segments.map((s) => s.endSec)) : 0;
  $("#sumDuration").textContent = total ? fmtDur(end) : "–";
  $("#sumScenes").textContent = total || "–";
  const q = $("#resSelect").selectedOptions[0];
  $("#sumRes").textContent = q ? `${q.value.split("x")[1]}p · ${$("#aspectSelect").value}` : "–";
}
["#resSelect", "#aspectSelect"].forEach((id) => $(id).addEventListener("change", updateSummaries));

// ফরম্যাট (অ্যাসপেক্ট রেশিও): স্ক্রিপ্ট ধাপের সিলেক্ট ও Advanced Settings-এর সিলেক্ট সবসময় একসাথে থাকে
(function syncAspect() {
  const main = $("#aspectSelect");
  const top = $("#aspectTop");
  top.value = main.value;
  top.addEventListener("change", () => {
    main.value = top.value;
    updateSummaries();
  });
  main.addEventListener("change", () => (top.value = main.value));
})();

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s || "");
}

function isRateLimitError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("rate-limit") ||
    m.includes("429") ||
    m.includes("resource_exhausted") ||
    m.includes("too many requests")
  );
}

function startCooldown(btn, seconds = 40) {
  // বাটনের আসল লেখা বর্তমান ভাষা থেকে নেওয়া হচ্ছে, তাই কুলডাউনের মাঝে ভাষা বদলালেও ঠিক থাকে
  const labelOf = () => (btn.dataset.i18n ? t(btn.dataset.i18n) : btn.textContent);
  let remaining = seconds;
  btn.disabled = true;
  const tick = () => {
    if (remaining <= 0) {
      btn.disabled = false;
      btn.textContent = labelOf();
      return;
    }
    btn.textContent = `${labelOf()} (${remaining}s)`;
    remaining--;
    setTimeout(tick, 1000);
  };
  tick();
}

// ---------- audio input (manual transcription trigger) ----------
function renderAudioMeta() {
  const info = state.audioInfo;
  const base = info ? (info.seconds != null ? `${info.name} — ${info.seconds} ${t("secUnit")}` : info.name) : "";
  const notes = (state.audioNotes || []).map((p) => renderParts([p]));
  $("#audioMeta").textContent = [base, ...notes].filter(Boolean).join(" — ");
  $("#audioMeta").classList.toggle("err", Boolean(state.audioErr));
}
function setAudioNotes(parts, isErr = false) {
  state.audioNotes = parts;
  state.audioErr = isErr; // ব্যর্থ / API ব্যস্ত হলে লাল লেখা
  renderAudioMeta();
}

// ড্র্যাগ-অ্যান্ড-ড্রপ + নির্বাচিত ফাইলের অবস্থা দেখানো
(function initAudioDrop() {
  const zone = $("#audioDrop");
  const input = $("#audioInput");
  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
    })
  );
  zone.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (f.type && !f.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|opus|flac|wma|webm)$/i.test(f.name)) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
})();

$("#audioInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("#audioDrop").classList.add("has-file");
  $("#audioDefaultNote").hidden = true;
  state.audioFile = file;
  const url = URL.createObjectURL(file);
  const a = new Audio(url);
  state.audioInfo = { name: file.name, seconds: null }; // ফাইলের নাম সাথে সাথেই দেখানো হয়, সময়কাল পরে যোগ হয়
  state.audioNotes = [];
  state.audioErr = false;
  renderAudioMeta();
  a.addEventListener("loadedmetadata", () => {
    state.audioInfo = { name: file.name, seconds: Math.round(a.duration) };
    renderAudioMeta();
  });
  refreshBuildAvailability();
  $("#transcribeBtn").disabled = false;
});

$("#transcribeBtn").addEventListener("click", () => {
  if (state.audioFile) autoTranscribeAudio(state.audioFile);
});

const MAX_SEGMENT_SEC = 20; // প্রতিটা ট্রান্সক্রিপ্ট সেগমেন্ট এর বেশি লম্বা হবে না

const TRANSCRIBE_MAX_BYTES = 12 * 1024 * 1024; // Gemini/OpenRouter-এর inline অডিও লিমিটের মধ্যে নিরাপদ সীমা

function secToClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TRANSCRIBE_PROMPT = `এই বাংলা অডিওটা মনোযোগ দিয়ে শুনে হুবহু ট্রান্সক্রাইব করো (অনুবাদ না, যা বলা হয়েছে ঠিক তাই লেখো, বানান শুদ্ধভাবে লেখো)।

স্বাভাবিক থামা/বিরতি অনুযায়ী পুরো অডিওটাকে ছোট ছোট অংশে ভাগ করো, প্রতিটা অংশ সাধারণত ৩-৮ সেকেন্ড রাখার চেষ্টা করো — কিন্তু কোনো অবস্থাতেই কোনো একটা অংশ ২০ সেকেন্ডের বেশি লম্বা করবে না; কোনো বাক্য দীর্ঘ হলে সেটাকেও একাধিক অংশে ভেঙে দাও। প্রতিটা অংশের জন্য অডিওর মধ্যে আসল শুরু ও শেষ সময় (mm:ss ফরম্যাটে) দাও।

শুধু JSON আউটপুট দাও, অন্য কিছু না, এই স্কিমায়:
[{"start":"00:00","end":"00:05","text":"..."},{"start":"00:05","end":"00:11","text":"..."}]`;

// Gemini নির্দেশ উপেক্ষা করে ফেললেও ২০ সেকেন্ডের সীমা নিশ্চিত করতে
// কোড থেকে জোর করে ভেঙে দেওয়া হচ্ছে।
function splitLongSegments(segments, maxSec = MAX_SEGMENT_SEC) {
  const out = [];
  segments.forEach((seg) => {
    const dur = seg.end - seg.start;
    if (dur <= maxSec) {
      out.push(seg);
      return;
    }
    const parts = Math.ceil(dur / maxSec);
    const words = seg.text.split(/\s+/).filter(Boolean);
    const perPart = Math.max(1, Math.ceil(words.length / parts));
    for (let i = 0; i < parts; i++) {
      const pStart = seg.start + (dur / parts) * i;
      const pEnd = i === parts - 1 ? seg.end : seg.start + (dur / parts) * (i + 1);
      const slice = words.slice(i * perPart, (i + 1) * perPart).join(" ") || seg.text;
      out.push({ start: pStart, end: pEnd, text: slice });
    }
  });
  return out;
}

// ---------- ট্রান্সক্রিপশন: Gemini (প্রধান) → OpenRouter (ফলব্যাক, মডেল-চেইন) ----------
const GEMINI_TR_MODEL = "gemini-3.6-flash";

// OpenRouter অডিও-মডেল চেইন: বামে হালকা/দ্রুত → ডানে বেশি শক্তিশালী। OpenRouter-এ নেই এমন মডেল নিজে থেকেই বাদ যায়।
const OR_AUDIO_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro",
  "google/gemini-3-pro-preview",
  "openai/gpt-4o-audio-preview",
];

function audioFormatOf(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const byExt = { mp3: "mp3", wav: "wav", m4a: "m4a", aac: "aac", ogg: "ogg", oga: "ogg", flac: "flac", aiff: "aiff", aif: "aiff", mp4: "m4a" };
  if (byExt[ext]) return byExt[ext];
  const mime = (file.type || "").toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "mp3";
}

// মডেলের টেক্সট আউটপুট থেকে সেগমেন্ট অ্যারে বের করা; ব্যর্থ হলে এরর (যাতে পরের মডেল/প্রোভাইডারে যাওয়া যায়)
function parseTranscriptJson(text) {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (_) {
    const a = cleaned.indexOf("[");
    const b = cleaned.lastIndexOf("]");
    if (a < 0 || b <= a) throw new Error(t("errEmptyTr"));
    data = JSON.parse(cleaned.slice(a, b + 1));
  }
  if (data && !Array.isArray(data) && Array.isArray(data.segments)) data = data.segments;
  if (!Array.isArray(data)) throw new Error(t("errEmptyTr"));
  const valid = data.filter((s) => s && s.start && s.end && s.text);
  if (!valid.length) throw new Error(t("errEmptyTr"));
  return valid;
}

async function transcribeViaGemini(file, base64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TR_MODEL}:generateContent?key=${encodeURIComponent(state.keys.geminiTranscribe)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ inline_data: { mime_type: file.type || "audio/mpeg", data: base64 } }, { text: TRANSCRIBE_PROMPT }],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || t("errTranscribe"));
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(t("errNoTranscript"));
  return parseTranscriptJson(text);
}

async function openRouterAudioChain() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const ids = new Set(((await res.json())?.data || []).map((m) => m.id));
      const alive = OR_AUDIO_MODELS.filter((m) => ids.has(m));
      if (alive.length) return alive;
    }
  } catch (_) {}
  return OR_AUDIO_MODELS;
}

async function transcribeViaOpenRouter(file, base64, onModel) {
  const chain = await openRouterAudioChain();
  const format = audioFormatOf(file);
  const errors = [];
  for (const model of chain) {
    onModel && onModel(model);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.keys.openrouter}`,
          "HTTP-Referer": location.origin,
          "X-Title": "Reel Factory",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 16000,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: TRANSCRIBE_PROMPT },
                { type: "input_audio", input_audio: { data: base64, format } },
              ],
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        const err = new Error(data?.error?.message || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      let text = data?.choices?.[0]?.message?.content;
      if (Array.isArray(text)) text = text.map((p) => p?.text || "").join("");
      if (!text) throw new Error(t("errNoTranscript"));
      if (data?.choices?.[0]?.finish_reason === "length") throw new Error("output truncated");
      return { rawSegments: parseTranscriptJson(text), model };
    } catch (e) {
      errors.push(`${model}: ${e.message}`);
      if (e.status === 401) break; // চাবি ভুল — বাকি মডেলে চেষ্টা বৃথা
    }
  }
  throw new Error(errors.slice(-3).join(" ; "));
}

async function autoTranscribeAudio(file) {
  let rateLimited = false;
  if (!state.keys.geminiTranscribe && !state.keys.openrouter) {
    setAudioNotes([{ key: "noTrKey" }]);
    return;
  }
  if (file.size > TRANSCRIBE_MAX_BYTES) {
    setAudioNotes([{ key: "fileTooBig", params: { mb: (file.size / 1024 / 1024).toFixed(1) } }]);
    return;
  }

  $("#transcribeBtn").disabled = true;

  try {
    const base64 = await fileToBase64(file);
    let rawSegments = null;
    let usedModel = "";
    const errors = [];

    // ১) Gemini (প্রধান)
    if (state.keys.geminiTranscribe) {
      setAudioNotes([{ key: "transcribing", params: { name: "Gemini" } }]);
      try {
        rawSegments = await transcribeViaGemini(file, base64);
      } catch (e) {
        errors.push(`Gemini: ${e.message}`);
      }
    }

    // ২) OpenRouter (ফলব্যাক) — একটা মডেল ব্যর্থ হলে পরের শক্তিশালী মডেল
    if (!rawSegments && state.keys.openrouter) {
      setAudioNotes([{ key: "transcribing", params: { name: "OpenRouter" } }]);
      try {
        const r = await transcribeViaOpenRouter(file, base64, (m) =>
          setAudioNotes([{ key: "transcribing", params: { name: `OpenRouter · ${m}` } }])
        );
        rawSegments = r.rawSegments;
        usedModel = r.model;
      } catch (e) {
        errors.push(`OpenRouter: ${e.message}`);
      }
    }

    if (!rawSegments) throw new Error(errors.join(" | ") || t("errTranscribe"));

    // convert "mm:ss" strings to seconds so the segment shape matches what scriptLines expects
    let segments = rawSegments.map((s) => ({ start: tsToSeconds(s.start), end: tsToSeconds(s.end), text: String(s.text) }));

    segments = splitLongSegments(segments);

    const scriptLines = segments
      .map((s) => `${secToClock(s.start)}-${secToClock(s.end)} | ${s.text.trim()}`)
      .filter((line) => !line.endsWith("| "))
      .join("\n");
    $("#scriptInput").value = scriptLines;

    const notes = [{ key: "trReady", params: { n: segments.length } }];
    if (usedModel) notes.push({ key: "trViaOr", params: { model: usedModel } });
    setAudioNotes(notes);
  } catch (err) {
    setAudioNotes([{ key: "trFail", params: { msg: err.message } }], true);
    if (isRateLimitError(err.message)) {
      setAudioNotes([...state.audioNotes, { key: "rateLimit" }], true);
      rateLimited = true;
      startCooldown($("#transcribeBtn"), 40);
    }
  } finally {
    if (!rateLimited) $("#transcribeBtn").disabled = false;
  }
}

// ---------- keys save ----------
$("#saveKeysBtn").addEventListener("click", saveKeys);
loadKeys();

// ---------- collapsible API keys panel ----------
const keysToggleBtn = $("#keysToggleBtn");
const keysBody = $("#keysBody");
function setKeysCollapsed() {} // চাবির অংশ এখন Settings-এর ভেতরে, সবসময় খোলা
// প্রথমবার যদি প্রয়োজনীয় চাবিগুলো আগে থেকেই সংরক্ষিত থাকে, প্যানেলটা গুটিয়ে রাখা হচ্ছে
const keysOk = Boolean((state.keys.groq || state.keys.openrouter) && state.keys.pexels && state.keys.shotstack);
if (keysOk) wiz.done.add(1);

// ---------- Settings modal ----------
function openSettings() {
  $("#settingsModal").hidden = false;
}
$("#openSettings").addEventListener("click", openSettings);
$("#settingsClose").addEventListener("click", () => ($("#settingsModal").hidden = true));
$("#settingsModal").addEventListener("click", (e) => {
  if (e.target.id === "settingsModal") $("#settingsModal").hidden = true;
});
if (!keysOk) openSettings(); // প্রথমবার: আগে চাবি বসানোর জন্য
renderStepper();

// ---------- analyze script (calls /api/keywords -> Groq, ব্যর্থ হলে OpenRouter) ----------
$("#analyzeBtn").addEventListener("click", async () => {
  const analyzeBtn = $("#analyzeBtn");
  const raw = $("#scriptInput").value;
  const segments = parseScript(raw);
  const statusEl = $("#analyzeStatus");

  if (!segments.length) {
    setMsg(statusEl, { key: "noValidSeg" }, "status-line err");
    return;
  }
  if (!state.keys.groq && !state.keys.openrouter) {
    setMsg(statusEl, { key: "needGemini" }, "status-line err");
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.classList.add("loading");
  state.segments = segments;
  setMsg(statusEl, { key: "analyzing", params: { n: segments.length } }, "status-line");
  markStepActive(3);

  try {
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groqKey: state.keys.groq,
        openrouterKey: state.keys.openrouter,
        segments: segments.map((s) => ({ id: s.id, text: s.text, duration: s.duration })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("errAnalyze"));

    const byId = new Map(data.segments.map((d) => [d.id, d]));
    state.segments.forEach((seg) => {
      const d = byId.get(seg.id);
      if (d) {
        seg.query = (d.queries && d.queries[0]) || seg.text;
        seg.allQueries = d.queries || [seg.text];
        seg.entity = d.entity || "";
        seg.mediaType = d.mediaType === "photo" ? "photo" : "video";
      } else {
        seg.query = seg.text;
      }
    });

    renderSegments();
    markStepDone(3);
    markStepActive(4);
    const msgParts = [{ key: "analyzeDone" }];
    if (data.provider === "openrouter") msgParts.push({ key: "viaOpenRouter", params: { model: data.model || "" } });
    if (data.fallbackUsed) msgParts.push({ key: "fallbackUsedWarning" });
    setMsg(statusEl, msgParts, data.fallbackUsed ? "status-line" : "status-line ok");
    $("#panelBuild").hidden = false;

    // auto-search top query for every segment
    autoFillAllMedia();
  } catch (err) {
    const errPart = { key: "errPrefix", params: { msg: err.message } };
    setMsg(statusEl, [errPart], "status-line err");
    // কাউন্টডাউন নেই: Groq ফেল করলে সার্ভার সাথে সাথে OpenRouter-এ যায়। OpenRouter চাবি না থাকলে শুধু পরামর্শ দেখানো হয়।
    if (isRateLimitError(err.message) && !state.keys.openrouter) {
      setMsg(statusEl, [errPart, { key: "addOrHint" }], "status-line err");
    }
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove("loading");
  }
});

async function fillSegment(seg, queries) {
  const type = seg.mediaType === "photo" ? "photos" : "videos";
  seg.status = "searching";
  renderSegments();
  let failed = false;
  for (const q of queries) {
    try {
      const results = await searchMedia(q, type, 1);
      if (results.length) {
        applyMediaChoice(seg, results[0]);
        seg.choices = results.slice(0, 4);
        seg.query = q; // যে কোয়েরিতে আসলে ফলাফল পাওয়া গেছে সেটাই দেখানো হচ্ছে
        seg.status = "ready";
        return;
      }
    } catch (_) {
      failed = true; // এই কোয়েরিতে ব্যর্থ হলে পরের কোয়েরি (fallback) ট্রাই করা হবে
    }
  }
  seg.status = failed ? "attention" : "none";
}

async function autoFillAllMedia() {
  for (const seg of state.segments) {
    const qs = (seg.allQueries && seg.allQueries.length ? seg.allQueries : [seg.query || seg.text]).slice(0, 4);
    await fillSegment(seg, qs);
    renderSegments();
  }
  toast(t("analyzeDone"));
}

// ---------- media search (calls /api/search-media -> Pexels ও Pixabay দুটো থেকেই একসাথে) ----------
function targetOrientation() {
  const aspect = $("#aspectSelect").value || "9:16";
  return aspect === "16:9" ? "landscape" : aspect === "1:1" ? "square" : "portrait";
}

function mediaOrientation(r) {
  if (!r.width || !r.height) return "unknown";
  const ratio = r.width / r.height;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

async function searchMedia(query, type, page = 1) {
  const providers = [];
  if (state.keys.pexels) providers.push("pexels");
  if (state.keys.pixabay) providers.push("pixabay");
  if (!providers.length) throw new Error(t("needMediaKey"));

  const orientation = targetOrientation();
  const calls = providers.map((provider) =>
    fetch("/api/search-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey: provider === "pexels" ? state.keys.pexels : state.keys.pixabay,
        query,
        type,
        page,
        orientation,
      }),
    })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) throw new Error(data.error || t("searchFailed", { provider }));
        return data.results || [];
      })
      .catch(() => []) // একটা প্রোভাইডার ব্যর্থ হলেও অন্যটার ফলাফল যেন থাকে
  );

  const resultsPerProvider = await Promise.all(calls);
  // দুটো সোর্সের ফলাফল পালাক্রমে (interleaved) মেশানো হচ্ছে, যাতে দুটোরই প্রতিনিধিত্ব থাকে
  const merged = [];
  const maxLen = Math.max(0, ...resultsPerProvider.map((r) => r.length));
  for (let i = 0; i < maxLen; i++) {
    resultsPerProvider.forEach((r) => {
      if (r[i]) merged.push(r[i]);
    });
  }
  // যেগুলোর orientation আউটপুট ফরম্যাটের সাথে মেলে সেগুলো আগে দেখানো হচ্ছে
  // (নিশ্চিত করার জন্য, কারণ প্রোভাইডারের নিজস্ব orientation ফিল্টার সবসময় ১০০% নির্ভুল না-ও হতে পারে)
  merged.sort((a, b) => {
    const aMatch = mediaOrientation(a) === orientation ? 0 : 1;
    const bMatch = mediaOrientation(b) === orientation ? 0 : 1;
    return aMatch - bMatch;
  });
  return merged;
}

function applyMediaChoice(seg, result) {
  seg.media = {
    source: "remote",
    type: result.type, // 'video' | 'photo'
    url: result.downloadUrl,
    thumb: result.thumb,
    duration: result.duration || null,
  };
}

// ---------- picker modal ----------
let activeSeg = null;
let pickerPage = 1;
const modal = $("#pickerModal");

function openPicker(seg) {
  activeSeg = seg;
  pickerPage = 1;
  $("#pickerTitle").textContent = t("pickerTitle", { a: seg.start, b: seg.end });
  $("#pickerQuery").value = seg.query || seg.text;
  $("#pickerType").value = seg.mediaType === "photo" ? "photos" : "videos";
  $("#pickerResults").innerHTML = "";
  modal.hidden = false;
  runPickerSearch();
}
$("#pickerClose").addEventListener("click", () => (modal.hidden = true));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});
$("#pickerSearchBtn").addEventListener("click", () => {
  pickerPage = 1;
  runPickerSearch();
});
$("#pickerPrevBtn").addEventListener("click", () => {
  if (pickerPage > 1) {
    pickerPage--;
    runPickerSearch();
  }
});
$("#pickerNextBtn").addEventListener("click", () => {
  pickerPage++;
  runPickerSearch();
});

async function runPickerSearch() {
  const resultsEl = $("#pickerResults");
  resultsEl.innerHTML = `<p class="hint">${t("searching")}</p>`;
  $("#pickerPageLabel").textContent = t("pageLabel", { n: pickerPage });
  $("#pickerPrevBtn").disabled = pickerPage <= 1;
  try {
    const query = $("#pickerQuery").value.trim();
    const type = $("#pickerType").value;
    const results = await searchMedia(query, type, pickerPage);
    if (!results.length) {
      resultsEl.innerHTML = `<p class="hint">${t("noResults")}</p>`;
      return;
    }
    resultsEl.innerHTML = "";
    const wanted = targetOrientation();
    const orientLabel = { landscape: t("landscape"), portrait: t("portrait"), square: t("square"), unknown: "" };
    results.forEach((r) => {
      const orient = mediaOrientation(r);
      const mismatch = orient !== "unknown" && orient !== wanted;
      const tile = document.createElement("div");
      tile.className = "result-tile" + (mismatch ? " mismatch" : "");
      tile.innerHTML = `<img src="${r.thumb}" alt="" /><span class="src">${r.source}</span><span class="orient-badge">${mismatch ? "⚠ " : ""}${orientLabel[orient] || ""}</span>`;
      tile.addEventListener("click", () => {
        if (activeSeg) {
          applyMediaChoice(activeSeg, r);
          activeSeg.query = $("#pickerQuery").value.trim();
          renderSegments();
        }
        modal.hidden = true;
      });
      resultsEl.appendChild(tile);
    });
  } catch (err) {
    resultsEl.innerHTML = `<p class="hint">${escapeHtml(t("errPrefix", { msg: err.message }))}</p>`;
  }
}

$("#pickerUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !activeSeg) return;
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video");
  let duration = null;
  if (isVideo) {
    duration = await new Promise((resolve) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => resolve(probe.duration || null);
      probe.onerror = () => resolve(null);
    });
  }
  activeSeg.media = {
    source: "upload",
    type: isVideo ? "video" : "photo",
    file,
    url,
    thumb: url,
    duration,
  };
  renderSegments();
  modal.hidden = true;
});

// ---------- AI ছবি তৈরি (Pollinations.ai) — শুধু "AI" বাটনে ক্লিক করলে চলে ----------
// ফ্রি মডেল যেটা আপনার অ্যাকাউন্টে চলে সেটা ধরতে ক্রমানুযায়ী চেষ্টা করা হয়। Settings-এ নিজের মডেল-নাম দিলে সেটা আগে চেষ্টা হবে।
const POLL_BASE = "https://gen.pollinations.ai/image/";
const POLL_MODELS = ["flux", "black-forest-labs/flux.1-schnell", "tongyi-mai/z-image-turbo", "lykon/dreamshaper-8-lcm"];
const POLL_SIZES = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024] };
const aiBusy = new Set();

function buildAiPrompt(seg, aspect) {
  const subject = (seg.query || "").trim() || (seg.text || "").trim();
  const place = seg.entity ? ` Specific place/subject: ${seg.entity}.` : "";
  const orient = aspect === "9:16" ? "vertical portrait" : aspect === "1:1" ? "square" : "horizontal landscape";
  const p =
    `Realistic high-quality cinematic photograph for a video scene: ${subject}.${place} ` +
    `${orient} composition, well lit, sharp focus. No text, captions, letters, logos or watermarks.`;
  return p.slice(0, 900); // GET URL-এ যায়, তাই ছোট রাখা হচ্ছে
}

async function pollFetch(url, key) {
  // প্রথমে Authorization হেডারে চাবি; ব্রাউজার ব্লক করলে (network/CORS) ?key= দিয়ে আবার চেষ্টা
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  try {
    return await fetch(url, { headers });
  } catch (e) {
    if (!key) throw e;
    return await fetch(url + (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(key));
  }
}

async function requestPollinationsImage(prompt, aspect) {
  const [w, h] = POLL_SIZES[aspect] || POLL_SIZES["16:9"];
  const key = state.keys.pollinations || "";
  const custom = (state.keys.pollModel || "").trim();
  const models = custom ? [custom, ...POLL_MODELS.filter((m) => m !== custom)] : POLL_MODELS;
  let lastErr = null;
  for (const model of models) {
    try {
      const url = `${POLL_BASE}${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=${w}&height=${h}&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;
      const res = await pollFetch(url, key);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.clone().json();
          msg = j?.error?.message || j?.message || (typeof j?.error === "string" ? j.error : "") || msg;
        } catch (_) {}
        const e = new Error(msg);
        e.status = res.status;
        throw e;
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error(t("aiNoImage"));
      return blob;
    } catch (err) {
      lastErr = err;
      if (err.status === 401) break; // চাবি ছাড়া/ভুল চাবি — অন্য মডেলে চেষ্টা করে লাভ নেই
    }
  }
  throw lastErr || new Error(t("aiFailedGeneric"));
}

async function generateAiImage(seg, btn) {
  if (aiBusy.has(seg.id)) return;
  if (!((seg.query || "").trim() || (seg.text || "").trim())) {
    toast(t("aiNoQuery"), "err");
    return;
  }
  aiBusy.add(seg.id);
  const oldLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ " + t("aiGenerating");
  try {
    const aspect = $("#aspectSelect").value || "9:16";
    const blob = await requestPollinationsImage(buildAiPrompt(seg, aspect), aspect);
    const mime = blob.type || "image/jpeg";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const file = new File([blob], `ai-scene-${seg.id}.${ext}`, { type: mime });
    const url = URL.createObjectURL(file);
    // আপলোড করা ছবির মতোই বসানো হয় — তাই বিল্ড/রেন্ডার অংশে কোনো পরিবর্তন লাগে না
    seg.media = { source: "upload", type: "photo", file, url, thumb: url, duration: null };
    renderSegments();
    toast(t("aiDone"));
  } catch (err) {
    const hint = err.status === 401 || err.status === 402 ? " — " + t("aiKeyHint") : err.status === 429 ? " — " + t("aiQuotaHint") : "";
    toast(t("errPrefix", { msg: (err.message || "") + hint }), "err");
    if (btn.isConnected) {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  } finally {
    aiBusy.delete(seg.id);
  }
}

// ---------- build availability ----------
function refreshBuildAvailability() {
  // অডিও ফাইল ঐচ্ছিক — না দিলে ডিফল্ট ব্যাকগ্রাউন্ড মিউজিক ব্যবহার হয়
  const ready =
    state.segments.length > 0 &&
    state.segments.every((s) => s.media);
  $("#buildBtn").disabled = !ready;
}

// ============================================================
// Shotstack — ক্লাউড ভিডিও রেন্ডার (Ingest API দিয়ে লোকাল ফাইল আপলোড,
// Edit API দিয়ে টাইমলাইন রেন্ডার)
// ============================================================
const RES_MAP = { "854x480": "sd", "1280x720": "hd", "1920x1080": "1080" };
// প্রতিটা aspect ratio + resolution তালিকার আনুমানিক পিক্সেল মাপ — শুধু ক্যাপশন
// বক্সের আকার ঠিকমতো বসানোর জন্য ব্যবহার হয়, রেন্ডারিং resolution+aspectRatio
// প্যারামিটার দিয়েই Shotstack নিজে করে।
const RES_DIMENSIONS = {
  "16:9": { sd: { w: 1024, h: 576 }, hd: { w: 1280, h: 720 }, "1080": { w: 1920, h: 1080 } },
  "9:16": { sd: { w: 576, h: 1024 }, hd: { w: 720, h: 1280 }, "1080": { w: 1080, h: 1920 } },
  "1:1": { sd: { w: 576, h: 576 }, hd: { w: 720, h: 720 }, "1080": { w: 1080, h: 1080 } },
};
// বাংলা লেখার জন্য Shotstack-এর ডিফল্ট ফন্টে গ্লিফ নেই (বক্স/টোফু দেখাবে),
// তাই বাংলা-সাপোর্টেড একটা Google Font (Hind Siliguri) আলাদাভাবে লোড করা হচ্ছে।
// ক্যাপশন ফন্ট তালিকা — সবগুলো বাংলা ও ইংরেজি দুটোই সাপোর্ট করে (Google Fonts, OFL লাইসেন্স)।
// family নাম অবশ্যই ফাইলের basename (এক্সটেনশন ছাড়া) হতে হয়। নতুন ফন্ট যোগ করতে এখানে একটা এন্ট্রি + HTML-এ একটা <option> দিন।
const GF = "https://raw.githubusercontent.com/google/fonts/main/ofl/";
const KP = "https://raw.githubusercontent.com/Salimtech353/Reels_Factory/main/File/";
const CAPTION_FONTS = {
  hind: { url: GF + "hindsiliguri/HindSiliguri-Regular.ttf", family: "HindSiliguri-Regular", weight: 600, css: "'Hind Siliguri'" },
  // কল্পনা (Kolpona) — নিজস্ব GitHub রিপোজিটরি থেকে। ANSI ফাইলটা বিজয়-ধরনের পুরনো এনকোডিং, ইউনিকোড বাংলা লেখা দেখাবে না, তাই শুধু Unicode ফাইলগুলো রাখা হয়েছে।
  kolpona: { url: KP + "Kolpona_Unicode.ttf", family: "Kolpona_Unicode", weight: 400, css: "'Kolpona'" },
  kolponaI: { url: KP + "Kolpona_Unicode_Italic.ttf", family: "Kolpona_Unicode Italic", weight: 400, css: "'Kolpona Italic'" },
  galada: { url: GF + "galada/Galada-Regular.ttf", family: "Galada-Regular", weight: 400, css: "'Galada'" },
  atma: { url: GF + "atma/Atma-Regular.ttf", family: "Atma-Regular", weight: 400, css: "'Atma'" },
  mina: { url: GF + "mina/Mina-Regular.ttf", family: "Mina-Regular", weight: 400, css: "'Mina'" },
};
// অডিও ফাইল না দিলে এই ডিফল্ট ব্যাকগ্রাউন্ড মিউজিক বসে। নিজের মিউজিক চাইলে url বদলে দিন (পাবলিক .mp3 লিংক)।
const DEFAULT_BG_MUSIC = {
  url: "https://raw.githubusercontent.com/Salimtech353/Reels_Factory/main/File/video_bg_music.mp3",
  volume: 0.7,
};
const captionFontOf = (opts) => CAPTION_FONTS[(opts || {}).font] || CAPTION_FONTS.hind;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shotstackCall(action, payload) {
  const res = await fetch("/api/shotstack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, apiKey: state.keys.shotstack, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || t("errShot"));
  return data;
}

// লোকাল ফাইল (ব্যবহারকারীর আপলোড করা অডিও/ছবি/ভিডিও) Shotstack-এ পাঠিয়ে
// একটা ফেচযোগ্য URL ফেরত আনে — কারণ Edit API-এর প্রতিটা অ্যাসেটের জন্য URL লাগে।
async function uploadToShotstack(file) {
  const { id, uploadUrl } = await shotstackCall("upload-url", {});
  const putRes = await fetch(uploadUrl, { method: "PUT", body: file });
  if (!putRes.ok) throw new Error(t("errUpload"));

  for (let i = 0; i < 60; i++) {
    const status = await shotstackCall("source-status", { id });
    if (status.status === "ready" && status.url) return status.url;
    if (status.status === "failed") throw new Error(t("errUploadProc", { msg: status.error || "" }));
    await sleep(2000);
  }
  throw new Error(t("errUploadTimeout"));
}

// জনপ্রিয় ও আধুনিক ট্রানজিশনের একটা তালিকা — প্রতিটা দৃশ্যে ঘুরিয়ে-ফিরিয়ে
// আলাদা একটা বসানো হয়, যাতে পুরো ভিডিওতে একঘেয়ে না লাগে।
const TRANSITION_STYLES = ["fade", "slideLeft", "slideRight", "slideUp", "zoom", "carouselLeft", "carouselRight", "wipeLeft", "wipeRight"];

const BORDER_COLOR = "#1A1A1A"; // ব্ল্যাক অ্যাশ — নিরেট কালো নয়, সামান্য ধূসর-কালো

// ক্যাপশন সবসময় একবারে মাত্র এক লাইন দেখায়। টেক্সট এক লাইনে না আঁটলে শব্দ-সীমানা
// বজায় রেখে সমান-সমান অংশে ভাগ করা হয় (যাতে শেষে একটা লাইনে একটামাত্র শব্দ পড়ে না থাকে),
// আর অংশগুলো একটার পর একটা একই জায়গায় দেখানো হয় — প্রথম লাইন শেষ হলে মুছে গিয়ে
// সাথে সাথে পরের লাইন শুরু হয়।
function wrapCaptionLines(text, fontSize, boxWidthPx) {
  const clean = text.trim().replace(/\s+/g, " ");
  // বাংলা অক্ষরের গড় প্রস্থ প্রায় ০.৫–০.৬ em; একটু নিরাপদে থাকতে ০.৬২ ধরা হয়েছে,
  // যাতে কোনো লাইন ভুল করে দুই লাইনে ভেঙে না যায়।
  const maxChars = Math.max(6, Math.floor(boxWidthPx / (fontSize * 0.62)));
  if (clean.length <= maxChars) return [clean];
  const parts = Math.ceil(clean.length / maxChars);
  const limit = Math.min(maxChars, Math.ceil(clean.length / parts) + 2);
  const lines = [];
  let current = "";
  for (const w of clean.split(" ")) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > limit && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildShotstackTimeline(mediaUrls, audioUrl, resolutionKey, aspectRatio, captionsEnabled, borderPercent, captionOptions) {
  const dim = (RES_DIMENSIONS[aspectRatio] || RES_DIMENSIONS["9:16"])[resolutionKey] || RES_DIMENSIONS["9:16"].sd;
  const m = Math.max(0, Math.min(0.25, (borderPercent || 0) / 100)); // এক পাশের মার্জিন, canvas-এর ভগ্নাংশ হিসেবে
  // মূল ফুটেজের বক্স — এই নির্দিষ্ট পিক্সেল মাপের মধ্যেই fit/effect (zoom) হিসাব হয়,
  // তাই Ken Burns zoom করলেও বর্ডারের বাইরে ছড়িয়ে পড়বে না।
  const contentBox = { w: Math.round(dim.w * (1 - 2 * m)), h: Math.round(dim.h * (1 - 2 * m)) };

  const clips = state.segments.map((seg, i) => {
    const m2 = mediaUrls[i];
    const isPhoto = m2.type === "photo";
    let asset;
    if (isPhoto) {
      asset = { type: "image", src: m2.url };
    } else {
      asset = { type: "video", src: m2.url, volume: 0 };
      // সোর্স ভিডিওর দৈর্ঘ্য জানা থাকলে স্পিড এমনভাবে সেট করা হচ্ছে যাতে
      // ক্লিপটা ঠিক সেগমেন্টের টাইমস্ট্যাম্প জুড়েই শেষ হয় — ছোট হলে স্লো,
      // বড় হলে ফাস্ট। speed = original_duration / segment_duration
      if (m2.duration && m2.duration > 0) {
        const speed = m2.duration / seg.duration;
        asset.speed = Math.min(10, Math.max(0.1, Number(speed.toFixed(2))));
      }
    }
    const style = TRANSITION_STYLES[i % TRANSITION_STYLES.length];
    return {
      asset,
      start: seg.startSec,
      length: seg.duration,
      // Shotstack-এ fit:"cover" ফুটেজকে অনুপাত না মেনে টেনে স্ট্রেচ করে (শেপ নষ্ট হয়);
      // অনুপাত ঠিক রেখে স্কেল করে বাড়তি অংশ ক্রপ করে দেয় fit:"crop"।
      fit: "crop",
      width: contentBox.w,
      height: contentBox.h,
      position: "center",
      transition: { in: style, out: TRANSITION_STYLES[(i + 1) % TRANSITION_STYLES.length] },
      ...(isPhoto ? { effect: "zoomIn" } : {}),
    };
  });
  const totalDuration = Math.max(...state.segments.map((s) => s.endSec));

  const tracks = [];
  // ক্যাপশন ট্র্যাক সবার উপরে থাকে (Shotstack-এ tracks[0] সবচেয়ে উপরের লেয়ার)
  if (captionsEnabled) {
    const opts = captionOptions || {};
    // ব্যবহারকারীর কাছে ৮=সবচেয়ে ছোট, ১৮=সবচেয়ে বড় হিসেবে দেখানো হয়, কিন্তু
    // ফন্ট-সাইজ গণনার সূত্রে divisor ছোট হলে ফন্ট বড় হয় — তাই মান উল্টে নেওয়া হচ্ছে।
    // ভিত্তি হিসেবে ফুটেজ-বক্সের ছোট বাহুটা নেওয়া হয়েছে (প্রস্থ নয়), তাই ল্যান্ডস্কেপ,
    // ভার্টিক্যাল ও স্কয়ার — তিন ফরম্যাটেই একই সংখ্যায় প্রায় একই আকারের ফন্ট আসে।
    const rawSize = Math.max(8, Math.min(18, Number(opts.size) || 13));
    const divisor = 26 - rawSize;
    const fontSize = Math.round(Math.min(contentBox.w, contentBox.h) / divisor);
    const color = opts.color || "#ffffff";
    const boxWidth = Math.round(contentBox.w * 0.92);
    // বক্সে দুই লাইনের জায়গা রাখা হয়েছে আর লেখা বক্সের *নিচ-সারিবদ্ধ* (bottom)। তাই এক লাইনের
    // ক্যাপশন সবসময় বক্সের একদম নিচে (ফুটেজের নিচের কিনারার ঠিক উপরে) বসে; অনুমানে ভুল হয়ে কখনো
    // দুই লাইনে ভেঙে গেলেও বাড়তি লাইনটা উপরের দিকে যায়, বর্ডারের দিকে না।
    const boxHeight = Math.round(fontSize * 1.5 * 2);
    // ফুটেজ-বক্সের নিচের কিনারা (পিক্সেলে, উপর থেকে) — ক্যাপশন এই রেখার ঠিক উপরেই বসবে
    const footageBottomPx = (1 - m) * dim.h;
    const paddingPx = Math.max(4, fontSize * 0.25);
    const centerYpx = footageBottomPx - paddingPx - boxHeight / 2;
    const offsetY = Math.max(-0.9, Math.min(0.9, (dim.h / 2 - centerYpx) / dim.h)); // positive = up, negative = down
    const anim = opts.animation || "typewriter";

    const captionClips = [];
    state.segments.forEach((seg) => {
      const lines = wrapCaptionLines(seg.text, fontSize, boxWidth);
      // সেগমেন্টের সময়টুকু প্রতিটা লাইনের দৈর্ঘ্য অনুপাতে ভাগ করা হচ্ছে, যাতে
      // ছোট লাইন দ্রুত আর বড় লাইন একটু বেশি সময় দেখানো হয়
      const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;
      const segEnd = seg.startSec + seg.duration;
      let cursor = seg.startSec;
      lines.forEach((lineText, idx) => {
        const isLast = idx === lines.length - 1;
        // শেষ লাইন সেগমেন্টের শেষ পর্যন্ত (ফ্লোট ড্রিফট এড়াতে), বাকিগুলো অনুপাতে
        const lineLength = isLast ? segEnd - cursor : (seg.duration * lineText.length) / totalChars;
        const clip = {
          asset: {
            type: "rich-text",
            text: lineText,
            font: { family: captionFontOf(opts).family, size: fontSize, color, weight: captionFontOf(opts).weight },
            align: { horizontal: "center", vertical: "bottom" },
          },
          start: Number(cursor.toFixed(3)),
          length: Number(lineLength.toFixed(3)),
          position: "center",
          offset: { x: 0, y: offsetY },
          width: boxWidth,
          height: boxHeight,
        };
        if (anim === "typewriter") {
          const typeDuration = Math.max(0.3, Math.min(lineLength - 0.15, lineText.length * 0.05));
          clip.asset.animation = { preset: "typewriter", duration: Number(typeDuration.toFixed(2)), style: "character" };
        } else if (anim !== "none") {
          // fade / slideUp / slideLeft / zoom / wipeLeft — সাধারণ ক্লিপ ট্রানজিশন হিসেবে প্রয়োগ করা হচ্ছে
          clip.transition = { in: anim, out: anim };
        }
        captionClips.push(clip);
        cursor += lineLength;
      });
    });
    tracks.push({ clips: captionClips });
  }
  tracks.push({ clips }); // দৃশ্য (ছবি/ভিডিও)
  const isBgMusic = audioUrl === DEFAULT_BG_MUSIC.url; // ভয়েসওভার নেই → ব্যাকগ্রাউন্ড মিউজিক, শেষে ফেড-আউট
  tracks.push({
    clips: [
      {
        asset: isBgMusic
          ? { type: "audio", src: audioUrl, volume: DEFAULT_BG_MUSIC.volume, effect: "fadeOut" }
          : { type: "audio", src: audioUrl },
        start: 0,
        length: totalDuration,
      },
    ],
  }); // অডিও

  const timeline = { background: BORDER_COLOR, tracks };
  if (captionsEnabled) {
    timeline.fonts = [{ src: captionFontOf(captionOptions).url }];
  }
  return timeline;
}

let progressPart = null;
function setProgress(pct, part) {
  $("#progressWrap").hidden = false;
  $("#progressWrap").classList.toggle("is-error", pct === 0);
  $("#panelBuild").classList.toggle("rendering", pct > 0 && pct < 100);
  $(".render-setup").hidden = pct > 0 && pct < 100 || pct === 100;
  if (pct === 100) $("#progressWrap").hidden = true;
  $("#progressFill").style.width = `${pct}%`;
  progressPart = part;
  $("#progressLabel").removeAttribute("data-i18n"); // এখন থেকে লেবেল প্রগ্রেস-স্টেট থেকে আঁকা হবে
  $("#progressLabel").textContent = renderParts([part]);
  $("#progressPercent").textContent = `${Math.round(pct)}%`;
}

$("#buildBtn").addEventListener("click", async () => {
  const buildBtn = $("#buildBtn");
  buildBtn.disabled = true;
  markStepActive(5);

  // বিকল্প মেথড: GitHub Actions + FFmpeg (Shotstack পথ নিচে অপরিবর্তিত)
  if ($("#renderMethod").value === "github") {
    await buildViaGithub(buildBtn);
    return;
  }

  if (!state.keys.shotstack) {
    setProgress(0, { key: "needShotstack" });
    buildBtn.disabled = false;
    return;
  }

  try {
    let audioUrl = DEFAULT_BG_MUSIC.url;
    if (state.audioFile) {
      setProgress(3, { key: "upAudio" });
      audioUrl = await uploadToShotstack(state.audioFile);
    }

    const mediaUrls = [];
    for (let i = 0; i < state.segments.length; i++) {
      const seg = state.segments[i];
      setProgress(10 + Math.round((i / state.segments.length) * 35), { key: "prepSeg", params: { i: i + 1, n: state.segments.length } });
      if (seg.media.source === "upload") {
        const url = await uploadToShotstack(seg.media.file);
        mediaUrls.push({ url, type: seg.media.type, duration: seg.media.duration });
      } else {
        mediaUrls.push({ url: seg.media.url, type: seg.media.type, duration: seg.media.duration });
      }
    }

    setProgress(50, { key: "sendingRender" });
    const resolution = RES_MAP[$("#resSelect").value] || "sd";
    const aspectRatio = $("#aspectSelect").value || "9:16";
    const captionsEnabled = $("#captionToggle").checked;
    const borderPercent = Number($("#borderSelect").value) || 0;
    const captionOptions = {
      size: $("#captionSizeSelect").value,
      color: $("#captionColorSelect").value,
      animation: $("#captionAnimSelect").value,
      font: $("#captionFontSelect").value,
    };
    const timeline = buildShotstackTimeline(mediaUrls, audioUrl, resolution, aspectRatio, captionsEnabled, borderPercent, captionOptions);
    const { id: renderId } = await shotstackCall("render", { timeline, resolution, aspectRatio });

    let finalUrl = null;
    for (let i = 0; i < 100; i++) {
      await sleep(3000);
      const status = await shotstackCall("render-status", { id: renderId });
      setProgress(52 + Math.min(45, i), { key: "rendering", params: { status: status.status } });
      if (status.status === "done") {
        finalUrl = status.url;
        break;
      }
      if (status.status === "failed") throw new Error(t("renderFailed", { msg: status.error || "" }));
    }
    if (!finalUrl) throw new Error(t("renderTimeout"));

    $("#resultVideo").src = finalUrl;
    $("#downloadBtn").href = finalUrl;
    $("#resultBox").hidden = false;
    setProgress(100, { key: "renderDone" });
    toast(t("renderDone"));
    markStepDone(5);
    saveRecentRender(finalUrl);
  } catch (err) {
    console.error(err);
    setProgress(0, { key: "errPrefix", params: { msg: err.message } });
  } finally {
    buildBtn.disabled = false;
  }
});

// ============================================================
// GitHub Actions + FFmpeg — বিকল্প রেন্ডার মেথড
// অ্যাপ জবের ফাইল রিপোতে পাঠায় → workflow চালু করে → GitHub-এ FFmpeg রেন্ডার করে
// → ফলাফল Release হিসেবে ফেরত আসে। পিসি চালু রাখতে হয় না।
// ============================================================
const RM_KEY = "rk_render_method";
(function initRenderMethod() {
  const sel = $("#renderMethod");
  try {
    sel.value = localStorage.getItem(RM_KEY) || "shotstack";
  } catch (_) {}
  if (!sel.value) sel.value = "shotstack";
  sel.addEventListener("change", () => {
    try {
      localStorage.setItem(RM_KEY, sel.value);
    } catch (_) {}
  });
})();

// ব্যাকগ্রাউন্ড মিউজিক + ducking (শুধু GitHub মেথডে)
// সাবস্ক্রাইব ওভারলে ও এন্ড স্ক্রিন ফাইলের ঠিকানা (Reels_Factory রিপোর File/ ফোল্ডার)
const BRAND_BASE = "https://raw.githubusercontent.com/Salimtech353/Reels_Factory/main/File/";
const BRAND_FILES = {
  overlay: { youtube: "Overly/Youtube.mp4", facebook: "Overly/Facebook.mp4" },
  endscreen: { youtube: "Endscreen/Youtube.mp4", facebook: "Endscreen/Facebook.mp4" },
};
const MUSIC_DEFAULTS = { vol: 40, duck: 14 };
(function initMusicControls() {
  const sel = $("#renderMethod");
  const box = $("#musicBox");
  const vol = $("#musicVol");
  const duck = $("#musicDuckVol");
  const brandBox = $("#brandBox");
  const show = () => {
    box.style.display = sel.value === "github" ? "" : "none";
    brandBox.style.display = sel.value === "github" ? "" : "none";
  };
  [["overlaySel", "rk_overlay"], ["endSel", "rk_endscreen"]].forEach(([id, key]) => {
    const el = $("#" + id);
    try {
      el.value = localStorage.getItem(key) || "none";
    } catch (_) {}
    if (!el.value) el.value = "none";
    el.addEventListener("change", () => {
      try {
        localStorage.setItem(key, el.value);
      } catch (_) {}
    });
  });
  const label = () => {
    $("#musicVolOut").textContent = vol.value + "%";
    $("#musicDuckOut").textContent = duck.value + "%";
  };
  try {
    vol.value = localStorage.getItem("rk_music_vol") || MUSIC_DEFAULTS.vol;
    duck.value = localStorage.getItem("rk_music_duck") || MUSIC_DEFAULTS.duck;
  } catch (_) {}
  [vol, duck].forEach((el) =>
    el.addEventListener("input", () => {
      label();
      try {
        localStorage.setItem("rk_music_vol", vol.value);
        localStorage.setItem("rk_music_duck", duck.value);
      } catch (_) {}
    })
  );
  $("#bgMusicFile").addEventListener("change", (e) => {
    state.bgMusicFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
  });
  sel.addEventListener("change", show);
  label();
  show();
})();

const GH_API = "https://api.github.com";
function ghRepoName() {
  return (state.keys.ghRepo || "")
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

async function ghFetch(pathname, opts = {}) {
  const res = await fetch(GH_API + pathname, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${state.keys.ghToken}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error("GitHub: " + (data.message || `HTTP ${res.status}`));
    e.status = res.status;
    throw e;
  }
  return data;
}

function textToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function ghPutFile(repo, filePath, base64, message) {
  const enc = filePath.split("/").map(encodeURIComponent).join("/");
  for (let attempt = 1; ; attempt++) {
    try {
      return await ghFetch(`/repos/${repo}/contents/${enc}`, {
        method: "PUT",
        body: JSON.stringify({ message, content: base64, branch: "main" }),
      });
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt < 4) {
        await sleep(1000 * attempt);
        continue;
      }
      throw e;
    }
  }
}

// ক্যাপশনের মাপ ব্রাউজারেই আসল ফন্ট দিয়ে মাপা হয় (একই শেপিং/প্রস্থ), যাতে রেন্ডারে ঠিক সেভাবেই বসে
const _capFontCache = {};
function loadCaptionMeasureFont(f) {
  const family = "RFcap" + String(f.css || "").replace(/[^A-Za-z0-9]/g, "");
  if (!_capFontCache[family]) {
    _capFontCache[family] = (async () => {
      try {
        const face = new FontFace(family, `url(${f.url})`);
        await face.load();
        document.fonts.add(face);
        return family;
      } catch (_) {
        return null; // ফন্ট না পেলে সাধারণ ফন্টে আনুমানিক মাপ
      }
    })();
  }
  return _capFontCache[family];
}

// একটা দৃশ্যের পুরো ক্যাপশন একসাথে: এক লাইনে আঁটলে এক লাইন, নইলে সবচেয়ে সুষম দুই লাইন।
// তাতেও না আঁটলে ফন্ট এক এক পিক্সেল ছোট করা হয় (সর্বনিম্ন সীমা পর্যন্ত)।
function fitCaption(text, baseSize, boxWidth, measure100) {
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  if (!clean) return null;
  const words = clean.split(" ");
  const minSize = Math.max(11, Math.round(baseSize * 0.4));
  const wAll = measure100(clean);
  let bestSplit = null; // সবচেয়ে সুষম দুই-লাইন ভাগ
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" ");
    const l2 = words.slice(i).join(" ");
    const mx = Math.max(measure100(l1), measure100(l2));
    if (!bestSplit || mx < bestSplit.mx) bestSplit = { mx, lines: [l1, l2] };
  }
  for (let sz = baseSize; sz >= minSize; sz--) {
    const k = sz / 100;
    if (wAll * k <= boxWidth) return { size: sz, lines: [clean] };
    if (bestSplit && bestSplit.mx * k <= boxWidth) return { size: sz, lines: bestSplit.lines };
  }
  // সর্বনিম্ন মাপেও দুই লাইনে না আঁটলে (খুব লম্বা লেখা) বাধ্য হয়ে বেশি লাইন
  const k = minSize / 100;
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cur && measure100(cand) * k > boxWidth) {
      lines.push(cur);
      cur = w;
    } else cur = cand;
  }
  if (cur) lines.push(cur);
  return { size: minSize, lines };
}

// Shotstack টাইমলাইনের মতো একই জ্যামিতি, কিন্তু ক্যাপশন FFmpeg রেন্ডারারের জন্য আলাদাভাবে সাজানো
async function buildRenderJob(resolutionKey, aspectRatio, captionsEnabled, borderPercent, opts) {
  const dim = (RES_DIMENSIONS[aspectRatio] || RES_DIMENSIONS["9:16"])[resolutionKey] || RES_DIMENSIONS["9:16"].sd;
  const m = Math.max(0, Math.min(0.25, (borderPercent || 0) / 100));
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const cw = even(dim.w * (1 - 2 * m));
  const ch = even(dim.h * (1 - 2 * m));

  let captions = { enabled: false };
  if (captionsEnabled) {
    const rawSize = Math.max(8, Math.min(18, Number(opts.size) || 13));
    const baseSize = Math.round(Math.min(cw, ch) / (26 - rawSize));
    const boxWidth = Math.round(cw * 0.94);
    const paddingPx = Math.max(6, baseSize * 0.3);
    const bottomY = (dim.h + ch) / 2 - paddingPx; // ফুটেজের একদম নিচে, সামান্য ওপরে
    const f = captionFontOf(opts);
    const family = await loadCaptionMeasureFont(f);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${f.weight >= 700 ? "bold " : ""}100px ${family ? `"${family}"` : `"${String(f.css || "").replace(/'/g, "")}", "Noto Sans Bengali", sans-serif`}`;
    const measure100 = (str) => ctx.measureText(str).width;
    const lines = [];
    state.segments.forEach((seg) => {
      const fit = fitCaption(seg.text, baseSize, boxWidth, measure100);
      if (!fit) return;
      lines.push({ text: fit.lines.join("\n"), size: fit.size, start: Number(seg.startSec.toFixed(3)), length: Number(seg.duration.toFixed(3)) });
    });
    captions = {
      enabled: true,
      size: baseSize,
      color: opts.color || "#ffffff",
      anim: opts.animation || "typewriter",
      bottomY,
      lines,
      font: { url: f.url, name: String(f.css || "").replace(/'/g, ""), bold: f.weight >= 700 },
    };
  }
  return {
    version: 2,
    transitions: TRANSITION_STYLES.slice(),
    W: dim.w,
    H: dim.h,
    cw,
    ch,
    borderColor: BORDER_COLOR,
    total: Math.max(...state.segments.map((s) => s.endSec)),
    captions,
    segments: [],
    audio: {},
  };
}

function extOf(file, fallback) {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(file.name || "");
  if (m) return m[1].toLowerCase();
  const t2 = (file.type || "").split("/")[1];
  return (t2 || fallback).replace(/[^a-z0-9]/gi, "").slice(0, 5) || fallback;
}

async function buildViaGithub(buildBtn) {
  const repo = ghRepoName();
  if (!state.keys.ghToken || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    setProgress(0, { key: "needGithub" });
    buildBtn.disabled = false;
    return;
  }
  try {
    const jobId = "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const base = `jobs/${jobId}`;
    const resolutionKey = RES_MAP[$("#resSelect").value] || "sd";
    const aspectRatio = $("#aspectSelect").value || "9:16";
    const job = await buildRenderJob(resolutionKey, aspectRatio, $("#captionToggle").checked, Number($("#borderSelect").value) || 0, {
      size: $("#captionSizeSelect").value,
      color: $("#captionColorSelect").value,
      animation: $("#captionAnimSelect").value,
      font: $("#captionFontSelect").value,
    });

    // কোন ফাইলগুলো রিপোতে পাঠাতে হবে (আপলোড/AI ছবি ও নিজের অডিও); স্টক মিডিয়া শুধু লিংক হিসেবে যায়
    const uploads = [];
    const musicVol = Math.min(1, Math.max(0.02, Number($("#musicVol").value) / 100 || 0.4));
    const duckVol = Math.min(musicVol, Math.max(0, Number($("#musicDuckVol").value) / 100 || 0));
    if (state.audioFile) {
      const name = `audio.${extOf(state.audioFile, "mp3")}`;
      uploads.push({ name, file: state.audioFile });
      job.audio = { file: name, volume: 1 };
      if (state.bgMusicFile) {
        // ভয়েসওভার + আলাদা মিউজিক: ভয়েস চললে মিউজিক নিজে থেকে নিচে নামে (ducking)
        const mname = `music.${extOf(state.bgMusicFile, "mp3")}`;
        uploads.push({ name: mname, file: state.bgMusicFile });
        job.music = { file: mname, vol: musicVol, duck: duckVol };
      }
    } else if (state.bgMusicFile) {
      const mname = `music.${extOf(state.bgMusicFile, "mp3")}`;
      uploads.push({ name: mname, file: state.bgMusicFile });
      job.audio = { file: mname, bg: true, volume: musicVol };
    } else {
      job.audio = { url: DEFAULT_BG_MUSIC.url, bg: true, volume: DEFAULT_BG_MUSIC.volume };
    }
    state.segments.forEach((seg, i) => {
      const media = { type: seg.media.type };
      if (seg.media.source === "upload") {
        const name = `m${i}.${extOf(seg.media.file, seg.media.type === "photo" ? "jpg" : "mp4")}`;
        uploads.push({ name, file: seg.media.file });
        media.file = name;
      } else {
        media.url = seg.media.url;
      }
      job.segments.push({ start: seg.startSec, duration: seg.duration, media });
    });

    // ব্র্যান্ড অ্যাসেট: ওভারলে (২০ সেকেন্ড পরে ৯ সেকেন্ড) ও এন্ড স্ক্রিন (ভিডিওর শেষে)
    const ovSel = $("#overlaySel").value;
    const enSel = $("#endSel").value;
    if (BRAND_FILES.overlay[ovSel]) job.overlay = { url: BRAND_BASE + BRAND_FILES.overlay[ovSel], start: 20, dur: 9 };
    if (BRAND_FILES.endscreen[enSel]) job.endscreen = { url: BRAND_BASE + BRAND_FILES.endscreen[enSel] };

    for (let k = 0; k < uploads.length; k++) {
      const u = uploads[k];
      if (u.file.size > 60 * 1024 * 1024) throw new Error(t("ghTooBig"));
      setProgress(3 + Math.round((k / uploads.length) * 37), { key: "ghUpload", params: { i: k + 1, n: uploads.length } });
      await ghPutFile(repo, `${base}/${u.name}`, await fileToBase64(u.file), `job ${jobId}: ${u.name}`);
    }
    setProgress(42, { key: "ghUpload", params: { i: uploads.length, n: uploads.length } });
    await ghPutFile(repo, `${base}/job.json`, textToBase64(JSON.stringify(job)), `job ${jobId}: job.json`);

    setProgress(46, { key: "ghSend" });
    await ghFetch(`/repos/${repo}/actions/workflows/render.yml/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { job: jobId } }),
    });

    // workflow_dispatch রান আইডি ফেরত দেয় না — run-name-এ জব আইডি থাকে, সেটা দিয়ে খুঁজে নেওয়া হয়
    let run = null;
    for (let i = 0; i < 40 && !run; i++) {
      await sleep(3000);
      const r = await ghFetch(`/repos/${repo}/actions/workflows/render.yml/runs?event=workflow_dispatch&per_page=15`);
      run = (r.workflow_runs || []).find((x) => String(x.display_title || x.name || "").includes(jobId)) || null;
      setProgress(46 + Math.min(6, i), { key: "ghQueue" });
    }
    if (!run) throw new Error(t("ghNoRun"));

    const started = Date.now();
    let finalRun = null;
    while (Date.now() - started < 50 * 60 * 1000) {
      await sleep(5000);
      const cur = await ghFetch(`/repos/${repo}/actions/runs/${run.id}`);
      const secs = Math.round((Date.now() - started) / 1000);
      const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      // রেন্ডারার প্রতি কয়েক সেকেন্ডে jobs/<id>/progress.json আপডেট করে — পেলে আসল প্রগ্রেস দেখানো হয়
      let prog = null;
      try {
        const pr = await fetch(`${GH_API}/repos/${repo}/contents/${base}/progress.json?ref=main&_=${Date.now()}`, {
          cache: "no-store",
          headers: {
            Accept: "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
            Authorization: `Bearer ${state.keys.ghToken}`,
          },
        });
        if (pr.ok) prog = await pr.json();
      } catch (_) {}
      if (prog && typeof prog.pct === "number") {
        const stageKey = { scenes: "ghStScenes", transitions: "ghStTrans", final: "ghStFinal" }[prog.stage] || "ghRender";
        setProgress(55 + 42 * (Math.min(100, prog.pct) / 100), { key: stageKey, params: { i: prog.i, n: prog.n, time } });
      } else {
        const pct = 55 + 15 * (1 - Math.exp(-secs / 120)); // আসল প্রগ্রেস আসার আগে আনুমানিক
        setProgress(pct, { key: "ghRender", params: { time } });
      }
      if (cur.status === "completed") {
        finalRun = cur;
        break;
      }
    }
    if (!finalRun) throw new Error(t("renderTimeout"));
    if (finalRun.conclusion !== "success") throw new Error(t("ghFailed", { url: finalRun.html_url }));

    const finalUrl = `https://github.com/${repo}/releases/download/render-${jobId}/video.mp4`;
    $("#resultVideo").src = finalUrl;
    $("#downloadBtn").href = finalUrl;
    $("#resultBox").hidden = false;
    setProgress(100, { key: "renderDone" });
    toast(t("renderDone"));
    markStepDone(5);
    saveRecentRender(finalUrl);
  } catch (err) {
    console.error(err);
    setProgress(0, { key: "errPrefix", params: { msg: err.message } });
  } finally {
    buildBtn.disabled = false;
  }
}

// ---------- recent renders list ----------
const RECENT_KEY = "rk_recent_renders";
const RECENT_MAX = 10;

function loadRecentRenders() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveRecentRender(url) {
  const list = loadRecentRenders();
  list.unshift({
    url,
    ts: Date.now(),
    count: state.segments.length, // লেবেল রেন্ডারের সময় বর্তমান ভাষায় বানানো হয়
    title: state.segments[0] ? state.segments[0].text.slice(0, 60) : "",
    dur: state.segments.length ? Math.max(...state.segments.map((x) => x.endSec)) : 0,
    thumb: state.segments[0] && state.segments[0].media && state.segments[0].media.source !== "upload" ? state.segments[0].media.thumb || "" : "",
    thumbType: "photo",
    label: `${state.segments.length} — ${new Date().toLocaleString("bn-BD")}`, // পুরনো ভার্সনের সাথে সামঞ্জস্যের জন্য
  });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  renderRecentList(url);
}

function renderRecentList(activeUrl) {
  const ul = $("#recentList");
  const list = loadRecentRenders();
  ul.innerHTML = "";
  if (!list.length) {
    ul.innerHTML = `<li class="empty"><b>🎬</b>${t("emptyRecent")}</li>`;
    return;
  }
  list.forEach((item) => {
    const li = document.createElement("li");
    li.className = "project" + (item.url === activeUrl ? " active" : "");
    const date = new Date(item.ts).toLocaleDateString(getLang() === "en" ? "en-US" : "bn-BD", { day: "numeric", month: "short", year: "numeric" });
    li.innerHTML = `
      <div class="thumb">${item.thumb ? mediaTag(item.thumb, item.thumbType) : ""}</div>
      <div class="info">
        <div class="ttl">${escapeHtml(item.title || t("untitled"))}</div>
        <div class="meta"><span class="chip">⏱ ${fmtDur(item.dur || 0)}</span><span class="chip">🎞 ${item.count || "–"}</span><span class="chip">${date}</span></div>
        <div class="acts">
          <button type="button" class="btn btn-secondary open">${t("openBtn")}</button>
          <a class="btn btn-ghost" href="${escapeAttr(item.url)}" target="_blank" rel="noopener" download>⬇</a>
          <button type="button" class="btn btn-ghost del" title="${t("delTitle")}">✕</button>
        </div>
      </div>`;
    const open = () => {
      $("#resultVideo").src = item.url;
      $("#downloadBtn").href = item.url;
      $("#resultBox").hidden = false;
      $("#progressWrap").hidden = true;
      $(".render-setup").hidden = true;
      $("#panelBuild").hidden = false;
      goStep(5);
    };
    li.querySelector(".thumb").addEventListener("click", open);
    li.querySelector(".open").addEventListener("click", open);
    li.querySelector(".del").addEventListener("click", () => {
      const remaining = loadRecentRenders().filter((r) => r.ts !== item.ts);
      localStorage.setItem(RECENT_KEY, JSON.stringify(remaining));
      renderRecentList();
    });
    ul.appendChild(li);
  });
}

renderRecentList();

// ============================================================
// ভাষা (বাংলা / English) ও থিম (ডার্ক / লাইট) নিয়ন্ত্রণ
// ============================================================
function updateLangButtons() {
  $$(".lang-btn").forEach((b) => {
    const on = b.dataset.lang === getLang();
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function updateThemeButton() {
  const light = currentTheme() === "light";
  // আইকন দেখায় ক্লিক করলে কোন মোডে যাবে: এখন ডার্ক হলে ☀ (লাইটে যাও), লাইট হলে ☾ (ডার্কে যাও)
  $("#themeIcon").textContent = light ? "☾" : "☀";
  const label = t(light ? "themeToDark" : "themeToLight");
  $("#themeBtn").setAttribute("aria-label", label);
  $("#themeBtn").setAttribute("title", label);
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  try {
    localStorage.setItem("rk_theme", theme === "light" ? "light" : "dark");
  } catch (_) {}
  updateThemeButton();
}

$$(".lang-btn").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
$("#themeBtn").addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));

// ভাষা বদলালে গতিশীলভাবে আঁকা অংশগুলো নতুন ভাষায় আবার আঁকা হচ্ছে (ডেটা/স্টেট অপরিবর্তিত)
onLangChange(() => {
  updateLangButtons();
  updateThemeButton();
  refreshMsgs();
  renderAudioMeta();
  if (progressPart) $("#progressLabel").textContent = renderParts([progressPart]);
  if (state.segments.length) renderSegments();
  const openUrl = $("#resultBox").hidden ? undefined : $("#downloadBtn").getAttribute("href");
  renderRecentList(openUrl);
  if (!modal.hidden && activeSeg) {
    $("#pickerTitle").textContent = t("pickerTitle", { a: activeSeg.start, b: activeSeg.end });
    runPickerSearch();
  } else {
    $("#pickerPageLabel").textContent = t("pageLabel", { n: pickerPage });
  }
});

updateLangButtons();
updateThemeButton();
$("#pickerPageLabel").textContent = t("pageLabel", { n: pickerPage });


// ============================================================
// উইজার্ড নেভিগেশন ও রেজাল্ট বাটন
// ============================================================
$("#backToScript").addEventListener("click", () => goStep(2));
$("#toRenderBtn").addEventListener("click", () => {
  updateSummaries();
  $(".render-setup").hidden = false;
  goStep(5);
});
$("#backToScenes").addEventListener("click", () => goStep(4));
$("#previewBtn").addEventListener("click", () => {
  const v = $("#resultVideo");
  v.scrollIntoView({ behavior: "smooth", block: "center" });
  v.play().catch(() => {});
});
$("#copyLinkBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#downloadBtn").href);
    toast(t("copied"));
  } catch (_) {
    toast($("#downloadBtn").href, "err");
  }
});
$("#createAnotherBtn").addEventListener("click", () => location.reload());
renderStepper();


// ক্যাপশন ফন্টের লাইভ প্রিভিউ (ব্রাউজারে Google Fonts দিয়ে)
$("#captionFontSelect").addEventListener("change", () => {
  $("#fontPreview").style.fontFamily = captionFontOf({ font: $("#captionFontSelect").value }).css + ", sans-serif";
});
$("#fontPreview").style.fontFamily = "'Hind Siliguri', sans-serif";
