// [Cloudflare Pages Function] POST /api/search-media
// body: { pixabayApiKey, pexelsApiKey, apiKey, query, type: 'videos'|'photos', page, orientation }
// returns: { results: [{thumb, downloadUrl, previewUrl, type:'video'|'photo', source, width, height, duration}] }
//   downloadUrl = রেন্ডারের জন্য সেরা মানের ফাইল
//   previewUrl  = মডালে প্লে করার জন্য হালকা (ছোট) mp4 — দ্রুত লোড হয়

async function handler(req, res) {
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

  const { pixabayApiKey, pexelsApiKey, apiKey, query, type, page, orientation } = body;
  if (!query) {
    return res.status(400).json({ error: "query missing" });
  }

  const pixKey = pixabayApiKey || apiKey;
  const pexKey = pexelsApiKey || apiKey;

  try {
    let pixabayResults = [];
    let pexelsResults = [];

    // ১. উভয় সোর্স থেকে মিডিয়া ফেচ (একটা ব্যর্থ হলেও অন্যটা চলবে)
    if (pixKey) {
      try {
        pixabayResults = await searchPixabay(pixKey, query, type, page || 1, orientation);
      } catch (err) {
        console.warn("Pixabay fetch failed:", err.message);
      }
    }

    if (pexKey) {
      try {
        pexelsResults = await searchPexels(pexKey, query, type, page || 1, orientation);
      } catch (err) {
        console.warn("Pexels fetch failed:", err.message);
      }
    }

    // ২. কোনো সোর্স থেকেই ডেটা না এলে
    if (pixabayResults.length === 0 && pexelsResults.length === 0) {
      throw new Error("No media found from any provider");
    }

    // ৩. পালাক্রমে মেশানো + শাফল
    let combinedResults = [];
    const maxLength = Math.max(pixabayResults.length, pexelsResults.length);
    for (let i = 0; i < maxLength; i++) {
      if (pixabayResults[i]) combinedResults.push(pixabayResults[i]);
      if (pexelsResults[i]) combinedResults.push(pexelsResults[i]);
    }
    combinedResults = shuffleArray(combinedResults);

    return res.status(200).json({ results: combinedResults });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// অ্যারে শাফেল (Randomize order)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ------------------------------------------------------------
// Pexels API
// ------------------------------------------------------------
async function searchPexels(apiKey, query, type, page, orientation) {
  const isVideo = type === "videos";
  const orientParam = orientation ? `&orientation=${orientation}` : "";
  const endpoint = isVideo
    ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=9&page=${page}${orientParam}`
    : `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=9&page=${page}${orientParam}`;

  const res = await fetch(endpoint, { headers: { Authorization: apiKey } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Pexels API request failed");

  if (isVideo) {
    return (data.videos || []).map((v) => {
      const files = (v.video_files || []).filter((f) => f.link && (!f.file_type || f.file_type === "video/mp4"));
      // রেন্ডারের জন্য: Full HD বা কাছাকাছি সেরা রেজুলেশন
      const bestVideo = files.find((f) => f.width >= 1280 || f.height >= 720) || files[0];
      // প্রিভিউয়ের জন্য: ছোট দিক ≤ ৭২০ এর মধ্যে সবচেয়ে বড়টা; না থাকলে সবচেয়ে ছোটটা
      const small = files.filter((f) => Math.min(f.width || 0, f.height || 0) <= 720);
      const previewFile = small.length
        ? small.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0]
        : files.slice().sort((a, b) => (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0))[0];

      return {
        type: "video",
        thumb: v.image,
        downloadUrl: bestVideo ? bestVideo.link : v.video_files?.[0]?.link,
        previewUrl: previewFile ? previewFile.link : undefined,
        duration: v.duration || null,
        source: "Pexels",
        width: bestVideo?.width || v.width,
        height: bestVideo?.height || v.height,
      };
    });
  }

  return (data.photos || []).map((p) => ({
    type: "photo",
    thumb: p.src.medium,
    downloadUrl: p.src.original || p.src.large2x || p.src.large,
    source: "Pexels",
    width: p.width,
    height: p.height,
  }));
}

// ------------------------------------------------------------
// Pixabay API
// ------------------------------------------------------------
async function searchPixabay(apiKey, query, type, page, orientation) {
  const isVideo = type === "videos";
  const pixabayOrient = orientation === "portrait" ? "vertical" : orientation === "landscape" ? "horizontal" : null;
  const orientParam = !isVideo && pixabayOrient ? `&orientation=${pixabayOrient}` : "";
  const endpoint = isVideo
    ? `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=9&page=${page}`
    : `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=9&page=${page}&image_type=photo${orientParam}`;

  const res = await fetch(endpoint);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Pixabay API request failed");

  if (isVideo) {
    return (data.hits || []).map((v) => {
      const vObj = v.videos || {};
      const bestVid = vObj.large?.url ? vObj.large : vObj.medium?.url ? vObj.medium : vObj.small;
      const previewVid = vObj.small?.url ? vObj.small : vObj.tiny?.url ? vObj.tiny : vObj.medium;
      return {
        type: "video",
        thumb: vObj.small?.thumbnail || vObj.medium?.thumbnail || vObj.tiny?.thumbnail,
        downloadUrl: bestVid?.url,
        previewUrl: previewVid?.url,
        duration: v.duration || null,
        source: "Pixabay",
        width: bestVid?.width,
        height: bestVid?.height,
      };
    });
  }

  return (data.hits || []).map((p) => ({
    type: "photo",
    thumb: p.webformatURL,
    downloadUrl: p.fullHDURL || p.imageURL || p.largeImageURL || p.webformatURL,
    source: "Pixabay",
    width: p.imageWidth,
    height: p.imageHeight,
  }));
}

// ============================================================
// Cloudflare Pages Functions অ্যাডাপ্টার
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
