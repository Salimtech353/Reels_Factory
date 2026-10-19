// ============================================================
// রিল কারখানা — বাংলা স্ক্রিপ্ট থেকে ভিডিও তৈরি
// সম্পূর্ণ ক্লায়েন্ট-সাইড অ্যাসেম্বলি (FFmpeg.wasm), Netlify Functions
// শুধু Groq/OpenRouter/Pexels/Pixabay API প্রক্সি করার জন্য ব্যবহৃত হয়।
// ============================================================

import { t, getLang, setLang, applyI18n, onLangChange } from "./i18n.js?v=20261050";

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
  keys: { groq: "", openrouter: "", pexels: "", pixabay: "", geminiTranscribe: "", pollinations: "", pollModel: "", ghToken: "", ghRepo: "" },
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
  state.keys.geminiTranscribe = $("#geminiTranscribeKey").value.trim();
  state.keys.pollinations = $("#pollinationsKey").value.trim();
  state.keys.pollModel = $("#pollinationsModel").value.trim();
  state.keys.ghToken = $("#ghToken").value.trim();
  state.keys.ghRepo = $("#ghRepo").value.trim();
  localStorage.setItem("rk_keys", JSON.stringify(state.keys));
  const el = $("#keysStatus");
  if (!(state.keys.groq || state.keys.openrouter) || !state.keys.pexels) {
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
  const parts = ts.trim().split(":").map((p) => parseFloat(p)); // দশমিক সেকেন্ডও চলে (যেমন 00:05.4)
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
  scheduleSave();
  const list = $("#segmentsList");
  list.innerHTML = "";
  state.segments.forEach((seg, idx) => {
    if (seg.media) seg.warn = "";
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
          ${seg.warn ? `<p class="warn-red">⚠ ${escapeHtml(seg.warn)}</p>` : ""}
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
  $("#alignBtn").disabled = false;
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

// ---------- ট্রান্সক্রিপশন: Gemini (প্রধান) → ব্যর্থ হলে স্ক্রিপ্ট দিয়ে API-ছাড়া সময়-মেলানো ----------
const GEMINI_TR_MODEL = "gemini-3.6-flash";

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

// ============================================================
// স্ক্রিপ্ট + অডিওর নীরব বিরতি থেকে সময় বসানো (কোনো AI/API ছাড়া)
// ভয়েসওভার আপনি আগেই বানিয়েছেন, তাই লেখাটা আপনার কাছে আছে — শুধু "কোন লাইন কখন শুরু" সেটা দরকার।
// অডিওর শব্দ মেপে দৃশ্যের মাঝের নীরব বিরতিগুলো খুঁজে প্রতিটা লাইনের সময় ঠিক করা হয়।
// ============================================================

// স্ক্রিপ্ট বক্স থেকে শুধু লেখাগুলো নেয় (আগে থেকে টাইমস্ট্যাম্প থাকলে সেটা বাদ দিয়ে), ফাঁকা লাইন বাদ
function scriptTextLines() {
  const re = /^\d{1,2}:\d{2}(?:[.:]\d+)?\s*-\s*\d{1,2}:\d{2}(?:[.:]\d+)?\s*\|\s*(.*)$/;
  return $("#scriptInput")
    .value.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = re.exec(l);
      return (m ? m[1] : l).trim();
    })
    .filter(Boolean);
}

// অডিও ডিকোড করে প্রতি ২০ মিলিসেকেন্ডের শব্দের জোর (dB) বের করে।
// মেমরি কম লাগাতে ৮kHz-এ ডিকোড করা হয় (নীরবতা ধরতে এটুকুই যথেষ্ট)।
async function audioLoudnessFrames(file) {
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error(t("alignNoAudioApi"));
  let ctx;
  try {
    ctx = new AC({ sampleRate: 8000 });
  } catch (_) {
    ctx = new AC();
  }
  let audio;
  try {
    audio = await new Promise((resolve, reject) => ctx.decodeAudioData(buf, resolve, reject));
  } catch (_) {
    throw new Error(t("alignDecodeFail"));
  } finally {
    try {
      ctx.close();
    } catch (_) {}
  }
  const sr = audio.sampleRate;
  const frameLen = Math.max(1, Math.round(sr * 0.02));
  const frames = Math.floor(audio.length / frameLen);
  const chs = [];
  for (let c = 0; c < audio.numberOfChannels; c++) chs.push(audio.getChannelData(c));
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const a = f * frameLen;
    for (let c = 0; c < chs.length; c++) {
      const d = chs[c];
      for (let i = a; i < a + frameLen; i++) sum += d[i] * d[i];
    }
    db[f] = 20 * Math.log10(Math.sqrt(sum / (frameLen * chs.length)) + 1e-9);
  }
  return { db, frameSec: frameLen / sr };
}

// thr (dB) এর নিচে টানা minSec সেকেন্ড থাকলে সেটা একটা "নীরব অংশ"
function findSilences(db, frameSec, thr, minSec) {
  const out = [];
  let start = -1;
  for (let i = 0; i < db.length; i++) {
    if (db[i] < thr) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if ((i - start) * frameSec >= minSec) out.push({ s: start * frameSec, e: i * frameSec });
      start = -1;
    }
  }
  if (start >= 0 && (db.length - start) * frameSec >= minSec) out.push({ s: start * frameSec, e: db.length * frameSec });
  return out;
}

