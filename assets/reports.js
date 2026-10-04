// Reads the reports the Pyinsect app uploads to reports/ in this GitHub repo.
// Owner and repo come from the GitHub Pages address (<owner>.github.io/<repo>/);
// set them here only if the site is hosted somewhere else.
const OWNER = "";
const REPO = "";

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

// Writes one file into the repo (used by the app page to file reports)
async function githubPut(token, path, base64, message) {
  const where = repoFromLocation();
  if (!where) throw new Error("Set OWNER and REPO at the top of assets/reports.js.");
  const res = await fetch(`https://api.github.com/repos/${where.owner}/${where.repo}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ message, content: base64 }),
  });
  if (res.status === 422) return;   // already uploaded on an earlier try
  if (res.status === 401) throw new Error("GitHub rejected the token. It may have expired; save a new one.");
  if (res.status === 403 || res.status === 404) throw new Error("This token can't write to the reports repository.");
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
