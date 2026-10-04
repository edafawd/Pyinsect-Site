// Pyinsect report relay (Cloudflare Worker).
// The website sends each invasive-species report here; this worker checks it and saves it to
// reports/ in the GitHub repo with a token that only Cloudflare knows.
//
// Settings (Cloudflare → this worker → Settings → Variables and Secrets):
//   GITHUB_TOKEN    Secret. Fine-grained token, Contents: Read and write on the repo below.
//   GITHUB_REPO     Text, e.g. edafawd/Test
//   ALLOWED_ORIGIN  Text, e.g. https://edafawd.github.io

// Must match INVASIVE in index.html
const INVASIVE = new Set([
  "ambrosia_beetle", "argentine_ant", "asian_giant_hornet", "asian_lady_beetle",
  "asian_longhorned_beetle", "balsam_woolly_adelgid", "brown_marmorated_stink_bug",
  "cabbage_white", "elm_leaf_beetle", "emerald_ash_borer", "european_paper_wasp",
  "fire_ant", "formosan_termite", "japanese_beetle", "oriental_beetle", "rose_chafer",
  "spongy_moth", "spotted_lanternfly"
]);
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const MAX_AGE_DAYS = 60;            // reports can wait offline on a phone for a while
const PER_IP_LIMIT = 30;            // reports per IP per hour (per Cloudflare server, best effort)

const ID_RE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[0-9a-f]{1,8}$/;
const SPECIES_RE = /^[a-z_]{1,48}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const recent = new Map();

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET") return reply(200, { ok: true, service: "pyinsect-relay" });
    if (request.method !== "POST") return reply(405, { error: "Use POST." });
    const origin = request.headers.get("Origin");
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return reply(403, { error: "Reports are only accepted from the Pyinsect site." });
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return reply(500, { error: "The relay isn't set up yet (GITHUB_TOKEN / GITHUB_REPO missing)." });

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    const hour = Math.floor(Date.now() / 3600000);
    const seen = recent.get(ip);
    const count = seen && seen.hour === hour ? seen.count : 0;
    if (count >= PER_IP_LIMIT) return reply(429, { error: "Too many reports from this network. Try again later." });

    let body;
    try { body = await request.json(); } catch { return reply(400, { error: "Not valid JSON." }); }
    const checked = checkReport(body);
    if (checked.error) return reply(400, { error: checked.error });
    recent.set(ip, { hour, count: count + 1 });
    if (recent.size > 5000) recent.clear();

    const { report, photo } = checked;
    try {
      // Photo first, so the report pages only list a report once its photo exists
      await githubCreate(env, `reports/${report.id}.jpg`, photo, `Photo for ${report.name} report`);
      await githubCreate(env, `reports/${report.id}.json`, toBase64(JSON.stringify(report, null, 1)), `Invasive species report: ${report.name}`);
    } catch (e) {
      return reply(502, { error: e.message });
    }
    return reply(201, { ok: true, id: report.id });
  },
};

// Accepts only well-formed invasive reports and rebuilds them from known fields
function checkReport(body) {
  const r = body && body.report, photo = body && body.photo;
  if (!r || typeof r !== "object") return { error: "Missing report." };

  const m = typeof r.id === "string" && r.id.match(ID_RE);
  if (!m) return { error: "Bad report id." };
  const when = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (isNaN(when) || when > Date.now() + 3600000 || when < Date.now() - MAX_AGE_DAYS * 86400000) {
    return { error: "Report time is out of range." };
  }
  if (!INVASIVE.has(r.species)) return { error: "Only invasive species are reported." };
  if (typeof r.timestamp !== "string" || !TIMESTAMP_RE.test(r.timestamp)) return { error: "Bad timestamp." };
  const pct = v => typeof v === "number" && v >= 0 && v <= 100;
  if (!pct(r.confidence)) return { error: "Bad confidence." };
  if (!Array.isArray(r.top3) || r.top3.length < 1 || r.top3.length > 3
      || !r.top3.every(t => t && SPECIES_RE.test(t.species) && pct(t.confidence))) {
    return { error: "Bad top-3 list." };
  }

  if (typeof photo !== "string" || photo.length > MAX_PHOTO_BYTES * 4 / 3 + 4) return { error: "Photo missing or too large." };
  let bytes;
  try { bytes = atob(photo); } catch { return { error: "Photo isn't valid base64." }; }
  if (bytes.charCodeAt(0) !== 0xFF || bytes.charCodeAt(1) !== 0xD8 || bytes.charCodeAt(2) !== 0xFF) {
    return { error: "Photo must be a JPEG." };
  }

  const short = (v, n) => typeof v === "string" ? v.slice(0, n) : "";
  return {
    photo,
    report: {
      id: r.id,
      timestamp: r.timestamp,
      species: r.species,
      name: r.species.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      confidence: r.confidence,
      top3: r.top3.map(t => ({ species: t.species, confidence: t.confidence })),
      photo: `${r.id}.jpg`,
      model: short(r.model, 40),
      app_version: short(r.app_version, 20),
    },
  };
}

// Creates a file; never overwrites (GitHub answers 422 when the file already exists)
async function githubCreate(env, path, base64, message) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pyinsect-relay",
    },
    body: JSON.stringify({ message, content: base64 }),
  });
  if (res.status === 422) return;   // already saved on an earlier try
  if (res.status === 401) throw new Error("The relay's GitHub token was rejected (expired?).");
  if (res.status === 403 || res.status === 404) throw new Error("The relay's GitHub token can't write to the repo.");
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
}

function toBase64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