// ---- সীমানা বাছাই: লেখার দৈর্ঘ্য + বিরতির দৈর্ঘ্য দুটো মিলিয়ে, আর স্পষ্ট বিরতি না থাকলে লাইন জুড়ে দেওয়া ----
// কথা বলার গতি মোটামুটি স্থির ধরে প্রতিটা লাইনের শেষ কোথায় হওয়ার কথা তা লেখার অক্ষর-অনুপাত থেকে আন্দাজ করা হয়।
// তারপর ডায়নামিক প্রোগ্রামিং (DP) দিয়ে প্রতিটা লাইন-সীমানার জন্য হয় (ক) আন্দাজের কাছাকাছি একটা যথেষ্ট লম্বা বিরতি বাছা হয়,
// নইলে (খ) সীমানাটা বাদ দিয়ে দুই লাইন জুড়ে একটা দৃশ্য করা হয় (যে লাইনের শেষে কণ্ঠে থামা নেই)।
// শেষে ১.৫ সেকেন্ডের চেয়ে ছোট কোনো দৃশ্য থাকলে সেটাও পাশের দৃশ্যের সাথে জোড়া লাগে।
function alignScriptTimes(lines, loud) {
  const n = lines.length;
  const { db, frameSec } = loud;
  const total = db.length * frameSec;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sorted = Array.from(db).sort((a, b) => a - b);
  const p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : -20;
  const thr = clamp(p90 - 30, -55, -36); // এর নিচে = নীরব
  const MIN_PAUSE = 0.12; // এর চেয়ে ছোট থামা (শব্দের ভেতরের ফাঁক) ধরা হয় না
  const MIN_SCENE = 1.5; // এর চেয়ে ছোট দৃশ্য রাখা হয় না (জুড়ে দেওয়া হয়)

  // cum[i] = i-তম ফ্রেমের আগে মোট কতটা কথার সময় (সেকেন্ড) পার হয়েছে
  const cum = new Float32Array(db.length + 1);
  let first = -1;
  let last = -1;
  for (let i = 0; i < db.length; i++) {
    const sp = db[i] >= thr;
    cum[i + 1] = cum[i] + (sp ? frameSec : 0);
    if (sp) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return { error: true };
  const tStart = first * frameSec;
  const tEnd = (last + 1) * frameSec;
  const speechTotal = cum[db.length];

  // শুরু ও শেষের নীরবতা বাদ দিয়ে ভেতরের সব বিরতি = সম্ভাব্য সীমানা
  const cands = findSilences(db, frameSec, thr, MIN_PAUSE)
    .filter((q) => q.s > tStart + 0.05 && q.e < tEnd - 0.05)
    .map((q) => ({ ...q, len: q.e - q.s, at: cum[Math.round(q.s / frameSec)] }));
  const M = cands.length;

  // keep[i] = i-নম্বর লাইনের পর সীমানা রাখা হবে কিনা; bound[i] = সেই বিরতি
  const keep = new Array(Math.max(0, n - 1)).fill(false);
  const bound = new Array(Math.max(0, n - 1)).fill(null);
  if (n > 1 && M > 0) {
    const w = lines.map((l) => Math.max(1, [...l.replace(/\s+/g, "")].length));
    const wTotal = w.reduce((a, b) => a + b, 0);
    const target = [];
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      acc += w[i];
      target.push((acc / wTotal) * speechTotal);
    }
    const SIG = Math.max(1.5, 0.03 * speechTotal); // আন্দাজের সহনশীলতা (সেকেন্ড)
    const BONUS = 1.5; // লম্বা বিরতির জন্য পুরস্কার
    const SKIP = -1.6; // সীমানা বাদ দিয়ে জুড়ে দেওয়ার খরচ: বিরতি ছোট বা আন্দাজ থেকে দূরে হলে এটাই জেতে
    const cost = (i, c) => {
      const e = (cands[c].at - target[i]) / SIG;
      return e * e - BONUS * Math.log(1 + cands[c].len / 0.15);
    };
    // অবস্থা s: 0 = এখনো কোনো বিরতি নেওয়া হয়নি, s = c+1 মানে সর্বশেষ নেওয়া বিরতি c
    const S = M + 1;
    let prev = new Float64Array(S).fill(Infinity);
    prev[0] = 0;
    const kinds = [];
    const backs = [];
    for (let i = 0; i < n - 1; i++) {
      const cur = new Float64Array(S).fill(Infinity);
      const kind = new Uint8Array(S); // 0 = বাদ (জুড়ে দেওয়া), 1 = বিরতি নেওয়া
      const back = new Int32Array(S).fill(-1);
      for (let s = 0; s < S; s++) {
        if (prev[s] < Infinity) {
          cur[s] = prev[s] + SKIP;
          back[s] = s;
        }
      }
      let runMin = Infinity;
      let runArg = -1;
      for (let c = 0; c < M; c++) {
        if (prev[c] < runMin) {
          runMin = prev[c];
          runArg = c;
        }
        if (runArg >= 0) {
          const v = runMin + cost(i, c);
          if (v < cur[c + 1]) {
            cur[c + 1] = v;
            kind[c + 1] = 1;
            back[c + 1] = runArg;
          }
        }
      }
      kinds.push(kind);
      backs.push(back);
      prev = cur;
    }
    let s = 0;
    let bv = Infinity;
    for (let x = 0; x < S; x++) {
      if (prev[x] < bv) {
        bv = prev[x];
        s = x;
      }
    }
    for (let i = n - 2; i >= 0; i--) {
      if (kinds[i][s] === 1) {
        keep[i] = true;
        bound[i] = cands[s - 1];
      }
      s = backs[i][s];
    }
  }

  // রাখা সীমানাগুলো থেকে দৃশ্য বানানো; দৃশ্যের শুরু ০.১ সেকেন্ড নির্ভুলতায়, পরের কথা শুরুর ঠিক আগে
  const r1 = (v) => Math.round(v * 10) / 10;
  let groups = []; // প্রতিটা দৃশ্য = লেখা + তার পরের সীমানা (বিরতি)
  let curText = [];
  lines.forEach((text, i) => {
    curText.push(text);
    if (i === n - 1 || keep[i]) {
      groups.push({ text: curText.join(" "), pause: i === n - 1 ? null : bound[i] });
      curText = [];
    }
  });
  const timesOf = (gs) => {
    const st = [0];
    let prevCut = 0;
    for (let i = 0; i < gs.length - 1; i++) {
      const q = gs[i].pause;
      let cut = r1(q.e - Math.min(0.15, q.len / 2));
      cut = Math.max(cut, r1(prevCut + 0.5));
      st.push(cut);
      prevCut = cut;
    }
    const end = Math.max(r1(total + 0.04), r1(prevCut + 0.5));
    return gs.map((g, i) => ({ start: st[i], end: i < gs.length - 1 ? st[i + 1] : end, text: g.text }));
  };
  // খুব ছোট (<MIN_SCENE) দৃশ্য পাশের দৃশ্যের সাথে জোড়া — যে পাশের বিরতি ছোট সেদিকে
  for (;;) {
    const ts = timesOf(groups);
    const k = ts.findIndex((sg) => sg.end - sg.start < MIN_SCENE);
    if (k < 0 || groups.length === 1) break;
    let m; // কোন সীমানা তুলে দেব (m আর m+1 জুড়বে)
    if (k === 0) m = 0;
    else if (k === groups.length - 1) m = k - 1;
    else m = groups[k - 1].pause.len <= groups[k].pause.len ? k - 1 : k;
    groups.splice(m, 2, { text: groups[m].text + " " + groups[m + 1].text, pause: groups[m + 1].pause });
  }
  const segments = timesOf(groups);
  return { segments, merged: n - segments.length };
}

// ০.১ সেকেন্ড নির্ভুল সময় লেখা: পূর্ণ সেকেন্ড হলে "mm:ss", নইলে "mm:ss.d" (অ্যাপ দুটোই পড়তে পারে)
function secToClockFine(sec) {
  const v = Math.max(0, Math.round(sec * 10) / 10);
  const mm = Math.floor(v / 60);
  const ss = v - mm * 60;
  const ssText = Number.isInteger(ss) ? String(ss).padStart(2, "0") : ss.toFixed(1).padStart(4, "0");
  return `${String(mm).padStart(2, "0")}:${ssText}`;
}

