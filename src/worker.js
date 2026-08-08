const UPSTREAM = "https://www.bestjavporn.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CATEGORIES = [
  { slug: "home", name: "首页", isHome: true },
  { slug: "censored", name: "有码", path: "/v25/category/censored/" },
  { slug: "uncensored", name: "无码", path: "/v25/category/uncensored/" },
  { slug: "amateur", name: "素人", path: "/v25/category/amateur/" },
  { slug: "decensored", name: "骑乘位", path: "/v25/category/decensored/" },
  { slug: "english-sub", name: "英字", path: "/v25/category/censored/english-subtitle/" },
  { slug: "chinese-sub", name: "中字", path: "/v25/category/chinese-subtitle/" },
];

const CACHE_TTL = 60;

async function fetchText(url, referer = UPSTREAM + "/", method = "GET", body = null, extraHeaders = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      "User-Agent": UA,
      "Accept-Language": "zh-CN,zh;q=0.9",
      Accept: "text/html,application/xhtml+xml",
      Referer: referer,
      ...extraHeaders,
    },
    body,
    cf: { cacheTtl: CACHE_TTL, cacheEverything: method === "GET" },
  });
  if (!res.ok) throw new Error("upstream " + res.status);
  return await res.text();
}

function clean(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "…");
}

function isoDurationToText(value) {
  if (!value) return null;
  const m = value.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const hours = (Number(m[1]) || 0) * 24 + (Number(m[2]) || 0);
  const minutes = Number(m[3]) || 0;
  const seconds = Number(m[4]) || 0;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function b64encodeStr(s) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  const bytes = Uint8Array.from(s, (ch) => ch.charCodeAt(0));
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? "=" : chars[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? "=" : chars[b2 & 63];
  }
  return out;
}

function b64decodeStr(s) {
  const t = atob(s);
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}

function rc4Decrypt(inputStr, encryptedB64, suffix) {
  const keyStr = b64encodeStr(inputStr + suffix).split("").reverse().join("");
  const keyBytes = Uint8Array.from(keyStr, (ch) => ch.charCodeAt(0) & 0xff);
  const enc = b64decodeStr(encryptedB64);
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xff;
    const t = S[i];
    S[i] = S[j];
    S[j] = t;
  }
  let i = 0;
  j = 0;
  const out = new Uint8Array(enc.length);
  for (let k = 0; k < enc.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const t = S[i];
    S[i] = S[j];
    S[j] = t;
    out[k] = enc[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  const latin = String.fromCharCode.apply(null, out);
  return new TextDecoder().decode(b64decodeStr(latin));
}

function parseCards(html) {
  const out = [];
  const seen = new Set();
  const cardRe = /<article[^>]*id="post-(\d+)"[^>]*class="[^"]*thumb-block[^"]*loop-video"[\s\S]*?<\/article>/g;
  let m;
  while ((m = cardRe.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    const block = m[0];
    const hrefM = block.match(/<a[^>]*href="https:\/\/www\.bestjavporn\.com\/video\/([^"\/]+)\/"/);
    if (!hrefM) continue;
    const slug = hrefM[1];
    const titleM = block.match(/<a[^>]*title="([^"]*)"/);
    const title = titleM ? decodeEntities(titleM[1]).trim() : "";
    if (!title) continue;
    const durM = block.match(/<span class="duration">[\s\S]*?<\/i>\s*([^<]+?)\s*<\/span>/);
    const duration = durM ? durM[1].trim() : null;
    const viewsM = block.match(/<span class="views">[\s\S]*?<\/i>\s*([^<]+?)\s*<\/span>/);
    const views = viewsM ? viewsM[1].trim() : null;
    let cover = null;
    const lazyM = block.match(/data-lazy-src="(https:\/\/[^"]+)"/);
    if (lazyM) cover = lazyM[1];
    if (!cover) {
      const srcM = block.match(/src="(https:\/\/[^"]+)"/);
      if (srcM && !srcM[1].includes("data:image")) cover = srcM[1];
    }
    seen.add(id);
    out.push({ id, slug, title, duration, views, coverUrl: cover });
  }
  return out;
}

function parsePager(html) {
  const next = html.match(/<link rel="next" href="([^"]*)"/);
  return { hasNext: !!next, totalPages: next ? null : 1 };
}

