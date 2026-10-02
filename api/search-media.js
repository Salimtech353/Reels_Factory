// POST /api/search-media
// body: { provider: 'pexels'|'pixabay', apiKey, query, type: 'videos'|'photos' }
// returns: { results: [{thumb, downloadUrl, type:'video'|'photo', source, width, height}] }

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

  const { provider, apiKey, query, type, page, orientation } = body;
  if (!apiKey || !query) {
    return res.status(400).json({ error: "apiKey/query missing" });
  }
// ⚠️ আইকন মুছে পরিষ্কার সার্চ কিউরি তৈরি করা হলো
//  const query = rawQuery.replace(/^⚠️\s*/, "").trim();

  try {
    if (provider === "pexels") {
      const results = await searchPexels(apiKey, query, type, page || 1, orientation);
      return res.status(200).json({ results });
    }
    if (provider === "pixabay") {
      const results = await searchPixabay(apiKey, query, type, page || 1, orientation);
      return res.status(200).json({ results });
    }
    return res.status(400).json({ error: "Unknown provider" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

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
      // prefer a smaller file (sd) to keep download size manageable for client-side ffmpeg
      const files = (v.video_files || []).slice().sort((a, b) => (a.width || 0) - (b.width || 0));
      const small = files.find((f) => (f.width || 0) >= 640 && (f.width || 0) <= 960) || files[0];
      return {
        type: "video",
        thumb: v.image,
        downloadUrl: small ? small.link : v.video_files?.[0]?.link,
        duration: v.duration || null,
        source: "Pexels",
        width: v.width,
        height: v.height,
      };
    });
  }
  return (data.photos || []).map((p) => ({
    type: "photo",
    thumb: p.src.medium,
    downloadUrl: p.src.large,
    source: "Pexels",
    width: p.width,
    height: p.height,
  }));
}

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
    return (data.hits || []).map((v) => ({
      type: "video",
      thumb: v.videos?.tiny?.thumbnail || v.videos?.small?.thumbnail,
      downloadUrl: (v.videos?.small || v.videos?.medium || v.videos?.large)?.url,
      duration: v.duration || null,
      source: "Pixabay",
      width: v.videos?.small?.width,
      height: v.videos?.small?.height,
    }));
  }
  return (data.hits || []).map((p) => ({
    type: "photo",
    thumb: p.webformatURL,
    downloadUrl: p.largeImageURL || p.webformatURL,
    source: "Pixabay",
    width: p.imageWidth,
    height: p.imageHeight,
  }));
}
