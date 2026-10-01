// ============================================================
// ভাষা (বাংলা / English) — সব UI লেখা এখানে এক জায়গায়।
// HTML-এ data-i18n="key", data-i18n-html="key", data-i18n-placeholder="key",
// data-i18n-aria="key" দিয়ে বসানো হয়; JS থেকে t("key", {param}) দিয়ে।
// ============================================================

const SCRIPT_PH_BN = `কীভাবে ব্যবহার করবেন
১. API Setup থেকে আপনার API চাবিগুলো দিন।
২. ভয়েসওভার অডিও আপলোড করুন। Auto Transcribe
   চাপলে স্ক্রিপ্ট নিজে থেকে আসবে, অথবা
   নিজেই লিখে দিন।
৩. প্রতিটা দৃশ্যের জন্য এক লাইন করে লিখুন:

00:00-00:05 | প্রথম লাইনের বাংলা লেখা
00:05-00:12 | দ্বিতীয় লাইনের বাংলা লেখা
00:12-00:18 | তৃতীয় লাইনের বাংলা লেখা

৪. ভিডিও ফরম্যাট বেছে Analyze script চাপুন।
৫. প্রতিটা দৃশ্যের ফুটেজ দেখে নিন (কোয়েরি
   এডিট, নতুন কোয়েরি, সার্চ বা আপলোড করা যায়)।
৬. রেন্ডারে গিয়ে ভিডিও তৈরি করে MP4 ডাউনলোড করুন।

টিপ: প্রতিটা দৃশ্য ২০ সেকেন্ডের মধ্যে রাখুন।`;

const SCRIPT_PH_EN = `HOW TO USE
1. Add your API keys (API Setup, top right).
2. Upload your voiceover audio. Press
   Auto Transcribe to get the script
   automatically, or write it yourself.
3. Write one line per scene like this:

00:00-00:05 | First line of narration
00:05-00:12 | Second line of narration
00:12-00:18 | Third line of narration

4. Choose the video format, then press
   Analyze script.
5. Check the footage for each scene (edit
   the query, regenerate, search or upload).
6. Continue to render and download your MP4.

Tip: keep each scene under 20 seconds.`;

