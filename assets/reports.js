// Shared helpers for the identifier page.
// The report relay (Cloudflare Worker, see relay/worker.js). Empty = reporting off.
const RELAY_URL = "https://pyinsect-relay.pandadifferent246.workers.dev";

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
