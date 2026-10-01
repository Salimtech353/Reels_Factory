// POST /api/keywords
// body: { apiKey (Gemini, optional if groqKey given), groqKey (optional fallback), segments: [{id, text, duration}] }
// returns: { provider: 'gemini'|'groq', segments: [{id, entity, queries: [string], mediaType: 'video'|'photo'}] }
//
// Gemini আগে চেষ্টা করা হয়। কোটা শেষ (429/quota) বা সার্ভার সমস্যা হলে এবং Groq চাবি থাকলে
// নিজে থেকেই Groq-এ ফলব্যাক করে। আউটপুট সবসময় ইংরেজি সার্চ কি-ওয়ার্ড (UI-র ভাষা যাই হোক)।

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || "llama-3.3-70b-versatile";
const BATCH_SIZE = 40; // এর বেশি সেগমেন্ট হলে ভাগ করে পাঠানো হয়

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 503 (সাময়িক ব্যস্ততা) হলে অল্প বিরতিতে আবার চেষ্টা; 429 হলে রিট্রাই নয় — সোজা ফলব্যাক
async function fetchWithRetry(url, options, maxAttempts = 2) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fetch(url, options);
    if (last.status !== 503) return last;
    if (attempt < maxAttempts) await sleep(1000 * attempt);
  }
  return last;
}

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

async function callGemini(apiKey, userText, canFallback) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  // Groq ফলব্যাক থাকলে Gemini-কে একবারই চেষ্টা করা হয় — ব্যর্থ হলেই কোনো অপেক্ষা ছাড়া Groq-এ যাওয়া হয়
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nSegments:\n${userText}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    }),
  }, canFallback ? 1 : 2);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || "Gemini API request failed");
    err.status = res.status;
    throw err;
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error("Gemini থেকে কোনো আউটপুট পাওয়া যায়নি");
    err.status = 502;
    throw err;
  }
  return parseJsonLoose(text);
}

function assertShape(parsed) {
  if (!parsed || !Array.isArray(parsed.segments) || !parsed.segments.length) {
    const err = new Error("AI-র উত্তরে সেগমেন্ট তালিকা নেই");
    err.status = 502;
    throw err;
  }
  return parsed;
}

async function groqOnce(groqKey, model, userText, jsonMode) {
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
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // JSON-মোড ভ্যালিডেশন ফেল করলেও Groq মডেলের আসল আউটপুট failed_generation-এ পাঠায় — সেটা থেকেই পড়ার চেষ্টা
    const fg = data?.error?.failed_generation;
    if (fg) {
      try {
        return assertShape(parseJsonLoose(fg));
      } catch (_) {}
    }
    const err = new Error(data?.error?.message || "Groq API request failed");
    err.status = res.status;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    const err = new Error("Groq থেকে কোনো আউটপুট পাওয়া যায়নি");
    err.status = 502;
    throw err;
  }
  return assertShape(parseJsonLoose(text));
}

// একই মডেলে JSON-মোড → JSON-মোড ছাড়া → ভিন্ন ব্যাকআপ মডেল; যেকোনো একটা সফল হলেই হলো
async function callGroq(groqKey, userText) {
  const attempts = [
    [GROQ_MODEL, true],
    [GROQ_MODEL, false],
    [GROQ_FALLBACK_MODEL, true],
    [GROQ_FALLBACK_MODEL, false],
  ];
  let lastErr;
  for (const [model, jsonMode] of attempts) {
    try {
      return await groqOnce(groqKey, model, userText, jsonMode);
    } catch (e) {
      lastErr = e;
      if (e.status === 401 || e.status === 403) break; // চাবিই ভুল — আর চেষ্টা করে লাভ নেই
    }
  }
  throw lastErr;
}

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

async function analyzeBatch(batch, apiKey, groqKey) {
  const userText = JSON.stringify(
    batch.map((s) => ({ id: s.id, text: s.text, duration_seconds: s.duration })),
    null,
    2
  );

  let provider = "gemini";
  let parsed;
  let geminiErr = null;

  if (apiKey) {
    try {
      parsed = await callGemini(apiKey, userText, Boolean(groqKey));
    } catch (e) {
      geminiErr = e;
    }
  }

  if (!parsed) {
    // Gemini চাবি নেই, বা যেকোনো কারণে ব্যর্থ (কোটা, সার্ভার সমস্যা, খারাপ উত্তর) → সাথে সাথে Groq
    const canFallback = Boolean(groqKey);
    if (!canFallback) throw geminiErr || new Error("কোনো API চাবি দেওয়া হয়নি");
    provider = "groq";
    try {
      parsed = await callGroq(groqKey, userText);
    } catch (groqErr) {
      // Groq-ও ব্যর্থ: Gemini-র "ব্যস্ত" অবস্থা সাধারণত ক্ষণস্থায়ী, তাই শেষবার একটু পরে Gemini আবার চেষ্টা
      if (apiKey) {
        await sleep(2000);
        try {
          parsed = await callGemini(apiKey, userText, true);
          provider = "gemini";
        } catch (e2) {
          geminiErr = e2;
        }
      }
      if (!parsed) {
        const both = geminiErr ? ` | Gemini: ${geminiErr.message}` : "";
        const err = new Error(`Groq: ${groqErr.message}${both}`);
        err.status = groqErr.status || 502;
        throw err;
      }
    }
  }

  return { provider, segments: normalize(parsed, batch) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST only" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { apiKey, groqKey, segments } = body;
  if (!apiKey && !groqKey) return { statusCode: 400, body: JSON.stringify({ error: "apiKey missing" }) };
  if (!Array.isArray(segments) || !segments.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "segments missing" }) };
  }

  try {
    const all = [];
    let provider = "gemini";
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const r = await analyzeBatch(segments.slice(i, i + BATCH_SIZE), apiKey, groqKey);
      provider = r.provider;
      all.push(...r.segments);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, segments: all }),
    };
  } catch (err) {
    return { statusCode: err.status || 500, body: JSON.stringify({ error: err.message }) };
  }
};
