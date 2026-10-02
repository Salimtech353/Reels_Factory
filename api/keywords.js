// POST /api/keywords
// body: { groqKey, openrouterKey, segments: [{id, text, duration}] }   (দুটো চাবির অন্তত একটা লাগবে)
// returns: { provider: 'groq'|'openrouter', model, segments: [{id, entity, queries: [string], mediaType: 'video'|'photo'}] }
//
// বিশ্লেষণের ক্রম:
//   ১) Groq (প্রধান) — মডেল ও ব্যাকআপ মডেল
//   ২) Groq ব্যর্থ হলে OpenRouter — একটা মডেল ব্যর্থ হলে ক্রমান্বয়ে পরের, আরও শক্তিশালী/বড়-কনটেক্সট মডেলে যায়
// আউটপুট সবসময় ইংরেজি সার্চ কি-ওয়ার্ড (UI-র ভাষা যাই হোক)।

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
// llama-3.3-70b-versatile Groq থেকে সরিয়ে ফেলা হয়েছে (deprecated) — ছোট/দ্রুত ও দীর্ঘদিন ধরে
// স্থিতিশীল থাকা llama-3.1-8b-instant এখন ব্যাকআপ হিসেবে ব্যবহার হচ্ছে।
const GROQ_FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || "llama-3.1-8b-instant";

// OpenRouter মডেল-চেইন: বামে হালকা/দ্রুত → ডানে বেশি শক্তিশালী ও বড় কনটেক্সট।
// ফ্রি মডেলের তালিকা OpenRouter-এ প্রায়ই বদলায় (কোনোটা deprecated হয়, কোনোটা সাময়িক ব্যস্ত থাকে),
// তাই শেষে "openrouter/free" রাখা হয়েছে — এটা একটা অটো-রাউটার যেটা নিজে থেকেই তখনকার সচল একটা
// ফ্রি মডেল বেছে নেয়, তাই কোনো নির্দিষ্ট নাম না পেলেও শেষ ভরসা হিসেবে এটা কাজ করে।
// বদলাতে চাইলে Vercel-এর Environment variable-এ OPENROUTER_MODELS দিন (কমা দিয়ে আলাদা করে)।
const DEFAULT_OPENROUTER_MODELS = [
  "google/gemma-4-31b-it:free",
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free"
];

const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const BATCH_SIZE = 10; // ছোট ব্যাচ — বড় স্ক্রিপ্টেও প্রতিটা API কল হালকা থাকে, ব্যর্থ হওয়ার সম্ভাবনা কমে
const BATCH_DELAY_MS = 800; // দুটো ব্যাচের মাঝে এই বিরতি — rate-limit/burst এড়ানোর জন্য
const TOTAL_BUDGET_MS = 50000; // Vercel-এ ফাংশনের সময়সীমা ৬০ সেকেন্ড (vercel.json), ১০ সেকেন্ড বাফার রাখা হয়েছে
const MIN_COVERAGE = 0.8; // মডেল অন্তত ৮০% সেগমেন্টের উত্তর না দিলে সেটাকে ব্যর্থ ধরে পরের মডেলে যাওয়া হয়