async function alignFromScript(file, extraNotes = []) {
  const lines = scriptTextLines();
  if (!lines.length) {
    setAudioNotes([{ key: "alignNoScript" }], true);
    return false;
  }
  $("#alignBtn").disabled = true;
  setAudioNotes([...extraNotes, { key: "alignWorking" }]);
  try {
    const loud = await audioLoudnessFrames(file);
    const r = alignScriptTimes(lines, loud);
    if (r.error) {
      setAudioNotes([{ key: "alignNoSpeech" }], true);
      return false;
    }
    const segments = splitLongSegments(r.segments);
    $("#scriptInput").value = segments.map((sg) => `${secToClockFine(sg.start)}-${secToClockFine(sg.end)} | ${sg.text.trim()}`).join("\n");
    const notes = [...extraNotes, { key: "alignReady", params: { n: r.segments.length } }];
    if (r.merged > 0) notes.push({ key: "alignMerged", params: { lines: lines.length, merged: r.merged, n: r.segments.length } });
    setAudioNotes(notes, extraNotes.length > 0 || r.merged > 0); // সতর্কতা থাকলে লাল
    return true;
  } catch (e) {
    setAudioNotes([{ key: "trFail", params: { msg: e.message } }], true);
    return false;
  } finally {
    $("#alignBtn").disabled = false;
  }
}

$("#alignBtn").addEventListener("click", () => {
  if (state.audioFile) alignFromScript(state.audioFile);
});

