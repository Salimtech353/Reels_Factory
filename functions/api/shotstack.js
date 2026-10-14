// [Cloudflare Pages Function] POST /api/shotstack (Shotstack মেথড সরিয়ে ফেললে এই ফাইলও মুছে ফেলা যাবে)
// body: { action, apiKey, ...action-specific fields }
// actions:
//   upload-url      -> { id, uploadUrl }                 (request a signed S3 PUT URL)
//   source-status    { id }             -> { status, url, error }
//   render           { timeline, resolution } -> { id }
//   render-status    { id }             -> { status, url, error }

const BASE = "https://api.shotstack.io";
const ENV = "stage"; // free sandbox environment (watermarked output)

async function handler(req, response) {
  if (req.method !== "POST") {
    return response.status(405).json({ error: "POST only" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return response.status(400).json({ error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const { action, apiKey } = body;
  if (!apiKey) return response.status(400).json({ error: "apiKey missing" });

  try {
    switch (action) {
      case "upload-url":
        return await handleUploadUrl(apiKey, response);
      case "source-status":
        return await handleSourceStatus(apiKey, body.id, response);
      case "render":
        return await handleRender(apiKey, body.timeline, body.resolution, body.aspectRatio, response);
      case "render-status":
        return await handleRenderStatus(apiKey, body.id, response);
      default:
        return response.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
}

async function handleUploadUrl(apiKey, response) {
  const res = await fetch(`${BASE}/ingest/${ENV}/upload`, {
    method: "POST",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) return response.status(res.status).json({ error: data?.message || "Upload URL request failed" });
  const id = data?.data?.id;
  const uploadUrl = data?.data?.attributes?.url;
  if (!id || !uploadUrl) return response.status(502).json({ error: "Unexpected Shotstack response" });
  return response.status(200).json({ id, uploadUrl });
}

async function handleSourceStatus(apiKey, id, response) {
  if (!id) return response.status(400).json({ error: "id missing" });
  const res = await fetch(`${BASE}/ingest/${ENV}/sources/${id}`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) return response.status(res.status).json({ error: data?.message || "Source status request failed" });
  const attrs = data?.data?.attributes || {};
  return response.status(200).json({
    status: attrs.status,
    url: attrs.source || attrs.url || attrs?.outputs?.source || null,
    error: attrs.error || null,
  });
}

async function handleRender(apiKey, timeline, resolution, aspectRatio, response) {
  if (!timeline) return response.status(400).json({ error: "timeline missing" });
  const res = await fetch(`${BASE}/edit/${ENV}/render`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeline,
      output: { format: "mp4", resolution: resolution || "sd", aspectRatio: aspectRatio || "16:9" },
    }),
  });
  const data = await res.json();
  if (!res.ok) return response.status(res.status).json({ error: data?.message || "Render request failed" });
  const id = data?.response?.id;
  if (!id) return response.status(502).json({ error: "Unexpected Shotstack response" });
  return response.status(200).json({ id });
}

async function handleRenderStatus(apiKey, id, response) {
  if (!id) return response.status(400).json({ error: "id missing" });
  const res = await fetch(`${BASE}/edit/${ENV}/render/${id}`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) return response.status(res.status).json({ error: data?.message || "Render status request failed" });
  const r = data?.response || {};
  return response.status(200).json({ status: r.status, url: r.url || null, error: r.error || null });
}

// ============================================================
// Cloudflare Pages Functions অ্যাডাপ্টার
// Vercel-এর (req, res) ফরম্যাটের মূল লজিক হুবহু রাখা হয়েছে (api/ ফোল্ডারের ফাইলের সাথে মিলিয়ে রাখতে সুবিধা)।
// নিচের অংশ Cloudflare-এর Request/Response কে ওই ফরম্যাটে রূপান্তর করে এবং উত্তরটা আবার Response বানায়।
// ফাইলের পথই URL: functions/api/shotstack.js  ->  /api/shotstack
// ============================================================
export async function onRequest(context) {
  const { request, env } = context;
  if (typeof initEnv === "function") initEnv(env || {});
  let status = 200;
  let payload = {};
  const res = {
    status(code) {
      status = code;
      return res;
    },
    json(obj) {
      payload = obj;
      return res;
    },
  };
  const req = { method: request.method, body: request.method === "POST" ? await request.text() : undefined };
  try {
    await handler(req, res);
  } catch (err) {
    status = 500;
    payload = { error: (err && err.message) || "Internal error" };
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