const SYSTEM_PROMPT = `You are an expert stock-footage researcher and video editor. You receive segments of a Bangla (Bengali) voiceover script. For EACH segment, produce English search queries for stock video/photo sites (Pexels, Pixabay) that return footage which visually matches what the narrator is saying at that moment.

ALWAYS write queries in English, no matter what language the script is in. Never output Bangla script in queries.

Step 1 - Understand the whole script first. Read ALL segments and decide the overall topic, setting, country/region and mood (e.g. "Bangladesh rural life", "history of a Buddhist monastery", "personal finance tips"). Use this context so every query stays on-topic, and so ambiguous words are read in the right sense (e.g. "পাহাড়পুর" is the ancient Buddhist Vihara in Naogaon, Bangladesh - NOT a mountain, even though the name contains "পাহাড়").

Step 2 - For each segment write 4 queries, ordered from MOST specific to broadest:
  1. Highly specific: subject + action/state + setting + shot type (e.g. "aerial drone view ancient Buddhist monastery ruins Bangladesh", "close-up farmer hands harvesting rice paddy field").
  2. Specific alternative angle of the same scene (different wording/shot, same meaning).
  3. Medium: the core subject + setting, 3-5 words.
  4. Safe fallback: 2-3 words that are still tied to the script's topic (never a generic word alone like "nature" or "people").

Rules for strong queries:
- 3 to 8 words each, plain English nouns/verbs/adjectives that stock sites actually use. No sentences, no punctuation, no quotes.
- Named places, landmarks, species, events, brands: transliterate/translate to the real English name and add the country/region (e.g. "Cox's Bazar beach Bangladesh", "Sundarbans mangrove forest tiger"). If unsure what a name is, keep the romanized name plus the country instead of guessing a generic category.
- Named people or things stock sites cannot have: describe the visual instead (e.g. a scientist -> "scientist working in laboratory"). Never put a person's name in a query.
- Abstract ideas (success, growth, trust, inflation, fear) MUST be turned into concrete visible scenes (e.g. inflation -> "customer looking at price tags in grocery store"; success -> "businessman celebrating in office").
- Numbers, dates, statistics, or opinions: show the subject they refer to, not the number.
- Add region cues when the script is clearly about a place (Bangladesh, South Asia, village, Dhaka, river, rickshaw, etc.) so results do not look foreign or unrelated.
- Match time period and mood: historic -> "ancient/old/heritage"; modern tech -> "modern/digital"; sad -> "lonely/rain/gloomy".
- Do not request text, logos, maps with labels, or screenshots.
- Neighbouring segments should not all produce the same query: vary the shots so the video does not repeat the same footage, while staying on-topic.

Step 3 - mediaType per segment: "video" if the scene has motion/activity (walking, flowing water, crowds, traffic, work); "photo" if it is a still subject/monument/object/portrait-like scene.

Step 4 - entity: the main named place/person/thing in the segment written in English, or "" if there is none.

Output ONLY valid JSON, no markdown fences and no commentary, exactly in this schema:
{"segments":[{"id":"seg_0","entity":"Paharpur Buddhist Vihara","queries":["...","...","...","..."],"mediaType":"video"}]}
Return every input id exactly once, in the same order.`;

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const cleaned = String(text).replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const a = cleaned.indexOf("{");
      const b = cleaned.lastIndexOf("}");
      if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
      throw new Error("AI-র উত্তর JSON হিসেবে পড়া যায়নি");
    }
  }
}

// উত্তরে সেগমেন্ট তালিকা আছে কিনা এবং অন্তত ৮০% সেগমেন্ট কভার হয়েছে কিনা দেখা হয়।
// বড় ট্রান্সক্রিপ্টে দুর্বল মডেল অনেক সময় মাঝপথে থেমে যায় — তখন পরের (শক্তিশালী) মডেলে যেতে হবে।
function assertShape(parsed, batch) {
  if (!parsed || !Array.isArray(parsed.segments) || !parsed.segments.length) {
    const err = new Error("AI-র উত্তরে সেগমেন্ট তালিকা নেই");
    err.status = 502;
    throw err;
  }
  if (batch && batch.length) {
    const want = new Set(batch.map((s) => String(s.id)));
    const got = new Set(
      parsed.segments.filter((d) => d && Array.isArray(d.queries) && d.queries.length).map((d) => String(d.id))
    );
    let covered = 0;
    want.forEach((id) => got.has(id) && covered++);
    if (covered / want.size < MIN_COVERAGE) {
      const err = new Error(`উত্তর অসম্পূর্ণ (${covered}/${want.size} সেগমেন্ট)`);
      err.status = 502;
      throw err;
    }
  }
  return parsed;
}

