// POST /api/shotstack
// body: { action, apiKey, ...action-specific fields }
// actions:
//   upload-url      -> { id, uploadUrl }                 (request a signed S3 PUT URL)
//   source-status    { id }             -> { status, url, error }
//   render           { timeline, resolution } -> { id }
//   render-status    { id }             -> { status, url, error }

const BASE = "https://api.shotstack.io";
const ENV = "stage"; // free sandbox environment (watermarked output)

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

  const { action, apiKey } = body;
  if (!apiKey) return { statusCode: 400, body: JSON.stringify({ error: "apiKey missing" }) };

  try {
    switch (action) {
      case "upload-url":
        return await handleUploadUrl(apiKey);
      case "source-status":
        return await handleSourceStatus(apiKey, body.id);
      case "render":
        return await handleRender(apiKey, body.timeline, body.resolution, body.aspectRatio);
      case "render-status":
        return await handleRenderStatus(apiKey, body.id);
      default:
        return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function ok(payload) {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}

async function handleUploadUrl(apiKey) {
  const res = await fetch(`${BASE}/ingest/${ENV}/upload`, {
    method: "POST",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: data?.message || "Upload URL request failed" }) };
  const id = data?.data?.id;
  const uploadUrl = data?.data?.attributes?.url;
  if (!id || !uploadUrl) return { statusCode: 502, body: JSON.stringify({ error: "Unexpected Shotstack response" }) };
  return ok({ id, uploadUrl });
}

async function handleSourceStatus(apiKey, id) {
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "id missing" }) };
  const res = await fetch(`${BASE}/ingest/${ENV}/sources/${id}`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: data?.message || "Source status request failed" }) };
  const attrs = data?.data?.attributes || {};
  return ok({
    status: attrs.status,
    url: attrs.source || attrs.url || attrs?.outputs?.source || null,
    error: attrs.error || null,
  });
}

async function handleRender(apiKey, timeline, resolution, aspectRatio) {
  if (!timeline) return { statusCode: 400, body: JSON.stringify({ error: "timeline missing" }) };
  const res = await fetch(`${BASE}/edit/${ENV}/render`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeline,
      output: { format: "mp4", resolution: resolution || "sd", aspectRatio: aspectRatio || "16:9" },
    }),
  });
  const data = await res.json();
  if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: data?.message || "Render request failed" }) };
  const id = data?.response?.id;
  if (!id) return { statusCode: 502, body: JSON.stringify({ error: "Unexpected Shotstack response" }) };
  return ok({ id });
}

async function handleRenderStatus(apiKey, id) {
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: "id missing" }) };
  const res = await fetch(`${BASE}/edit/${ENV}/render/${id}`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: data?.message || "Render status request failed" }) };
  const r = data?.response || {};
  return ok({ status: r.status, url: r.url || null, error: r.error || null });
}