// ---------- অটো ট্রান্সক্রিপশন: Gemini (প্রধান) → ব্যর্থ হলে স্ক্রিপ্ট বক্সের লেখা দিয়ে API ছাড়া সময়-মেলানো ----------
async function autoTranscribeAudio(file) {
  let rateLimited = false;
  // Gemini সফল হলে বক্সের লেখা বদলে যাবে, তাই ফলব্যাকের জন্য স্ক্রিপ্ট আছে কিনা আগেই দেখে রাখা হয়
  const haveScript = scriptTextLines().length > 0;
  const geminiUsable = Boolean(state.keys.geminiTranscribe) && file.size <= TRANSCRIBE_MAX_BYTES;

  if (!geminiUsable) {
    const why = !state.keys.geminiTranscribe ? { key: "noTrKeyUseAlign" } : { key: "fileTooBig", params: { mb: (file.size / 1024 / 1024).toFixed(1) } };
    if (haveScript) await alignFromScript(file, [why]);
    else setAudioNotes([!state.keys.geminiTranscribe ? { key: "noTrKey" } : why]);
    return;
  }

  $("#transcribeBtn").disabled = true;
  try {
    const base64 = await fileToBase64(file);
    setAudioNotes([{ key: "transcribing", params: { name: "Gemini" } }]);
    const rawSegments = await transcribeViaGemini(file, base64);

    // "mm:ss" স্ট্রিং সেকেন্ডে রূপান্তর, যাতে সেগমেন্টের আকার scriptLines-এর সাথে মেলে
    let segments = rawSegments.map((s) => ({ start: tsToSeconds(s.start), end: tsToSeconds(s.end), text: String(s.text) }));
    segments = splitLongSegments(segments);

    const scriptLines = segments
      .map((s) => `${secToClock(s.start)}-${secToClock(s.end)} | ${s.text.trim()}`)
      .filter((line) => !line.endsWith("| "))
      .join("\n");
    $("#scriptInput").value = scriptLines;
    setAudioNotes([{ key: "trReady", params: { n: segments.length } }]);
  } catch (err) {
    if (haveScript) {
      // Gemini ব্যর্থ — স্ক্রিপ্ট বক্সে লেখা থাকলে API ছাড়া পদ্ধতিতে সময় মেলানো
      await alignFromScript(file, [{ key: "trGeminiFailedUseAlign", params: { msg: err.message } }]);
    } else {
      setAudioNotes([{ key: "trFail", params: { msg: err.message } }, { key: "trAlignTip" }], true);
      if (isRateLimitError(err.message)) {
        setAudioNotes([...state.audioNotes, { key: "rateLimit" }], true);
        rateLimited = true;
        startCooldown($("#transcribeBtn"), 40);
      }
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
const keysOk = Boolean((state.keys.groq || state.keys.openrouter) && state.keys.pexels);
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
  await ensureProject(); // এই ভিডিওর প্রজেক্ট তৈরি — এরপর সব কিছু নিজে থেকে সেভ হয়
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
    setMsg(statusEl, msgParts, data.fallbackUsed ? "status-line err" : "status-line ok");
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
// রেন্ডার সেটিংস: রেজোলিউশন, ক্যাপশন ফন্ট, ডিফল্ট মিউজিক
// (ভিডিও রেন্ডার হয় GitHub Actions + FFmpeg দিয়ে — নিচে "GitHub Actions" অংশ দেখুন)
// ============================================================
const RES_MAP = { "854x480": "sd", "1280x720": "hd", "1920x1080": "1080" };
// প্রতিটা aspect ratio + resolution তালিকার আনুমানিক পিক্সেল মাপ — শুধু ক্যাপশন
// বক্সের আকার ঠিকমতো বসানোর জন্য ব্যবহার হয়, রেন্ডারিং resolution+aspectRatio
// প্যারামিটার দিয়েই রেন্ডারার নিজে করে।
const RES_DIMENSIONS = {
  "16:9": { sd: { w: 1024, h: 576 }, hd: { w: 1280, h: 720 }, "1080": { w: 1920, h: 1080 } },
  "9:16": { sd: { w: 576, h: 1024 }, hd: { w: 720, h: 1280 }, "1080": { w: 1080, h: 1920 } },
  "1:1": { sd: { w: 576, h: 576 }, hd: { w: 720, h: 720 }, "1080": { w: 1080, h: 1080 } },
};
// বাংলা লেখার জন্য রেন্ডারার-এর ডিফল্ট ফন্টে গ্লিফ নেই (বক্স/টোফু দেখাবে),
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

const TRANSITION_STYLES = ["fade", "slideLeft", "slideRight", "slideUp", "zoom", "carouselLeft", "carouselRight", "wipeLeft", "wipeRight"];

const BORDER_COLOR = "#1A1A1A"; // ব্ল্যাক অ্যাশ — নিরেট কালো নয়, সামান্য ধূসর-কালো

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
  await buildViaGithub(buildBtn); // রেন্ডার এখন শুধু GitHub Actions + FFmpeg দিয়ে
});

// ============================================================
// GitHub Actions + FFmpeg — বিকল্প রেন্ডার মেথড
// অ্যাপ জবের ফাইল রিপোতে পাঠায় → workflow চালু করে → GitHub-এ FFmpeg রেন্ডার করে
// → ফলাফল Release হিসেবে ফেরত আসে। পিসি চালু রাখতে হয় না।
// ============================================================
// ব্যাকগ্রাউন্ড মিউজিক + ducking (শুধু GitHub মেথডে)
// সাবস্ক্রাইব ওভারলে ও এন্ড স্ক্রিন ফাইলের ঠিকানা (Reels_Factory রিপোর File/ ফোল্ডার)
const BRAND_BASE = "https://raw.githubusercontent.com/Salimtech353/Reels_Factory/main/File/";
const BRAND_FILES = {
  overlay: { youtube: "Overly/Youtube.mp4", facebook: "Overly/Facebook.mp4" },
  endscreen: { youtube: "Endscreen/Youtube.mp4", facebook: "Endscreen/Facebook.mp4" },
};
const MUSIC_DEFAULTS = { vol: 40, duck: 14 };
(function initMusicControls() {
  const vol = $("#musicVol");
  const duck = $("#musicDuckVol");
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
  label();
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

// FFmpeg রেন্ডারারের জন্য জবের বিবরণ (JSON) তৈরি; ক্যাপশন ব্রাউজারে আসল ফন্ট দিয়ে মেপে সাজানো
async function buildRenderJob(resolutionKey, aspectRatio, captionsEnabled, opts) {
  const dim = (RES_DIMENSIONS[aspectRatio] || RES_DIMENSIONS["9:16"])[resolutionKey] || RES_DIMENSIONS["9:16"].sd;
  // বর্ডার নেই: ফুটেজ পুরো ফ্রেম জুড়ে থাকে
  const cw = dim.w;
  const ch = dim.h;

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
    const job = await buildRenderJob(resolutionKey, aspectRatio, $("#captionToggle").checked, {
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

// ============================================================
// প্রকাশের তথ্য তৈরি: YouTube / Facebook Reels / TikTok
// স্ক্রিপ্ট (state.segments) থেকে AI দিয়ে শিরোনাম, বর্ণনা, ট্যাগ, হ্যাশট্যাগ ইত্যাদি বানায়।
// কোনো সার্ভার লাগে না — ব্রাউজার থেকে সরাসরি Gemini → Groq → OpenRouter (যে চাবি আছে সেই ক্রমে) ডাকা হয়।
// চ্যাপ্টারের সময় AI-এর আন্দাজ নয়, দৃশ্যের আসল সময় (startSec) থেকে বসানো হয়।
// ============================================================
const CHANNEL_NAME = "Time Trails";
const CHANNEL_ABOUT = "ঐতিহাসিক স্থান ও বস্তুর গল্প";
const PUB = { platform: null, cache: {}, sig: "", fields: [], busy: false };

const pubEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pubSig = () => state.segments.map((s) => s.text).join("\n");

// চ্যাপ্টারের সময় লেখা: 00:00 বা 1:02:03
function fmtChapterTime(sec) {
  const v = Math.max(0, Math.floor(sec));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  const mm = String(m).padStart(h ? 2 : 2, "0");
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

// AI-র দেওয়া চ্যাপ্টার তালিকা থেকে ইউটিউব-নিয়ম মেনে চ্যাপ্টার ব্লক:
// প্রথমটা 00:00 হতে হবে, কমপক্ষে ৩টা, পরপর দুটোর মাঝে ≥১০ সেকেন্ড
function buildChapters(chs, segments) {
  const list = (Array.isArray(chs) ? chs : [])
    .map((c) => ({ i: Number(c.scene) - 1, title: String(c.title || "").trim() }))
    .filter((c) => Number.isInteger(c.i) && c.i >= 0 && c.i < segments.length && c.title)
    .sort((a, b) => a.i - b.i);
  if (!list.length || list[0].i !== 0) list.unshift({ i: 0, title: "ভূমিকা" });
  const out = [];
  for (const c of list) {
    const ts = segments[c.i].startSec;
    if (out.length && (ts - out[out.length - 1].t < 10 || c.i === out[out.length - 1].i)) continue;
    out.push({ i: c.i, t: ts, title: c.title });
  }
  if (out.length < 3) return "";
  out[0].t = 0;
  return out.map((c) => `${fmtChapterTime(c.t)} ${c.title}`).join("\n");
}

// ট্যাগ: ডুপ্লিকেট বাদ, মোট ৪৮০ অক্ষরের মধ্যে (ইউটিউবের সীমা ৫০০)
function cleanTags(tags) {
  const seen = new Set();
  const out = [];
  let len = 0;
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tg = String(raw).replace(/^#/, "").trim();
    const key = tg.toLowerCase();
    if (!tg || seen.has(key)) continue;
    if (len + tg.length + 1 > 480) break;
    seen.add(key);
    out.push(tg);
    len += tg.length + 1;
  }
  return out;
}

// হ্যাশট্যাগ: # দিয়ে শুরু, ভেতরে ফাঁকা নেই, সর্বোচ্চ max টা
function cleanHashtags(tags, max) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tg = "#" + String(raw).replace(/^#+/, "").replace(/[\s#]+/g, "");
    if (tg.length < 2 || seen.has(tg.toLowerCase())) continue;
    seen.add(tg.toLowerCase());
    out.push(tg);
    if (out.length >= max) break;
  }
  return out;
}

function pubPrompt(platform) {
  const scenes = state.segments.map((s, i) => `${i + 1}. [${fmtChapterTime(s.startSec)}] ${s.text}`).join("\n");
  const common =
    `You write publishing metadata in Bangla (Bengali) for the YouTube channel "${CHANNEL_NAME}", which makes short videos about historical places and objects.\n` +
    `STRICT RULES: use ONLY facts that appear in the script below; never invent numbers, dates, names or claims; keep every place name spelled exactly as in the script; ` +
    `natural, engaging Bangla; no misleading clickbait; no emojis in titles. Reply with ONE valid JSON object and nothing else.\n\n` +
    `SCRIPT (scene number, start time, text):\n${scenes}\n\n`;
  if (platform === "youtube")
    return (
      common +
      `Return JSON with exactly these keys:\n` +
      `"titles": array of 5 different Bangla titles, each at most 60 characters (curiosity, direct-fact, question styles; put the main place/subject near the start),\n` +
      `"description": Bangla text. First two lines = a strong hook that also contains the main keywords. Then 2-4 short paragraphs summarizing the video. No hashtags, no timestamps, no channel footer,\n` +
      `"chapters": array of 6-10 objects {"scene": <scene number from the script, ascending, first must be 1>, "title": <Bangla, at most 5 words>},\n` +
      `"tags": array of 15-20 YouTube tags (mix Bangla and English; include the place name, history, Bangladesh, travel, etc.),\n` +
      `"hashtags": array of 3-5 hashtags,\n` +
      `"pinnedComment": one friendly Bangla question to start discussion,\n` +
      `"thumbnailTexts": array of 3 Bangla thumbnail texts, 2-4 words each,\n` +
      `"category": the best YouTube category name in English.`
    );
  if (platform === "facebook")
    return (
      common +
      `This is for a Facebook Reel. Return JSON with exactly these keys:\n` +
      `"caption": Bangla caption: first line is a short hook, then 2-4 short lines, light use of emojis, ends with a question to the audience. No hashtags inside,\n` +
      `"hashtags": array of 3-5 hashtags,\n` +
      `"firstComment": a short Bangla first comment from the page,\n` +
      `"hookTexts": array of 3 on-screen hook lines (Bangla, at most 8 words each).`
    );
  return (
    common +
    `This is for TikTok. Return JSON with exactly these keys:\n` +
    `"hookTexts": array of 3 on-screen hook lines for the first 2 seconds (Bangla, at most 7 words each),\n` +
    `"caption": Bangla caption of at most 150 characters, no hashtags inside,\n` +
    `"hashtags": array of 4-6 hashtags mixing broad ones (e.g. #history #bangladesh) and niche ones for this place,\n` +
    `"coverText": a short Bangla cover-image text (2-4 words).`
  );
}

function extractJson(text) {
  const s = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error(t("pubBadJson"));
  return JSON.parse(s.slice(a, b + 1));
}

async function llmGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TR_MODEL}:generateContent?key=${encodeURIComponent(state.keys.geminiTranscribe)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7 } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(t("pubBadJson"));
  return extractJson(text);
}

// OpenAI-সামঞ্জস্যপূর্ণ API (Groq, OpenRouter) — মডেলের তালিকা একে একে চেষ্টা
async function llmChat(url, key, models, prompt, jsonMode, extraHeaders = {}) {
  let lastErr = null;
  for (const model of models) {
    try {
      const body = { model, temperature: 0.7, messages: [{ role: "user", content: prompt }] };
      if (jsonMode) body.response_format = { type: "json_object" };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error(t("pubBadJson"));
      return extractJson(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(t("pubBadJson"));
}

async function generatePublishJson(prompt) {
  const errs = [];
  if (state.keys.geminiTranscribe) {
    try {
      return await llmGemini(prompt);
    } catch (e) {
      errs.push("Gemini: " + e.message);
    }
  }
  if (state.keys.groq) {
    try {
      return await llmChat("https://api.groq.com/openai/v1/chat/completions", state.keys.groq, ["openai/gpt-oss-120b", "llama-3.1-8b-instant"], prompt, true);
    } catch (e) {
      errs.push("Groq: " + e.message);
    }
  }
  if (state.keys.openrouter) {
    try {
      return await llmChat("https://openrouter.ai/api/v1/chat/completions", state.keys.openrouter, ["google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct:free"], prompt, false, { "X-Title": "Reels Factory" });
    } catch (e) {
      errs.push("OpenRouter: " + e.message);
    }
  }
  throw new Error(errs.length ? errs.join(" | ") : t("pubNoKey"));
}

const asList = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

// AI-র JSON থেকে দেখানোর ঘরগুলো বানানো (প্ল্যাটফর্ম অনুযায়ী)
function pubFieldsFrom(platform, j) {
  const f = [];
  if (platform === "youtube") {
    const titles = asList(j.titles).slice(0, 5);
    f.push({ label: t("pfTitles"), value: titles.join("\n"), meta: titles.map((x) => [...x].length).join(" · ") + " " + t("pubChars") });
    const chapters = buildChapters(j.chapters, state.segments);
    const hashtags = cleanHashtags(j.hashtags, 5);
    const footer = `🔔 ${t("pubFooterCta")} — ${CHANNEL_NAME}\n📍 ${CHANNEL_ABOUT}`;
    const desc = [String(j.description || "").trim(), chapters, footer, hashtags.join(" ")].filter(Boolean).join("\n\n");
    f.push({ label: t("pfDescription"), value: desc, meta: chapters ? t("pubWithChapters") : t("pubNoChapters") });
    f.push({ label: t("pfTags"), value: cleanTags(j.tags).join(", "), meta: "" });
    f.push({ label: t("pfHashtags"), value: hashtags.join(" "), meta: "" });
    f.push({ label: t("pfPinned"), value: String(j.pinnedComment || "").trim(), meta: "" });
    f.push({ label: t("pfThumb"), value: asList(j.thumbnailTexts).slice(0, 3).join("\n"), meta: "" });
    f.push({ label: t("pfCategory"), value: String(j.category || "").trim(), meta: "" });
  } else if (platform === "facebook") {
    const hashtags = cleanHashtags(j.hashtags, 5);
    f.push({ label: t("pfCaption"), value: [String(j.caption || "").trim(), hashtags.join(" ")].filter(Boolean).join("\n\n"), meta: "" });
    f.push({ label: t("pfFirstComment"), value: String(j.firstComment || "").trim(), meta: "" });
    f.push({ label: t("pfHooks"), value: asList(j.hookTexts).slice(0, 3).join("\n"), meta: "" });
  } else {
    const hashtags = cleanHashtags(j.hashtags, 6);
    const cap = [String(j.caption || "").trim(), hashtags.join(" ")].filter(Boolean).join(" ");
    f.push({ label: t("pfCaption"), value: cap, meta: [...cap].length + " " + t("pubChars") });
    f.push({ label: t("pfHooks"), value: asList(j.hookTexts).slice(0, 3).join("\n"), meta: "" });
    f.push({ label: t("pfCover"), value: String(j.coverText || "").trim(), meta: "" });
  }
  return f.filter((x) => x.value);
}

function pubRender() {
  const out = $("#pubOut");
  out.innerHTML =
    PUB.fields
      .map(
        (f, i) =>
          `<div class="pub-field"><div class="pub-field-head"><b>${pubEsc(f.label)}</b><span class="pub-meta">${pubEsc(f.meta || "")}</span>` +
          `<button type="button" class="btn btn-ghost pub-copy" data-i="${i}">${pubEsc(t("pubCopy"))}</button></div><pre class="pub-text">${pubEsc(f.value)}</pre></div>`
      )
      .join("") +
    `<p class="hint">${pubEsc(t("pubReview"))}</p>`;
  $("#pubActions").hidden = false;
}

async function pubCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(t("pubCopied"));
}

async function pubGenerate(platform, force = false) {
  if (PUB.busy) return;
  if (!state.segments.length) {
    toast(t("pubNoScript"), "err");
    return;
  }
  const sig = pubSig();
  if (sig !== PUB.sig) {
    PUB.cache = {};
    PUB.sig = sig;
  }
  PUB.platform = platform;
  $$(".pub-tab").forEach((b) => b.classList.toggle("active", b.dataset.pf === platform));
  if (PUB.cache[platform] && !force) {
    PUB.fields = PUB.cache[platform];
    pubRender();
    return;
  }
  PUB.busy = true;
  $("#pubActions").hidden = true;
  $("#pubOut").innerHTML = `<p class="hint">⏳ ${pubEsc(t("pubGenerating"))}</p>`;
  try {
    const json = await generatePublishJson(pubPrompt(platform));
    PUB.fields = pubFieldsFrom(platform, json);
    if (!PUB.fields.length) throw new Error(t("pubBadJson"));
    PUB.cache[platform] = PUB.fields;
    pubRender();
    scheduleSave();
  } catch (e) {
    $("#pubOut").innerHTML = `<p class="hint" style="color:#E8A33D;">${pubEsc(t("pubFail", { msg: e.message }))}</p>`;
  } finally {
    PUB.busy = false;
  }
}

$$(".pub-tab").forEach((b) => b.addEventListener("click", () => pubGenerate(b.dataset.pf)));
$("#pubRegen").addEventListener("click", () => PUB.platform && pubGenerate(PUB.platform, true));
$("#pubCopyAll").addEventListener("click", () => pubCopy(PUB.fields.map((f) => `${f.label}\n${f.value}`).join("\n\n")));
$("#pubOut").addEventListener("click", (e) => {
  const btn = e.target.closest(".pub-copy");
  if (btn) pubCopy(PUB.fields[Number(btn.dataset.i)].value);
});

// ============================================================
// প্রজেক্ট সেভ (ব্রাউজারের IndexedDB) — প্রতিটা ভিডিওর সব তথ্য ও ফাইল
// • ফোন থেকে বাছা অডিও/মিউজিক/আপলোড/AI ছবির কপি ব্রাউজারেই রাখা হয় (কোনো সার্ভারে যায় না),
//   তাই আসল ফাইল ফোন থেকে মুছে ফেললেও প্রজেক্ট খুললে সব থাকে।
// • সর্বশেষ PROJ_MAX টা প্রজেক্ট রাখা হয়; নতুনটা এলে সবচেয়ে পুরনোটা সরে যায়।
// • সেভ হয় নিজে থেকে (বিশ্লেষণ, মিডিয়া বদল, সেটিংস, স্ক্রিপ্ট/অডিও বদল, রেন্ডার) — আপনাকে কিছু চাপতে হয় না।
// • Recent Renders-এ "Open" চাপলে প্রজেক্ট সব তথ্যসহ "Audio and Script" ধাপে খোলে, নতুন করে বিশ্লেষণ/সার্চ হয় না।
// ============================================================
const PROJ_MAX = 20;
const SAVED = new WeakSet(); // যে ফাইল-অবজেক্ট ইতিমধ্যে স্টোরেজে লেখা হয়েছে
let RECENT_ITEMS = [];

let _dbPromise = null;
function idb() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unsupported"));
      const rq = indexedDB.open("reels-factory", 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        db.createObjectStore("projects", { keyPath: "id" }); // প্রজেক্টের তথ্য
        db.createObjectStore("files"); // ফাইল (Blob): কী = "<প্রজেক্ট>:audio" / ":music" / ":seg:<দৃশ্য>"
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }
  return _dbPromise;
}
async function idbDo(store, mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const idbPut = (store, val, key) => idbDo(store, "readwrite", (st) => (key === undefined ? st.put(val) : st.put(val, key)));
const idbGet = (store, key) => idbDo(store, "readonly", (st) => st.get(key));
const idbDel = (store, key) => idbDo(store, "readwrite", (st) => st.delete(key));
const idbAll = (store) => idbDo(store, "readonly", (st) => st.getAll());
const idbKeysWithPrefix = (prefix) => idbDo("files", "readonly", (st) => st.getAllKeys(IDBKeyRange.bound(prefix, prefix + "\uffff")));

let _warnedStorage = false;
function storageWarn() {
  if (_warnedStorage) return;
  _warnedStorage = true;
  toast(t("projSaveFail"), "err");
}

// ---- প্রজেক্ট তৈরি / মোছা ----
async function deleteProject(id) {
  try {
    const keys = await idbKeysWithPrefix(id + ":");
    for (const k of keys) await idbDel("files", k);
    await idbDel("projects", id);
  } catch (_) {}
  if (state.projectId === id) state.projectId = null;
}

async function ensureProject() {
  if (state.projectId) return;
  try {
    const all = await idbAll("projects");
    all.sort((a, b) => a.ts - b.ts);
    while (all.length >= PROJ_MAX) await deleteProject(all.shift().id); // সবচেয়ে পুরনোটা সরে যায়
    state.projectId = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.projectCreated = Date.now();
    state.video = null;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // ব্রাউজার যেন সহজে না মোছে
  } catch (_) {
    state.projectId = null;
    storageWarn();
  }
}

// ---- প্রজেক্টের অবস্থা (JSON) ----
const SETTING_IDS = ["aspectSelect", "resSelect", "captionToggle", "captionFontSelect", "captionSizeSelect", "captionColorSelect", "captionAnimSelect", "overlaySel", "endSel", "musicVol", "musicDuckVol"];
function snapshotSettings() {
  const o = {};
  SETTING_IDS.forEach((id) => {
    const el = $("#" + id);
    o[id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return o;
}
function serializeSegments() {
  return state.segments.map((seg) => {
    const { media, ...rest } = seg;
    const copy = JSON.parse(JSON.stringify(rest));
    if (copy.status === "searching") copy.status = media ? "ready" : "attention";
    copy.media = media
      ? media.source === "upload"
        ? { source: "upload", type: media.type, duration: media.duration || null }
        : JSON.parse(JSON.stringify(media))
      : null;
    return copy;
  });
}
async function smallThumb(file) {
  try {
    const bmp = await createImageBitmap(file);
    const w = 160;
    const h = Math.round((bmp.height / bmp.width) * w) || 90;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.7);
  } catch (_) {
    return "";
  }
}

let _saveChain = Promise.resolve();
function scheduleSave() {
  if (!state.projectId || state.restoring) return;
  clearTimeout(state._saveT);
  state._saveT = setTimeout(() => {
    _saveChain = _saveChain.then(saveProjectNow).catch(() => {});
  }, 500);
}

async function saveProjectNow() {
  if (!state.projectId || state.restoring) return;
  const pid = state.projectId;
  try {
    // ১) ফাইল: নতুন/বদলানোগুলো লেখা, আর বাদ পড়া ফাইল মোছা
    const want = new Map();
    if (state.audioFile) want.set(`${pid}:audio`, state.audioFile);
    if (state.bgMusicFile) want.set(`${pid}:music`, state.bgMusicFile);
    state.segments.forEach((seg) => {
      if (seg.media && seg.media.source === "upload" && seg.media.file) want.set(`${pid}:seg:${seg.id}`, seg.media.file);
    });
    for (const [key, file] of want) {
      if (!SAVED.has(file)) {
        await idbPut("files", file, key);
        SAVED.add(file);
      }
    }
    for (const k of await idbKeysWithPrefix(pid + ":")) if (!want.has(k)) await idbDel("files", k);

    // ২) প্রজেক্টের তথ্য
    const first = state.segments[0];
    let thumb = state.projectThumb || "";
    if (first && first.media) {
      if (first.media.source !== "upload") thumb = first.media.thumb || thumb;
      else if (first.media.type === "photo" && first.media.file && state.projectThumbFor !== first.media.file) {
        thumb = (await smallThumb(first.media.file)) || thumb;
        state.projectThumbFor = first.media.file;
      }
    }
    state.projectThumb = thumb;
    await idbPut("projects", {
      id: pid,
      created: state.projectCreated || Date.now(),
      ts: Date.now(),
      scriptText: $("#scriptInput").value,
      audioInfo: state.audioInfo || null,
      hasAudio: Boolean(state.audioFile),
      musicName: state.bgMusicFile ? state.bgMusicFile.name : "",
      segments: serializeSegments(),
      settings: snapshotSettings(),
      video: state.video || null,
      pub: { sig: PUB.sig, cache: PUB.cache },
      steps: { done: [...wiz.done], max: wiz.max },
      title: first ? String(first.text).slice(0, 60) : "",
      dur: state.segments.length ? Math.max(...state.segments.map((x) => x.endSec)) : 0,
      count: state.segments.length,
      thumb,
    });
    refreshRecentItems();
  } catch (_) {
    storageWarn();
  }
}

// ---- প্রজেক্ট খোলা (Open) ----
function setControl(id, v, evt) {
  const el = $("#" + id);
  if (v === undefined || v === null) return;
  if (el.type === "checkbox") el.checked = Boolean(v);
  else el.value = v;
  if (evt) el.dispatchEvent(new Event(evt, { bubbles: true }));
}

async function openProject(id) {
  let rec;
  try {
    rec = await idbGet("projects", id);
  } catch (_) {}
  if (!rec) {
    toast(t("projMissing"), "err");
    return;
  }
  state.restoring = true;
  const problems = [];
  try {
    const getFile = async (key) => {
      try {
        const f = await idbGet("files", key);
        if (f) SAVED.add(f);
        return f || null;
      } catch (_) {
        return null;
      }
    };
    state.projectId = rec.id;
    state.projectCreated = rec.created;
    state.video = rec.video || null;
    state.projectThumb = rec.thumb || "";
    state.projectThumbFor = null;

    // স্ক্রিপ্ট ও অডিও
    $("#scriptInput").value = rec.scriptText || "";
    state.audioFile = rec.hasAudio ? await getFile(`${rec.id}:audio`) : null;
    if (rec.hasAudio && !state.audioFile) problems.push(t("projAudioMissing"));
    state.audioInfo = rec.audioInfo || (state.audioFile ? { name: state.audioFile.name, seconds: null } : null);
    state.audioNotes = [];
    state.audioErr = false;
    $("#audioDrop").classList.toggle("has-file", Boolean(state.audioFile));
    $("#audioDefaultNote").hidden = Boolean(state.audioFile);
    renderAudioMeta();
    $("#transcribeBtn").disabled = !state.audioFile;
    $("#alignBtn").disabled = !state.audioFile;

    // ব্যাকগ্রাউন্ড মিউজিক
    state.bgMusicFile = rec.musicName ? await getFile(`${rec.id}:music`) : null;
    if (rec.musicName && !state.bgMusicFile) problems.push(t("projMusicMissing"));
    try {
      const dt = new DataTransfer();
      if (state.bgMusicFile) dt.items.add(state.bgMusicFile);
      $("#bgMusicFile").files = dt.files;
    } catch (_) {}

    // সিন ও মিডিয়া
    state.segments = [];
    for (const sd of rec.segments || []) {
      const seg = { ...sd, warn: "" };
      if (sd.media && sd.media.source === "upload") {
        const f = await getFile(`${rec.id}:seg:${sd.id}`);
        if (f) {
          const url = URL.createObjectURL(f);
          seg.media = { source: "upload", type: sd.media.type, file: f, url, thumb: url, duration: sd.media.duration || null };
        } else {
          seg.media = null;
          seg.status = "attention";
          seg.warn = t("projSceneFileMissing", { n: state.segments.length + 1 });
          problems.push(seg.warn);
        }
      }
      state.segments.push(seg);
    }

    // সেটিংস
    ["aspectSelect", "resSelect", "captionToggle", "captionFontSelect", "overlaySel", "endSel"].forEach((k) => setControl(k, rec.settings && rec.settings[k], "change"));
    ["captionSizeSelect", "captionColorSelect", "captionAnimSelect"].forEach((k) => setControl(k, rec.settings && rec.settings[k]));
    setControl("musicVol", rec.settings && rec.settings.musicVol);
    setControl("musicDuckVol", rec.settings && rec.settings.musicDuckVol);
    $("#musicVolOut").textContent = $("#musicVol").value + "%";
    $("#musicDuckOut").textContent = $("#musicDuckVol").value + "%";

    // প্রকাশের তথ্য (আগে তৈরি করা থাকলে)
    PUB.cache = (rec.pub && rec.pub.cache) || {};
    PUB.sig = (rec.pub && rec.pub.sig) || "";
    PUB.platform = null;
    $("#pubOut").innerHTML = "";
    $("#pubActions").hidden = true;
    $$(".pub-tab").forEach((b) => b.classList.remove("active"));

    // স্ক্রিন সাজানো
    $("#timeline").hidden = false;
    $("#panelBuild").hidden = !state.segments.length;
    renderSegments();
    updateSummaries();
    refreshBuildAvailability();
    setMsg($("#analyzeStatus"), { key: "projOpened" }, "status-line ok");
    wiz.done = new Set(rec.steps && rec.steps.done && rec.steps.done.length ? rec.steps.done : [2, 3, 4]);
    wiz.max = Math.max(rec.steps && rec.steps.max ? rec.steps.max : 4, state.segments.length ? 4 : 2);
    $(".render-setup").hidden = false;
    $("#progressWrap").hidden = true;
    if (state.video) {
      wiz.done.add(5);
      wiz.max = 5;
      $("#resultVideo").src = state.video.url;
      $("#downloadBtn").href = state.video.url;
      $("#resultBox").hidden = false;
    } else {
      $("#resultBox").hidden = true;
    }
    $("#resultWarn").hidden = true;
    goStep(2); // সবসময় প্রথম ধাপ: Audio and Script — বাকি ধাপের তথ্য আগে থেকেই সেভ করা
  } finally {
    state.restoring = false;
  }
  problems.forEach((m) => toast(m, "err"));
  renderRecentList(state.video && state.video.url);
  checkRemoteLinks(rec.id);
}

// সেভ করা স্টক-মিডিয়ার লিংক এখনো কাজ করছে কিনা (ভাঙা লিংকে লাল সতর্কতা + "আবার সার্চ করুন")
function probeMedia(media) {
  return new Promise((resolve) => {
    const isVideo = media.type === "video";
    const el = document.createElement(isVideo ? "video" : "img");
    const done = (v) => {
      clearTimeout(timer);
      el.onload = el.onerror = el.onloadedmetadata = null;
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 10000); // সময় শেষ = অনিশ্চিত, ভাঙা ধরা হয় না
    el.onerror = () => done(false);
    if (isVideo) {
      el.preload = "metadata";
      el.muted = true;
      el.onloadedmetadata = () => done(true);
      el.src = media.url;
    } else {
      el.onload = () => done(true);
      el.src = media.thumb || media.url;
    }
  });
}
async function checkRemoteLinks(pid) {
  const todo = state.segments.filter((s) => s.media && s.media.source !== "upload");
  let broken = 0;
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const seg = todo[i++];
      const ok = await probeMedia(seg.media);
      if (state.projectId !== pid) return; // এর মধ্যে অন্য প্রজেক্ট খুলে গেছে
      if (ok === false) {
        seg.media = null;
        seg.status = "attention";
        seg.warn = t("projLinkBroken", { n: state.segments.indexOf(seg) + 1 });
        broken++;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (broken && state.projectId === pid) {
    renderSegments();
    updateSummaries();
    refreshBuildAvailability();
    toast(t("projLinksBroken", { n: broken }), "err");
  }
}

// রেন্ডার করা ভিডিও আর না থাকলে (GitHub-এ শুধু সর্বশেষ ৩০টা থাকে) লাল সতর্কতা
$("#resultVideo").addEventListener("error", () => {
  if ($("#resultVideo").getAttribute("src")) {
    $("#resultWarn").textContent = t("projVideoGone");
    $("#resultWarn").hidden = false;
  }
});
$("#resultVideo").addEventListener("loadedmetadata", () => ($("#resultWarn").hidden = true));

// ---- Recent Renders তালিকা: প্রজেক্ট (IndexedDB) + পুরনো লিংক-শুধু এন্ট্রি (localStorage) ----
async function refreshRecentItems() {
  let projects = [];
  try {
    projects = (await idbAll("projects")).map((p) => ({ id: p.id, ts: p.ts, title: p.title, dur: p.dur, count: p.count, thumb: p.thumb || "", thumbType: "photo", url: p.video ? p.video.url : "" }));
  } catch (_) {}
  const legacy = loadRecentRenders();
  RECENT_ITEMS = [...projects, ...legacy].sort((a, b) => b.ts - a.ts);
  renderRecentList(state.video && state.video.url);
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const mb = (v) => (v / 1024 / 1024).toFixed(v > 1e9 ? 0 : 1);
      $("#storageInfo").textContent = t("projStorage", { used: mb(usage || 0), quota: mb(quota || 0), n: projects.length, max: PROJ_MAX });
    }
  } catch (_) {}
}

// ---- নিজে থেকে সেভের ট্রিগার ----
SETTING_IDS.forEach((id) => {
  $("#" + id).addEventListener("change", scheduleSave);
  $("#" + id).addEventListener("input", scheduleSave);
});
$("#scriptInput").addEventListener("input", scheduleSave);
$("#audioInput").addEventListener("change", scheduleSave);
$("#bgMusicFile").addEventListener("change", scheduleSave);

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
  if (state.projectId) {
    // প্রজেক্ট সেভ থাকলে ভিডিওর লিংক সেই প্রজেক্টেই যোগ হয়
    state.video = { url, ts: Date.now() };
    saveProjectNow().then(() => refreshRecentItems());
    return;
  }
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
  const list = RECENT_ITEMS;
  ul.innerHTML = "";
  if (!list.length) {
    ul.innerHTML = `<li class="empty"><b>🎬</b>${t("emptyRecent")}</li>`;
    return;
  }
  list.forEach((item) => {
    const li = document.createElement("li");
    li.className = "project" + ((item.url && item.url === activeUrl) || (item.id && item.id === state.projectId) ? " active" : "");
    const date = new Date(item.ts).toLocaleDateString(getLang() === "en" ? "en-US" : "bn-BD", { day: "numeric", month: "short", year: "numeric" });
    li.innerHTML = `
      <div class="thumb">${item.thumb ? mediaTag(item.thumb, item.thumbType) : ""}</div>
      <div class="info">
        <div class="ttl">${escapeHtml(item.title || t("untitled"))}</div>
        <div class="meta"><span class="chip">⏱ ${fmtDur(item.dur || 0)}</span><span class="chip">🎞 ${item.count || "–"}</span><span class="chip">${date}</span>${item.url ? "" : '<span class="chip warn-chip">' + t("projNotRendered") + "</span>"}</div>
        <div class="acts">
          <button type="button" class="btn btn-secondary open">${t("openBtn")}</button>
          <a class="btn btn-ghost" href="${escapeAttr(item.url || "#")}" target="_blank" rel="noopener" download${item.url ? "" : " hidden"}>⬇</a>
          <button type="button" class="btn btn-ghost del" title="${t("delTitle")}">✕</button>
        </div>
      </div>`;
    const open = () => {
      if (item.id) return openProject(item.id); // প্রজেক্ট: সব তথ্যসহ খোলে
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
    li.querySelector(".del").addEventListener("click", async () => {
      if (!confirm(t("projDeleteConfirm"))) return;
      if (item.id) await deleteProject(item.id); // তথ্য ও ব্রাউজারে রাখা ফাইল দুটোই মোছে
      else localStorage.setItem(RECENT_KEY, JSON.stringify(loadRecentRenders().filter((r) => r.ts !== item.ts)));
      refreshRecentItems();
    });
    ul.appendChild(li);
  });
}

refreshRecentItems();

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