function metaContent(html, attr, value) {
  const m = html.match(new RegExp(`<meta[^>]*${attr}="\\b${value}\\b"[^>]*content="([^"]*)"`));
  if (m) return m[1];
  const m2 = html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="\\b${value}\\b"`));
  return m2 ? m2[1] : null;
}

function parseDetail(html) {
  const area = html.match(/id="video-player-area"[^>]*video-id="(\d+)"[^>]*video_ver="(\d+)"/);
  if (!area) return null;
  const videoId = area[1];
  const videoVersion = area[2];
  const mpuM = html.match(/id="video-player"[^>]*data-mpu="([^"]+)"/);
  if (!mpuM) return null;
  const encodedSources = mpuM[1];
  const titleM = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/);
  const title = titleM ? decodeEntities(clean(titleM[1])) : "";
  if (!title) return null;
  const duration = isoDurationToText(metaContent(html, "itemprop", "duration"));
  const cover = metaContent(html, "itemprop", "thumbnailUrl");
  const author = clean(metaContent(html, "itemprop", "author"));
  const viewsM = metaContent(html, "itemprop", "interactionCount");
  const views = viewsM ? Number(viewsM.replace(/\D/g, "")) : null;
  return { videoId, videoVersion, encodedSources, title, duration, coverUrl: cover || null, author: author || null, views };
}

function pickBestSource(sourcesJson) {
  let best = null;
  let bestScore = -1;
  for (const item of sourcesJson) {
    const file = String(item.file || "").trim();
    const type = String(item.type || "").toLowerCase();
    if (!/^https:\/\//.test(file)) continue;
    const isHls = type.includes("hls") || type.includes("mpegurl") || file.endsWith(".m3u8");
    const isMp4 = type.includes("mp4") || file.endsWith(".mp4");
    if (!isHls && !isMp4) continue;
    const labelNum = Number((String(item.label || "").match(/\d+/) || [0])[0]) || 0;
    const score = (isHls ? 10000 : 0) + labelNum;
    if (score > bestScore) {
      bestScore = score;
      best = { file, isHls };
    }
  }
  return best;
}

async function resolvePlayback(detail, detailUrl) {
  const sources = rc4Decrypt(detail.videoId, detail.encodedSources, "_0x58fe15");
  let playJson;
  try {
    const playText = await fetchText(
      UPSTREAM + "/api/play/",
      detailUrl,
      "POST",
      `sources=${encodeURIComponent(sources)}&ver=${detail.videoVersion}`,
      {
        "Origin": UPSTREAM,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    );
    playJson = JSON.parse(playText);
  } catch {
    return null;
  }
  if (!playJson || !playJson.status || !playJson.data) return null;
  let playerUrl;
  try {
    playerUrl = rc4Decrypt(detail.videoId, playJson.data, "_0x58fe15").trim();
    if (playerUrl.startsWith("//")) playerUrl = "https:" + playerUrl;
  } catch {
    return null;
  }
  if (!/^https:\/\/[^"']+$/.test(playerUrl)) return null;
  let playerHtml;
  try {
    playerHtml = await fetchText(playerUrl, detailUrl);
  } catch {
    return null;
  }
  const configM = playerHtml.match(/id="jwplayer"[^>]*data-config="([^"]+)"/);
  if (!configM) return null;
  const urlObj = new URL(playerUrl);
  const pathAndQuery = urlObj.pathname + (urlObj.search || "");
  const key = b64encodeStr(pathAndQuery).substring(4, 20);
  let configJson;
  try {
    configJson = rc4Decrypt(key, configM[1], "_0x59a0e4");
  } catch {
    return null;
  }
  let config;
  try {
    config = JSON.parse(configJson);
  } catch {
    return null;
  }
  const srcB64 = String(config.src || "").trim();
  if (!srcB64) return null;
  let sourcesList;
  try {
    const decoded = new TextDecoder().decode(b64decodeStr(srcB64));
    sourcesList = JSON.parse(decoded);
  } catch {
    return null;
  }
  const chosen = pickBestSource(Array.isArray(sourcesList) ? sourcesList : []);
  if (!chosen) return null;
  const proxyDomains = ["pianopic.com", "streamhls.click"];
  let playUrl = chosen.file;
  try {
    const host = new URL(chosen.file).hostname;
    if (proxyDomains.some((d) => host === d || host.endsWith("." + d))) playUrl = "/api/proxy?url=" + encodeURIComponent(chosen.file);
  } catch {}
  return { playUrl, poster: config.img ? decodeEntities(String(config.img).replace(/\\\//g, "/")) : null };
}

async function handleProxy(url) {
  if (!/^https:\/\/(pianopic\.com|streamhls\.click)(\/|$)/i.test(url)) return json({ ok: false, error: "代理目标不允许" }, 403);
  const target = new URL(url);
  let upstream;
  try {
    upstream = await fetch(url, { headers: { "User-Agent": UA, "Referer": UPSTREAM + "/" } });
  } catch {
    return json({ ok: false, error: "上游不可达" }, 502);
  }
  if (!upstream.ok) return json({ ok: false, error: "上游 " + upstream.status }, 502);
  const ct = upstream.headers.get("Content-Type") || "";
  const isPlaylist = /mpegurl|hls|octet-stream|text/i.test(ct) || target.pathname.endsWith(".m3u8");
  if (isPlaylist) {
    let text;
    try {
      text = await upstream.text();
    } catch {
      return json({ ok: false, error: "上游读取失败" }, 502);
    }
    const base = target.href;
    const lines = text.split(/\r?\n/).map((line) => {
      if (!line || line.startsWith("#")) {
        const keyM = line.match(/^#EXT-X-KEY:[^"]*URI="([^"]+)"/);
        if (keyM) {
          const abs = new URL(keyM[1].replace(/\\\//g, "/"), base).href;
          return line.replace(keyM[1], "/api/proxy?url=" + encodeURIComponent(abs));
        }
        return line;
      }
      const abs = new URL(line.replace(/\\\//g, "/"), base).href;
      return "/api/proxy?url=" + encodeURIComponent(abs);
    });
    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": ct || "video/MP2T",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function json(data, status = 200, cache = "public, max-age=30") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
    },
  });
}

function feedPath(feed, page) {
  if (feed.slug === "home") {
    return page > 1 ? `/page/${page}/` : "/";
  }
  const path = feed.path;
  return page > 1 ? `${path}page/${page}/` : path;
}

async function handleMeta() {
  return json({ ok: true, categories: CATEGORIES });
}

async function handlePosts(url) {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const cat = (url.searchParams.get("category") || "").trim();
  const feed = CATEGORIES.find((c) => c.slug === cat) || CATEGORIES[0];
  const query = (url.searchParams.get("q") || "").trim();
  let upstream;
  if (query) {
    upstream = page === 1
      ? `${UPSTREAM}/?s=${encodeURIComponent(query)}`
      : `${UPSTREAM}/search/${encodeURIComponent(query)}/page/${page}/`;
  } else {
    upstream = UPSTREAM + feedPath(feed, page);
  }
  let html;
  try {
    html = await fetchText(upstream);
  } catch {
    return json({ ok: false, error: "上游源站超时或不可用" }, 502);
  }
  const posts = parseCards(html);
  const { hasNext } = parsePager(html);
  return json({
    ok: true,
    page,
    hasNext: hasNext,
    totalPages: hasNext ? null : 1,
    query: query || null,
    posts,
  });
}

async function handlePost(pathname) {
  const id = pathname.slice("/api/post/".length);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return json({ ok: false, error: "视频 ID 无效" }, 400);
  const detailUrl = `${UPSTREAM}/video/${id}/`;
  let html;
  try {
    html = await fetchText(detailUrl);
  } catch {
    return json({ ok: false, error: "上游源站超时或不可用" }, 502);
  }
  const info = parseDetail(html);
  if (!info) return json({ ok: false, error: "内容不存在" }, 404);

  let playUrl = null;
  let poster = null;
  try {
    const playback = await resolvePlayback(info, detailUrl);
    if (playback) {
      playUrl = playback.playUrl;
      poster = playback.poster;
    }
  } catch {
    // 播放地址获取失败时仍返回详情
  }

  const related = parseCards(html).filter((r) => r.slug !== id).slice(0, 12);

  return json(
    {
      ok: true,
      post: {
        id,
        title: info.title,
        description: null,
        author: info.author,
        dateText: null,
        views: info.views,
        favorites: null,
        likes: null,
        duration: info.duration,
        coverUrl: info.coverUrl,
        tags: [],
        playUrl,
        poster,
        related,
      },
    },
    200,
    "no-store",
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/api/meta") return handleMeta();
    if (pathname === "/api/posts") return handlePosts(url);
    if (pathname.startsWith("/api/post/")) return handlePost(pathname);
    if (pathname === "/api/proxy") return handleProxy(url.searchParams.get("url") || "");
    if (pathname === "/api/health") return json({ ok: true });
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not Found", { status: 404 });
  },
};