// সময়সীমাসহ POST; বডি পড়া পর্যন্ত টাইমার চালু থাকে, যাতে আটকে থাকা রিকোয়েস্ট পুরো ফাংশন নষ্ট না করে
async function postJson(url, headers, body, ctx, capMs) {
  const remaining = ctx.deadline - Date.now();
  if (remaining < 1500) {
    const e = new Error("সময় শেষ (ফাংশনের সময়সীমা)");
    e.status = 504;
    throw e;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(capMs || remaining, remaining));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    const err = new Error(e.name === "AbortError" ? "সময় শেষ (timeout)" : `নেটওয়ার্ক ত্রুটি: ${e.message}`);
    err.status = 504;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- Groq (প্রধান)

async function groqOnce(groqKey, model, userText, jsonMode, batch, ctx, capMs) {
  const body = {
    model,
    temperature: 0.3,
    max_completion_tokens: 8000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Segments:\n${userText}` },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  const r = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${groqKey}` },
    body,
    ctx,
    capMs
  );
  if (!r.ok) {
    // JSON-মোড ভ্যালিডেশন ফেল করলেও Groq মডেলের আসল আউটপুট failed_generation-এ পাঠায় — সেটা থেকেই পড়ার চেষ্টা
    const fg = r.data?.error?.failed_generation;
    if (fg) {
      try {
        return assertShape(parseJsonLoose(fg), batch);
      } catch (_) {}
    }
    const err = new Error(r.data?.error?.message || `Groq API request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  const text = r.data?.choices?.[0]?.message?.content;
  if (!text) {
    const err = new Error("Groq থেকে কোনো আউটপুট পাওয়া যায়নি");
    err.status = 502;
    throw err;
  }
  return assertShape(parseJsonLoose(text), batch);
}

// প্রতিটা মডেলে JSON-মোড → JSON-মোড ছাড়া; তারপর ব্যাকআপ মডেল। যেকোনো একটা সফল হলেই হলো।
// লিমিট/সার্ভার সমস্যা (429, 5xx, timeout) হলে একই মডেলে আর চেষ্টা না করে সোজা পরের মডেলে যাওয়া হয়।
async function callGroq(groqKey, userText, batch, ctx, hasFallback) {
  const models = [GROQ_MODEL, GROQ_FALLBACK_MODEL].filter((m, i, a) => m && a.indexOf(m) === i);
  const capMs = hasFallback ? 10000 : 18000;
  let lastErr;
  for (const model of models) {
    for (const jsonMode of [true, false]) {
      try {
        const parsed = await groqOnce(groqKey, model, userText, jsonMode, batch, ctx, capMs);
        return { parsed, model };
      } catch (e) {
        lastErr = e;
        if (e.status === 401 || e.status === 403) throw e; // চাবিই ভুল — আর চেষ্টা করে লাভ নেই
        if (e.status === 429 || e.status >= 500 || e.status === 413) break; // একই মডেলে আবার চেষ্টা বৃথা
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- OpenRouter (ফলব্যাক)

let orModelIdsCache = null; // ওয়ার্ম ফাংশনে একবারই আনা হয়
async function openRouterModelIds(ctx) {
  if (orModelIdsCache) return orModelIdsCache;
  const remaining = ctx.deadline - Date.now();
  if (remaining < 6000) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const ids = new Set((data?.data || []).map((m) => m.id));
    if (ids.size) orModelIdsCache = ids;
    return orModelIdsCache;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// কনফিগার করা চেইন থেকে OpenRouter-এ বাস্তবে আছে এমন মডেলগুলোই রাখা হয় (তালিকা আনতে না পারলে পুরোটাই)
async function buildOpenRouterChain(ctx) {
  const wanted = OPENROUTER_MODELS.length ? OPENROUTER_MODELS : DEFAULT_OPENROUTER_MODELS;
  const ids = await openRouterModelIds(ctx);
  if (!ids) return wanted;
  const alive = wanted.filter((m) => ids.has(m) || m.startsWith("openrouter/"));
  return alive.length ? alive : wanted;
}

async function openRouterOnce(orKey, model, userText, ctx, capMs) {
  const r = await postJson(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      Authorization: `Bearer ${orKey}`,
      "HTTP-Referer": process.env.URL || "https://netlify.app",
      "X-Title": "Reel Factory",
    },
    {
      model,
      temperature: 0.3,
      max_tokens: 8000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Segments:\n${userText}` },
      ],
    },
    ctx,
    capMs
  );
  // OpenRouter অনেক সময় HTTP 200-এর ভেতরেই প্রোভাইডারের ত্রুটি পাঠায়
  const apiErr = r.data?.error;
  if (!r.ok || apiErr) {
    const err = new Error(apiErr?.message || `OpenRouter request failed (${r.status})`);
    err.status = r.ok ? apiErr?.code || 502 : r.status;
    throw err;
  }
  const choice = r.data?.choices?.[0];
  let text = choice?.message?.content;
  if (Array.isArray(text)) text = text.map((p) => p?.text || "").join("");
  if (!text || !String(text).trim()) {
    const err = new Error("কোনো আউটপুট পাওয়া যায়নি");
    err.status = 502;
    throw err;
  }
  if (choice?.finish_reason === "length") {
    const err = new Error("উত্তর মাঝপথে কেটে গেছে (আউটপুট সীমা)");
    err.status = 502;
    throw err;
  }
  return assertShape(parseJsonLoose(text), null);
}

