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
// রেজোলিউশন বাছাই: প্রথমে Full HD, না থাকলে HD। 4K/QHD ও SD কখনোই নয়।
// মাপ ধরা হয় লম্বা দিক (long side) দিয়ে, তাই ল্যান্ডস্কেপ ও পোর্ট্রেট দুটোতেই একই নিয়ম।
//   Full HD : লম্বা দিক ১৮০০–২২০০ px (যেমন 1920x1080, 1080x1920)
//   HD      : লম্বা দিক ১২০০–১৭৯৯ px (যেমন 1280x720, 720x1280)
//   বাদ     : ২২০০ px-এর বেশি (4K/QHD) আর ১২০০ px-এর কম (SD)
// ------------------------------------------------------------
function resTier(w, h) {
  const L = Math.max(w || 0, h || 0);
  if (L >= 1800 && L <= 2200) return 2; // Full HD
  if (L >= 1200 && L < 1800) return 1; // HD
  return 0; // বাদ
}

// ভিডিওর ফাইল-তালিকা [{url,width,height}] থেকে সেরাটা: আগে Full HD (১৯২০-এর সবচেয়ে কাছের), না থাকলে HD; কিছুই না মিললে null
function pickBestFile(files) {
  let best = null;
  for (const f of files) {
    if (!f || !f.url) continue;
    const tier = resTier(f.width, f.height);
    if (!tier) continue;
    const dist = Math.abs(Math.max(f.width, f.height) - (tier === 2 ? 1920 : 1280));
    if (!best || tier > best.tier || (tier === best.tier && dist < best.dist)) best = { f, tier, dist };
  }
  return best ? best.f : null;
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
      // রেন্ডারের জন্য: আগে Full HD, না থাকলে HD (4K/SD নয়); কোনোটাই না থাকলে এই ভিডিও বাদ
      const bestVideo = pickBestFile(files.map((f) => ({ url: f.link, width: f.width, height: f.height })));
      if (!bestVideo) return null;
      // প্রিভিউয়ের জন্য: ছোট দিক ≤ ৭২০ এর মধ্যে সবচেয়ে বড়টা; না থাকলে সবচেয়ে ছোটটা
      const small = files.filter((f) => Math.min(f.width || 0, f.height || 0) <= 720);
      const previewFile = small.length
        ? small.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0]
        : files.slice().sort((a, b) => (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0))[0];

      return {
        type: "video",
        thumb: v.image,
        downloadUrl: bestVideo.url,
        previewUrl: previewFile ? previewFile.link : undefined,
        duration: v.duration || null,
        source: "Pexels",
        width: bestVideo.width,
        height: bestVideo.height,
      };
    }).filter(Boolean);
  }

  return (data.photos || [])
    .map((p) => {
      const pick = pickPexelsPhoto(p);
      if (!pick) return null;
      return {
        type: "photo",
        thumb: p.src.medium,
        downloadUrl: pick.url,
        source: "Pexels",
        width: pick.width,
        height: pick.height,
      };
    })
    .filter(Boolean);
}

// Pexels ছবি: আসল মাপ Full HD/HD রেঞ্জে হলে original; ২২০০ px-এর বেশি (4K+) হলে Pexels-এর CDN থেকে লম্বা দিক ১৯২০ px করে নামানো;
// ১২০০ px-এর কম (SD) হলে বাদ।
function pickPexelsPhoto(p) {
  const w = p.width || 0;
  const h = p.height || 0;
  const L = Math.max(w, h);
  const base = p.src && p.src.original;
  if (!base || L < 1200) return null;
  if (L > 2200) {
    const landscape = w >= h;
    const k = 1920 / L;
    const sep = base.includes("?") ? "&" : "?";
    return {
      url: `${base}${sep}auto=compress&cs=tinysrgb&${landscape ? "w" : "h"}=1920`,
      width: landscape ? 1920 : Math.round(w * k),
      height: landscape ? Math.round(h * k) : 1920,
    };
  }
  return { url: base, width: w, height: h };
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
      // আগে Full HD, না থাকলে HD (4K/SD নয়); কোনোটাই না থাকলে এই ভিডিও বাদ
      const bestVid = pickBestFile(["large", "medium", "small", "tiny"].map((k) => vObj[k]).filter(Boolean));
      if (!bestVid) return null;
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
    }).filter(Boolean);
  }

  return (data.hits || [])
    .map((p) => {
      const pick = pickPixabayPhoto(p);
      if (!pick) return null;
      return {
        type: "photo",
        thumb: p.webformatURL,
        downloadUrl: pick.url,
        source: "Pixabay",
        width: pick.width,
        height: pick.height,
      };
    })
    .filter(Boolean);
}

// Pixabay ছবি: fullHDURL (লম্বা দিক ১৯২০) থাকলে সেটা → Full HD; আসল ছবি নিজেই Full HD রেঞ্জে হলে imageURL;
// না হলে largeImageURL (লম্বা দিক ১২৮০) → HD। ১২০০ px-এর কম (SD) আসল ছবি বাদ।
// width/height এখানে বাছাই করা ফাইলের আনুমানিক আসল মাপ (আসল ছবির নয়)।
function pickPixabayPhoto(p) {
  const w = p.imageWidth || 0;
  const h = p.imageHeight || 0;
  const L = Math.max(w, h);
  if (L < 1200) return null;
  const scaled = (target) => {
    const t = Math.min(L, target);
    const k = t / L;
    return { width: Math.round(w * k), height: Math.round(h * k) };
  };
  if (p.fullHDURL) return { url: p.fullHDURL, ...scaled(1920) };
  if (p.imageURL && L >= 1800 && L <= 2200) return { url: p.imageURL, width: w, height: h };
  if (p.largeImageURL) return { url: p.largeImageURL, ...scaled(1280) };
  return null;
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
