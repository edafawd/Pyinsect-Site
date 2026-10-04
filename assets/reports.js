// Reads the reports the Pyinsect app uploads to reports/ in this GitHub repo.
// Owner and repo come from the GitHub Pages address (<owner>.github.io/<repo>/);
// set them here only if the site is hosted somewhere else.
const OWNER = "";
const REPO = "";
// The report relay (Cloudflare Worker, see relay/worker.js). Empty = reporting off.
const RELAY_URL = "https://pyinsect-relay.pandadifferent246.workers.dev";

function repoFromLocation() {
  const host = location.hostname;
  if (OWNER && REPO) return { owner: OWNER, repo: REPO };
  if (host.endsWith(".github.io")) {
    const owner = host.split(".")[0];
    const first = location.pathname.split("/").filter(Boolean)[0];
    // A user site (<owner>.github.io) has no repo segment in its path
    const repo = first && !["latest", "all", "index.html"].includes(first) ? first : host;
    return { owner, repo };
  }
  return null;
}

async function listReports() {
  const where = repoFromLocation();
  if (!where) throw new Error("Set OWNER and REPO at the top of assets/reports.js.");
  const res = await fetch(`https://api.github.com/repos/${where.owner}/${where.repo}/contents/reports`, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (res.status === 403) throw new Error("GitHub is limiting requests from this network. Try again in a few minutes.");
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  const files = await res.json();
  const photos = new Map(files.filter(f => f.name.endsWith(".jpg")).map(f => [f.name, f.download_url]));
  // Report ids start with a UTC timestamp, so name order is time order
  return files
    .filter(f => f.name.endsWith(".json"))
    .sort((a, b) => b.name.localeCompare(a.name))
    .map(f => ({ id: f.name.slice(0, -5), jsonUrl: f.download_url, photoUrl: photos.get(f.name.slice(0, -5) + ".jpg") }));
}

async function loadReport(entry) {
  const res = await fetch(entry.jsonUrl);
  if (!res.ok) throw new Error(`Could not read report ${entry.id}.`);
  return { ...(await res.json()), photoUrl: entry.photoUrl };
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const mins = Math.round((Date.now() - d) / 60000);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago`
    : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  return { ago, full: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) };
}

const niceName = s => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

// Sends one report to the relay (relay/worker.js), which saves it to reports/ in the repo
async function relaySend(report, photo) {
  if (!RELAY_URL) throw new Error("Reporting isn't set up yet (RELAY_URL in assets/reports.js).");
  let res;
  try {
    res = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, photo }),
    });
  } catch {
    throw new Error("Couldn't reach the report server. It will be sent later.");
  }
  if (res.ok) return;
  let msg = `the report server answered ${res.status}`;
  try { msg = (await res.json()).error || msg; } catch {}
  const e = new Error(msg);
  e.rejected = res.status === 400;   // the relay will never accept this report
  throw e;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