const DICT = {
  bn: {
    audioDefaultNote: "🎵 অডিও না দিলে ডিফল্ট ব্যাকগ্রাউন্ড মিউজিক দিয়ে ভিডিও তৈরি হবে।",
    capFontLabel: "ক্যাপশন ফন্ট", capFontNote: "(বাংলা ও ইংরেজি দুটোই সাপোর্ট করে)",
    fKolpona: "Kolpona (কল্পনা) — ক্যালিগ্রাফি স্টাইল", fKolponaI: "Kolpona Italic (কল্পনা ইটালিক)",
    fHind: "Hind Siliguri — পরিষ্কার (ডিফল্ট)", fGalada: "Galada — ক্যালিগ্রাফি / ব্রাশ স্টাইল",
    fAtma: "Atma — গোলাকার, খেলাচ্ছলে", fMina: "Mina — মার্জিত, নরম",
    formatTop: "ভিডিও ফরম্যাট (অ্যাসপেক্ট রেশিও)", formatTopHint: "এই ফরম্যাট অনুযায়ীই দৃশ্যের ফুটেজ সংগ্রহ হবে। রেন্ডারের আগে চাইলে বদলাতেও পারবেন।",
    settings: "API Setup", prefs: "পছন্দ", langPref: "ভাষা", themePref: "থিম (দিন / রাত)",
    stepOf: "ধাপ {n} / ৫", stepBack: "← ফিরে যান", toRender: "রেন্ডারে যান →",
    scenesReady: "{a}/{b}টি দৃশ্য প্রস্তুত",
    stReady: "মিডিয়া বাছাই হয়েছে", stSearching: "সার্চ চলছে…", stNone: "মিডিয়া পাওয়া যায়নি", stAttention: "মনোযোগ দরকার",
    sceneNo: "দৃশ্য {n}", qLabel: "AI সার্চ কোয়েরি", editQ: "এডিট", regenQ: "নতুন কোয়েরি", uploadBtn: "আপলোড",
    choicesLabel: "মিডিয়া বিকল্প — যেটা চান সেটায় চাপ দিন",
    adv: "অ্যাডভান্সড সেটিংস", sumDuration: "দৈর্ঘ্য", sumScenes: "দৃশ্য", sumRes: "রেজোলিউশন",
    renderTitle: "ভিডিও রেন্ডারের জন্য প্রস্তুত", renderingTitle: "আপনার ভিডিও তৈরি হচ্ছে…", doneTitle: "আপনার ভিডিও প্রস্তুত!",
    previewBtn: "▶ প্রিভিউ", dlMp4: "MP4 ডাউনলোড", copyLink: "লিংক কপি", copied: "লিংক কপি হয়েছে", createAnother: "নতুন ভিডিও বানান",
    openBtn: "খুলুন", untitled: "নামহীন প্রজেক্ট", emptyRecent: "এখনো কোনো প্রজেক্ট নেই — প্রথম ভিডিওটা বানিয়ে ফেলুন!",
    docTitle: "রিল কারখানা — স্ক্রিপ্ট থেকে ভিডিও",
    brandMark: "রিল", brandSub: "কারখানা",
    langGroup: "ভাষা", themeToLight: "লাইট (দিন) মোডে যান", themeToDark: "ডার্ক (রাত) মোডে যান",
    step1: "API চাবি", step2: "অডিও ও স্ক্রিপ্ট", step3: "দৃশ্য বিশ্লেষণ", step4: "মিডিয়া বাছাই", step5: "ভিডিও তৈরি",
    n1: "১", n2: "২", n3: "৩", n4: "৪", n5: "৫",

    keysTitle: "API চাবি",
    keysHint: "সবগুলোই ফ্রি — একবার দিলে এই ব্রাউজারেই সংরক্ষিত থাকবে, আমাদের সার্ভারে যায় না।",
    getKey: "সংগ্রহ করুন ↗",
    groqLabel: "Groq API Key — স্ক্রিপ্ট বিশ্লেষণ (প্রধান)",
    groqHint: "প্রতিটা সেগমেন্টের জন্য ইংরেজি ফুটেজ-সার্চ কি-ওয়ার্ড বের করতে ব্যবহৃত হয়। Groq ব্যর্থ হলে OpenRouter ফলব্যাক চলবে।",
    orLabel: "OpenRouter API Key — ফলব্যাক (বিশ্লেষণ ও ট্রান্সক্রিপশন)",
    orHint: "Groq (বিশ্লেষণ) বা Gemini (ট্রান্সক্রিপশন) ব্যর্থ হলে নিজে থেকেই OpenRouter-এ চলে যাবে; একটা মডেল ব্যর্থ হলে পরের আরও শক্তিশালী মডেলে যাবে। শুধু OpenRouter চাবি দিলেও সব কাজ চলবে।",
    viaOpenRouter: "OpenRouter দিয়ে করা হয়েছে (Groq ব্যর্থ) — মডেল: {model}",
    trViaOr: "OpenRouter দিয়ে করা হয়েছে (Gemini ব্যর্থ) — মডেল: {model}",
    geminiTrLabel: "Gemini API Key — অডিও ট্রান্সক্রিপশন (প্রধান)",
    geminiTrHint: "অডিও থেকে সরাসরি বাংলা ট্রান্সক্রিপ্ট বানানোর জন্য। Gemini-র লিমিট শেষ হলে বা ব্যর্থ হলে OpenRouter চাবি থাকলে নিজে থেকেই সেখানে চলে যাবে। ~১২MB পর্যন্ত অডিও ফাইল চলবে।",
    pixabayOpt: "(ঐচ্ছিক, ব্যাকআপ সোর্স)",
    shotstackHint: "রেজিস্ট্রেশন করলেই ড্যাশবোর্ডে \"Sandbox\" API key পাবেন — এটাই ব্যবহার করুন, এটা সম্পূর্ণ ফ্রি (আউটপুটে ছোট watermark থাকবে)।",
    saveKeys: "চাবি সংরক্ষণ করুন",
    keysNeed: "Groq অথবা OpenRouter (বিশ্লেষণ), Pexels ও Shotstack — এই চাবিগুলো দরকার। (অটো-ট্রান্সক্রিপশনের জন্য Gemini অথবা OpenRouter চাবি)",
    keysSaved: "সংরক্ষিত হয়েছে।",

    buildTitle: "ভিডিও তৈরি",
    buildHint: "ভিডিও রেন্ডার হবে Shotstack-এর ক্লাউড সার্ভারে — আপনার ব্রাউজার/মোবাইলের রিসোর্স লাগবে না। রেন্ডার শেষ না হওয়া পর্যন্ত ট্যাব খোলা রাখুন।",
    formatLabel: "ফরম্যাট (আকৃতি)",
    asp169: "ল্যান্ডস্কেপ ১৬:৯ — YouTube (সাধারণ)",
    asp916: "ভার্টিক্যাল ৯:১৬ — Shorts / Reels / TikTok",
    asp11: "স্কয়ার ১:১ — Facebook / Instagram ফিড পোস্ট",
    resLabel: "মান (রেজোলিউশন)", resSd: "SD (দ্রুত)", resHd: "HD", resFhd: "Full HD (ধীর)",
    borderLabel: "কালো বর্ডার (watermark ঢাকতে)",
    b0: "নেই", b6: "ছোট (৬%)", b10: "মাঝারি (১০%)", b12: "বড় (১২%) — সুপারিশকৃত", b13: "অতিরিক্ত (১৩%)", b15: "সর্বোচ্চ (১৫%)",
    captionToggle: "ভিডিওর নিচে ক্যাপশন (সাবটাইটেল) দেখান",
    capSizeLabel: "ক্যাপশন ফন্ট সাইজ", capSizeNote: "(বড় সংখ্যা = বড় ফন্ট)",
    s8: "৮ (সবচেয়ে ছোট)", s9: "৯", s10: "১০", s11: "১১", s12: "১২", s13: "১৩ (ডিফল্ট)", s14: "১৪", s15: "১৫", s16: "১৬", s17: "১৭", s18: "১৮ (সবচেয়ে বড়)",
    capColorLabel: "ক্যাপশন রঙ",
    cWhite: "সাদা", cYellow: "হলুদ", cGreen: "সবুজ", cRed: "লাল", cCyan: "সায়ান", cBlack: "কালো",
    capAnimLabel: "ক্যাপশন অ্যানিমেশন",
    aTypewriter: "টাইপরাইটার (অক্ষর করে করে)", aFade: "ফেড ইন", aSlideUp: "নিচ থেকে উপরে স্লাইড",
    aSlideLeft: "পাশ থেকে স্লাইড (বামে)", aZoom: "জুম ইন", aWipe: "ওয়াইপ (বামে)", aNone: "কিছুই না (তাৎক্ষণিক)",
    buildBtn: "ভিডিও রেন্ডার শুরু করুন",
    progressInit: "প্রস্তুত হচ্ছে…",
    downloadBtn: "ভিডিও দেখুন / ডাউনলোড করুন",
    recentTitle: "সাম্প্রতিক রেন্ডার",
    recentHint: "Shotstack sandbox-এর লিংক ~২৪ ঘণ্টা পর আর কাজ করবে না — তার আগেই ডাউনলোড করে নিন।",
    recentLabel: "{n}টি সেগমেন্ট — {date}",
    noRecent: "এখনো কোনো ভিডিও রেন্ডার হয়নি।",
    delTitle: "মুছে ফেলুন",

    h1: "বাংলা স্ক্রিপ্ট থেকে ভিডিও বানান",
    lead: "ভয়েসওভার অডিও দিন, টাইমস্ট্যাম্প সহ স্ক্রিপ্ট পেস্ট করুন — বাকিটা এই টুল সামলাবে।",
    audioLabel: "ভয়েসওভার অডিও ফাইল",
    audioDropTitle: "অডিও ফাইল এখানে টেনে এনে ছাড়ুন",
    audioDropSub: "MP3, WAV, M4A, OGG — অটো-ট্রান্সক্রিপশনের জন্য ~১২MB পর্যন্ত",
    audioChoose: "ফাইল বাছাই করুন", audioChange: "ফাইল বদলান",
    addOrHint: "OpenRouter API চাবি যোগ করলে Groq ফেল করার সাথে সাথে বিশ্লেষণ OpenRouter-এ চলবে।",
    transcribeBtn: "Auto Transcribe",
    transcribeHint: "অথবা নিচের বক্সে নিজেই টাইমস্ট্যাম্প-সহ স্ক্রিপ্ট বসিয়ে দিন — ট্রান্সক্রিপ্ট বাটনে না চাপলে অডিও শুধু ভিডিওর সাউন্ড হিসেবেই ব্যবহৃত হবে।",
    scriptLabel: "টাইমস্ট্যাম্প সহ স্ক্রিপ্ট",
    scriptPh: SCRIPT_PH_BN,
    scriptHint: "ফরম্যাট: <code>শুরু-শেষ | বাংলা লাইন</code>, mm:ss বা hh:mm:ss দুটোই চলবে। প্রতিটা সেগমেন্ট সর্বোচ্চ ২০ সেকেন্ডের মধ্যে রাখুন।",
    analyzeBtn: "স্ক্রিপ্ট বিশ্লেষণ করুন",
    timelineTitle: "দৃশ্য টাইমলাইন",
    timelineHint: "প্রতিটা সেগমেন্টের জন্য সার্চ কোয়েরি ঠিক আছে কিনা দেখুন, দরকার হলে পাল্টে আবার সার্চ করুন বা নিজের ছবি/ভিডিও আপলোড করুন।",

    pickerTitleDefault: "মিডিয়া বাছাই করুন",
    pickerTitle: "মিডিয়া বাছাই — {a}–{b}",
    queryPh: "ইংরেজি সার্চ টার্ম",
    optVideos: "ভিডিও", optPhotos: "ছবি",
    searchBtn: "সার্চ", prevBtn: "← আগের", nextBtn: "পরবর্তী →",
    pageLabel: "পাতা {n}",
    uploadOr: "অথবা নিজের ফাইল আপলোড করুন:",
    searching: "খুঁজছি…",
    noResults: "কোনো ফলাফল পাওয়া যায়নি — অন্য শব্দে সার্চ করুন, আগের পাতায় ফিরুন, বা নিজের ফাইল আপলোড করুন।",
    landscape: "ল্যান্ডস্কেপ", portrait: "ভার্টিক্যাল", square: "স্কয়ার",

    mVideo: "ভিডিও", mPhoto: "ছবি",
    notPicked: "এখনো বাছাই করা হয়নি",
    pickMediaAria: "মিডিয়া বাছাই করুন",
    researchBtn: "সার্চ করুন",
    queryPlaceholder: "ইংরেজি সার্চ টার্ম",

    secUnit: "সেকেন্ড",
    noTrKey: "অটো-ট্রান্সক্রিপ্ট চালু করতে Gemini (ট্রান্সক্রিপশন) অথবা OpenRouter চাবি দিয়ে সংরক্ষণ করুন।",
    fileTooBig: "ফাইলটা বড় ({mb}MB), অটো-ট্রান্সক্রিপ্ট এড়িয়ে যাওয়া হলো (সীমা ~১২MB)। ছোট/কম bitrate অডিও দিন, অথবা স্ক্রিপ্ট নিজে লিখুন।",
    transcribing: "অডিও ট্রান্সক্রাইব হচ্ছে ({name})…",
    trReady: "ট্রান্সক্রিপ্ট প্রস্তুত ({n}টি অংশ)। দেখে ঠিক আছে কিনা যাচাই করুন।",
    trFail: "ট্রান্সক্রিপশন ব্যর্থ: {msg} (স্ক্রিপ্ট নিজে লিখুন)",
    rateLimit: "API লিমিট শেষ, ৪০ সেকেন্ড পর আবার চেষ্টা করুন।",
    errTranscribe: "ট্রান্সক্রিপশন ব্যর্থ হয়েছে",
    errNoTranscript: "কোনো ট্রান্সক্রিপ্ট পাওয়া যায়নি",
    errEmptyTr: "খালি ট্রান্সক্রিপ্ট পাওয়া গেছে",

    noValidSeg: "কোনো বৈধ সেগমেন্ট পাওয়া যায়নি — ফরম্যাট চেক করুন।",
    needGemini: "প্রথমে Groq অথবা OpenRouter API চাবি দিয়ে সংরক্ষণ করুন।",
    analyzing: "বিশ্লেষণ চলছে… ({n}টি সেগমেন্ট)",
    errAnalyze: "বিশ্লেষণ ব্যর্থ হয়েছে",
    analyzeDone: "বিশ্লেষণ সম্পন্ন। প্রতিটা সেগমেন্টের জন্য মিডিয়া বাছাই করুন।",
    errPrefix: "ত্রুটি: {msg}",
    needMediaKey: "Pexels বা Pixabay চাবি দিন",
    searchFailed: "{provider} সার্চ ব্যর্থ",

    needShotstack: "প্রথমে Shotstack API চাবি দিয়ে সংরক্ষণ করুন।",
    upAudio: "অডিও Shotstack-এ আপলোড হচ্ছে…",
    prepSeg: "সেগমেন্ট {i}/{n} প্রস্তুত হচ্ছে…",
    sendingRender: "রেন্ডার অনুরোধ পাঠানো হচ্ছে…",
    rendering: "ক্লাউডে রেন্ডার হচ্ছে… ({status})",
    renderFailed: "রেন্ডার ব্যর্থ হয়েছে: {msg}",
    renderTimeout: "রেন্ডার সময়সীমার মধ্যে শেষ হয়নি — কিছুক্ষণ পর আবার চেষ্টা করুন",
    renderDone: "সম্পন্ন! ভিডিও প্রস্তুত (Sandbox মোড — ছোট watermark থাকবে)।",
    errShot: "Shotstack অনুরোধ ব্যর্থ হয়েছে",
    errUpload: "ফাইল আপলোড ব্যর্থ হয়েছে",
    errUploadProc: "আপলোড প্রসেসিং ব্যর্থ: {msg}",
    errUploadTimeout: "আপলোড প্রসেসিং সময়সীমা শেষ হয়ে গেছে",
  },

  en: {
    audioDefaultNote: "🎵 No audio selected — the video will use default background music.",
    capFontLabel: "Caption font", capFontNote: "(supports both Bangla & English)",
    fKolpona: "Kolpona (কল্পনা) — calligraphy style", fKolponaI: "Kolpona Italic (কল্পনা ইটালিক)",
    fHind: "Hind Siliguri — clean (default)", fGalada: "Galada — calligraphy / brush style",
    fAtma: "Atma — rounded, playful", fMina: "Mina — elegant, soft",
    formatTop: "Video Format (Aspect Ratio)", formatTopHint: "Scene footage is collected to match this format. You can still change it before rendering.",
    settings: "API Setup", prefs: "Preferences", langPref: "Language", themePref: "Theme (day / night)",
    stepOf: "Step {n} of 5", stepBack: "← Back", toRender: "Continue to render →",
    scenesReady: "{a}/{b} scenes ready",
    stReady: "Media selected", stSearching: "Searching…", stNone: "No media found", stAttention: "Needs attention",
    sceneNo: "Scene {n}", qLabel: "AI search query", editQ: "Edit", regenQ: "Regenerate", uploadBtn: "Upload",
    choicesLabel: "Media choices — tap to select",
    adv: "Advanced settings", sumDuration: "Duration", sumScenes: "Scenes", sumRes: "Resolution",
    renderTitle: "Ready to render", renderingTitle: "Creating your video…", doneTitle: "Your video is ready!",
    previewBtn: "▶ Preview", dlMp4: "Download MP4", copyLink: "Copy link", copied: "Link copied", createAnother: "Create another",
    openBtn: "Open", untitled: "Untitled project", emptyRecent: "No projects yet — make your first video!",
    docTitle: "Reel Factory — Script to Video",
    brandMark: "Reel", brandSub: "Factory",
    langGroup: "Language", themeToLight: "Switch to light (day) mode", themeToDark: "Switch to dark (night) mode",
    step1: "API keys", step2: "Audio & script", step3: "Scene analysis", step4: "Pick media", step5: "Create video",
    n1: "1", n2: "2", n3: "3", n4: "4", n5: "5",

    keysTitle: "API keys",
    keysHint: "All of these are free — once entered they stay saved in this browser only and are not sent to our server.",
    getKey: "Get key ↗",
    groqLabel: "Groq API Key — script analysis (primary)",
    groqHint: "Used to extract English footage-search keywords for every segment. If Groq fails, OpenRouter takes over.",
    orLabel: "OpenRouter API Key — fallback (analysis & transcription)",
    orHint: "If Groq (analysis) or Gemini (transcription) fails, work switches to OpenRouter automatically; if one model fails it moves on to the next, stronger model. An OpenRouter key alone is enough for everything.",
    viaOpenRouter: "done with OpenRouter (Groq failed) — model: {model}",
    trViaOr: "done with OpenRouter (Gemini failed) — model: {model}",
    geminiTrLabel: "Gemini API Key — audio transcription (primary)",
    geminiTrHint: "For creating a Bangla transcript straight from audio. If Gemini hits its limit or fails and an OpenRouter key is saved, transcription switches to OpenRouter automatically. Audio files up to ~12MB work.",
    pixabayOpt: "(optional, backup source)",
    shotstackHint: "After registering you'll find a \"Sandbox\" API key on the dashboard — use that one, it's completely free (the output will carry a small watermark).",
    saveKeys: "Save keys",
    keysNeed: "Groq or OpenRouter (analysis), Pexels and Shotstack keys are required. (A Gemini or OpenRouter key is needed for auto-transcription)",
    keysSaved: "Saved.",

    buildTitle: "Create video",
    buildHint: "The video is rendered on Shotstack's cloud servers — no browser/phone resources needed. Keep this tab open until rendering finishes.",
    formatLabel: "Format (aspect ratio)",
    asp169: "Landscape 16:9 — YouTube (standard)",
    asp916: "Vertical 9:16 — Shorts / Reels / TikTok",
    asp11: "Square 1:1 — Facebook / Instagram feed post",
    resLabel: "Quality (resolution)", resSd: "SD (fast)", resHd: "HD", resFhd: "Full HD (slow)",
    borderLabel: "Black border (to hide the watermark)",
    b0: "None", b6: "Small (6%)", b10: "Medium (10%)", b12: "Large (12%) — recommended", b13: "Extra (13%)", b15: "Maximum (15%)",
    captionToggle: "Show captions (subtitles) at the bottom of the video",
    capSizeLabel: "Caption font size", capSizeNote: "(bigger number = bigger font)",
    s8: "8 (smallest)", s9: "9", s10: "10", s11: "11", s12: "12", s13: "13 (default)", s14: "14", s15: "15", s16: "16", s17: "17", s18: "18 (largest)",
    capColorLabel: "Caption color",
    cWhite: "White", cYellow: "Yellow", cGreen: "Green", cRed: "Red", cCyan: "Cyan", cBlack: "Black",
    capAnimLabel: "Caption animation",
    aTypewriter: "Typewriter (letter by letter)", aFade: "Fade in", aSlideUp: "Slide up from bottom",
    aSlideLeft: "Slide from the side (left)", aZoom: "Zoom in", aWipe: "Wipe (left)", aNone: "None (instant)",
    buildBtn: "Start rendering video",
    progressInit: "Getting ready…",
    downloadBtn: "Watch / download video",
    recentTitle: "Recent renders",
    recentHint: "Shotstack sandbox links stop working after ~24 hours — download before then.",
    recentLabel: "{n} segments — {date}",
    noRecent: "No videos rendered yet.",
    delTitle: "Delete",

    h1: "Make a video from a Bangla script",
    lead: "Add your voiceover audio and paste a timestamped script — this tool handles the rest.",
    audioLabel: "Voiceover audio file",
    audioDropTitle: "Drag & drop your audio file here",
    audioDropSub: "MP3, WAV, M4A, OGG — up to ~12MB for auto-transcription",
    audioChoose: "Choose file", audioChange: "Change file",
    addOrHint: "Add an OpenRouter API key and analysis will switch to OpenRouter the moment Groq fails.",
    transcribeBtn: "Auto Transcribe",
    transcribeHint: "Or paste your own timestamped script in the box below — if you don't press the transcribe button, the audio is used only as the video's sound.",
    scriptLabel: "Script with timestamps",
    scriptPh: SCRIPT_PH_EN,
    scriptHint: "Format: <code>start-end | Bangla line</code>; both mm:ss and hh:mm:ss work. Keep each segment within 20 seconds.",
    analyzeBtn: "Analyze script",
    timelineTitle: "Scene timeline",
    timelineHint: "Check that the search query for each segment looks right, change it and search again if needed, or upload your own photo/video.",

    pickerTitleDefault: "Pick media",
    pickerTitle: "Pick media — {a}–{b}",
    queryPh: "Search term in English",
    optVideos: "Videos", optPhotos: "Photos",
    searchBtn: "Search", prevBtn: "← Previous", nextBtn: "Next →",
    pageLabel: "Page {n}",
    uploadOr: "Or upload your own file:",
    searching: "Searching…",
    noResults: "No results found — try different words, go back a page, or upload your own file.",
    landscape: "Landscape", portrait: "Vertical", square: "Square",

    mVideo: "Video", mPhoto: "Photo",
    notPicked: "Not selected yet",
    pickMediaAria: "Pick media",
    researchBtn: "Search",
    queryPlaceholder: "Search term in English",

    secUnit: "seconds",
    noTrKey: "Save a Gemini (transcription) or OpenRouter key to enable auto-transcription.",
    fileTooBig: "The file is large ({mb}MB), so auto-transcription was skipped (limit ~12MB). Use a smaller/lower-bitrate audio file, or write the script yourself.",
    transcribing: "Transcribing audio ({name})…",
    trReady: "Transcript ready ({n} parts). Please review it to make sure it's right.",
    trFail: "Transcription failed: {msg} (write the script yourself)",
    rateLimit: "API limit reached — try again in 40 seconds.",
    errTranscribe: "Transcription failed",
    errNoTranscript: "No transcript was received",
    errEmptyTr: "Received an empty transcript",

    noValidSeg: "No valid segments found — check the format.",
    needGemini: "Please enter and save your Groq or OpenRouter API key first.",
    analyzing: "Analyzing… ({n} segments)",
    errAnalyze: "Analysis failed",
    analyzeDone: "Analysis complete. Pick media for each segment.",
    errPrefix: "Error: {msg}",
    needMediaKey: "Enter a Pexels or Pixabay key",
    searchFailed: "{provider} search failed",

    needShotstack: "Please enter and save your Shotstack API key first.",
    upAudio: "Uploading audio to Shotstack…",
    prepSeg: "Preparing segment {i}/{n}…",
    sendingRender: "Sending render request…",
    rendering: "Rendering in the cloud… ({status})",
    renderFailed: "Render failed: {msg}",
    renderTimeout: "Rendering didn't finish in time — please try again in a little while",
    renderDone: "Done! Video ready (Sandbox mode — a small watermark will be present).",
    errShot: "Shotstack request failed",
    errUpload: "File upload failed",
    errUploadProc: "Upload processing failed: {msg}",
    errUploadTimeout: "Upload processing timed out",
  },
};

let currentLang = "en";
try {
  currentLang = localStorage.getItem("rk_lang") === "bn" ? "bn" : "en";
} catch (_) {}

export function getLang() {
  return currentLang;
}

export function t(key, params) {
  let s = (DICT[currentLang] && DICT[currentLang][key]) ?? DICT.bn[key] ?? key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  }
  return s;
}

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml); // শুধু আমাদের নিজস্ব স্থির টেক্সট, ব্যবহারকারীর ইনপুট নয়
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.documentElement.lang = currentLang;
  document.title = t("docTitle");
}

const listeners = [];
export function onLangChange(fn) {
  listeners.push(fn);
}

export function setLang(lang) {
  currentLang = lang === "en" ? "en" : "bn";
  try {
    localStorage.setItem("rk_lang", currentLang);
  } catch (_) {}
  applyI18n();
  listeners.forEach((fn) => fn(currentLang));
}
