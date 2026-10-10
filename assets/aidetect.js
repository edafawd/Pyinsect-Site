// Free AI-image detector that runs in the browser: Ateeqq/ai-vs-human-image-detector (SigLIP,
// Apache-2.0), exported to ONNX fp16 (172 MB, split in two because GitHub files max out at 100 MB).
// It judges the pixels, so cropping doesn't hide an AI image, but it's a hint, not proof:
// Oct 10 test: caught 2 of 3 AI insect images, and wrongly scored 30 of 150 real photos 70%+.
// Used by the private reports page (warning only) and the AI check test page. Needs onnxruntime-web.
//
// AIDetect.load(onProgress) → Promise; AIDetect.score(blobOrFile) → Promise<P(AI), 0..1>

const AIDetect = (() => {
  const BASE = new URL("../model/", document.currentScript ? document.currentScript.src : location.href).href;
  const PARTS = ["ai_detector.onnx.part1", "ai_detector.onnx.part2"].map(p => BASE + p + "?v=1");
  const SIZE = 171799286;          // both parts together, for the progress bar
  const CACHE = "pyinsect-aidetect-v1";
  let session = null, loading = null;

  // Parts are kept in the Cache API so the 172 MB only downloads once per browser
  async function getPart(url, done) {
    let cache = null;
    try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch {}
    const res = await fetch(url);
    if (!res.ok) throw new Error(`could not download the AI detector (${res.status})`);
    const reader = res.body.getReader(), chunks = [];
    let got = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value); got += value.length; done(value.length);
    }
    const buf = new Uint8Array(got);
    let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length; }
    try { if (cache) await cache.put(url, new Response(buf)); } catch {}   // storage full: just don't keep it
    return buf;
  }

  function load(onProgress = () => {}) {
    if (session) return Promise.resolve();
    if (!loading) loading = (async () => {
      if (typeof ort === "undefined") throw new Error("the onnxruntime script did not load");
      ort.env.wasm.numThreads = 1;
      let got = 0;
      const tick = n => { got += n; onProgress(Math.min(99, Math.round(got / SIZE * 100))); };
      const parts = [];
      for (const url of PARTS) { const p = await getPart(url, tick); parts.push(p); }
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let off = 0; for (const p of parts) { all.set(p, off); off += p.length; }
      onProgress(100);
      session = await ort.InferenceSession.create(all, { executionProviders: ["wasm"] });
    })().catch(e => { loading = null; throw e; });
    return loading;
  }

  // Pillow BILINEAR weights for one axis (antialiased when shrinking), as in the Python check
  function coeffs(inSize, outSize) {
    const scale = inSize / outSize, fscale = Math.max(scale, 1), res = [];
    for (let o = 0; o < outSize; o++) {
      const center = (o + 0.5) * scale;
      const min = Math.max(Math.trunc(center - fscale + 0.5), 0), max = Math.min(Math.trunc(center + fscale + 0.5), inSize);
      const w = []; let sum = 0;
      for (let x = min; x < max; x++) { const t = Math.abs((x - center + 0.5) / fscale); const v = t < 1 ? 1 - t : 0; w.push(v); sum += v; }
      res.push({ min, w: w.map(v => v / sum) });
    }
    return res;
  }

  // Squash to 224×224, scale to -1..1 (mean 0.5, std 0.5), CHW
  async function tensor(blob) {
    const bmp = await createImageBitmap(blob);
    const w = bmp.width, h = bmp.height, c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const src = ctx.getImageData(0, 0, w, h).data, cx = coeffs(w, 224), cy = coeffs(h, 224);
    const mid = new Uint8ClampedArray(h * 224 * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < 224; x++) {
      const { min, w: k } = cx[x]; let r = 0, g = 0, b = 0;
      for (let i = 0; i < k.length; i++) { const p = (y * w + min + i) * 4; r += src[p] * k[i]; g += src[p + 1] * k[i]; b += src[p + 2] * k[i]; }
      const o = (y * 224 + x) * 3; mid[o] = Math.round(r); mid[o + 1] = Math.round(g); mid[o + 2] = Math.round(b);
    }
    const out = new Float32Array(3 * 224 * 224), plane = 224 * 224;
    for (let y = 0; y < 224; y++) {
      const { min, w: k } = cy[y];
      for (let x = 0; x < 224; x++) for (let ch = 0; ch < 3; ch++) {
        let v = 0;
        for (let i = 0; i < k.length; i++) v += mid[((min + i) * 224 + x) * 3 + ch] * k[i];
        out[ch * plane + y * 224 + x] = Math.min(255, Math.max(0, Math.round(v))) / 127.5 - 1;
      }
    }
    return new ort.Tensor("float32", out, [1, 3, 224, 224]);
  }

  async function score(blob) {
    await load();
    const out = await session.run({ input: await tensor(blob) });
    return out.ai.data[0];
  }

  return { load, score, THRESHOLD: 0.7 };
})();