// একটা মডেল ব্যর্থ হলে চেইনের পরের (শক্তিশালী) মডেলে যায়
async function callOpenRouter(orKey, userText, batch, ctx) {
  const chain = await buildOpenRouterChain(ctx);
  const errors = [];
  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const isLastTwo = i >= chain.length - 2;
    try {
      const parsed = await openRouterOnce(orKey, model, userText, ctx, isLastTwo ? 0 : 12000);
      assertShape(parsed, batch); // কভারেজ যাচাই — অসম্পূর্ণ হলে পরের মডেল
      return { parsed, model };
    } catch (e) {
      lastErr = e;
      errors.push(`${model}: ${e.message}`);
      if (e.status === 401) break; // OpenRouter চাবি ভুল/বাতিল — সব মডেলেই একই ফল
      if (e.status === 504 && ctx.deadline - Date.now() < 1500) break; // সময় নেই
    }
  }
  const err = new Error(errors.slice(-3).join(" ; ") || "OpenRouter ব্যর্থ");
  err.status = lastErr?.status || 502;
  throw err;
}

// ---------------------------------------------------------------- নর্মালাইজ + ব্যাচ

// মডেলের উত্তর পরিষ্কার করা: কোয়েরি স্ট্রিং, ডুপ্লিকেট বাদ, সর্বোচ্চ ৪টা, mediaType ঠিক রাখা
function normalize(parsed, batch) {
  const list = Array.isArray(parsed?.segments) ? parsed.segments : [];
  const byId = new Map(list.map((d) => [String(d.id), d]));
  return batch.map((s) => {
    const d = byId.get(String(s.id)) || {};
    const seen = new Set();
    const queries = (Array.isArray(d.queries) ? d.queries : [])
      .map((q) => String(q || "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim())
      .filter((q) => q && !/[\u0980-\u09FF]/.test(q)) // বাংলা অক্ষর থাকলে বাদ — সার্চ শুধু ইংরেজিতে
      .filter((q) => {
        const k = q.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 4);
    return {
      id: s.id,
      entity: /[\u0980-\u09FF]/.test(String(d.entity || "")) ? "" : String(d.entity || "").trim(),
      queries,
      mediaType: d.mediaType === "photo" ? "photo" : "video",
    };
  });
}

async function analyzeBatch(batch, groqKey, orKey, ctx) {
  const userText = JSON.stringify(
    batch.map((s) => ({ id: s.id, text: s.text, duration_seconds: s.duration })),
    null,
    2
  );

  let result = null;
  let provider = "groq";
  let groqErr = null;
  let orErr = null;

  if (groqKey) {
    try {
      result = await callGroq(groqKey, userText, batch, ctx, Boolean(orKey));
    } catch (e) {
      groqErr = e;
    }
  }

  if (!result && orKey) {
    provider = "openrouter";
    try {
      result = await callOpenRouter(orKey, userText, batch, ctx);
    } catch (e) {
      orErr = e;
    }
  }

  if (!result) {
    const parts = [];
    if (groqErr) parts.push(`Groq: ${groqErr.message}`);
    if (orErr) parts.push(`OpenRouter: ${orErr.message}`);
    const err = new Error(parts.join(" | ") || "কোনো API চাবি দেওয়া হয়নি");
    err.status = (orErr || groqErr || {}).status || 502;
    throw err;
  }

  return { provider, model: result.model, segments: normalize(result.parsed, batch) };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const { groqKey, openrouterKey, segments } = body;
  if (!groqKey && !openrouterKey) return res.status(400).json({ error: "API key missing (Groq / OpenRouter)" });
  if (!Array.isArray(segments) || !segments.length) {
    return res.status(400).json({ error: "segments missing" });
  }

  const ctx = { deadline: Date.now() + TOTAL_BUDGET_MS };
  const all = [];
  let provider = "groq";
  let model = "";
  let fallbackUsed = false;
  let fallbackReason = "";

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY_MS); // ব্যাচে ব্যাচে একটু বিরতি — rate-limit/burst এড়ানোর জন্য
    const batch = segments.slice(i, i + BATCH_SIZE);
    try {
      const r = await analyzeBatch(batch, groqKey, openrouterKey, ctx);
      // কোনো একটা ব্যাচও OpenRouter-এ গেলে সেটাই জানানো হয়
      if (r.provider === "openrouter" || !model) {
        provider = r.provider;
        model = r.model;
      }
      all.push(...r.segments);
    } catch (err) {
      // এই ব্যাচের সব মডেল (Groq + OpenRouter চেইন) ব্যর্থ হলেও পুরো রিকোয়েস্ট বাতিল না করে
      // এই ব্যাচের সেগমেন্টগুলোর জন্য একটা নিরাপদ ডিফল্ট কোয়েরি বসিয়ে এগিয়ে যাওয়া হচ্ছে, যাতে
      // বাকি ব্যাচের (সফল হওয়া) ফলাফলও ব্যবহারকারী হারান না।
      all.push(...fallbackSegments(batch));
      fallbackUsed = true;
      fallbackReason = err.message || String(err);
    }
  }

  return res.status(200).json({ provider, model, segments: all, fallbackUsed, fallbackReason });
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// সব মডেল ব্যর্থ হলে প্রতিটা সেগমেন্টের জন্য একটা সাধারণ, নিরাপদ ডিফল্ট কোয়েরি —
// যাতে ব্যবহারকারী পুরোপুরি খালি হাতে না থেকে অন্তত কিছু একটা ফলাফল (ও ম্যানুয়ালি এডিট করার সুযোগ) পান।
function fallbackSegments(batch) {
  // ঐতিহাসিক স্থানের সাথে ন্যাচারাল সিন (নদী, পাহাড়, বন, ড্রোন শট) এর কম্বিনেশন
  const historicalQueryPool = [
    [
      "⚠️ ancient stone palace arch architecture",
      "⚠️ river scenic beauty aerial drone view",
      "⚠️ cinematic historical brick ruins",
      "⚠️ misty green forest wilderness drone shot"
    ],
    [
      "⚠️ vintage historical landmark establishing shot",
      "⚠️ mountain foggy landscape cinematic drone",
      "⚠️ ancient terracotta temple details",
      "⚠️ tranquil river nature sunset landscape"
    ],
    [
      "⚠️ historical fort wall cinematic footage",
      "⚠️ lush green tropical forest nature view",
      "⚠️ ancient culture traditional heritage site",
      "⚠️ winding rural road village landscape drone"
    ],
    [
      "⚠️️ ancient royal hall corridor interior",
      "⚠️ dramatic mountain valley aerial footage",
      "⚠️ archaeological excavation site drone shot",
      "⚠️ wide river stream scenic nature background"
    ]
  ];

  return batch.map((s, index) => {
    const querySet = historicalQueryPool[index % historicalQueryPool.length];

    return {
      id: s.id,
      entity: "Historical Heritage & Nature",
      queries: querySet,
      mediaType: "video",
    };
  });
}
