# Pyinsect

A web app that identifies insects in photos with the Pyinsect 2.7 model (154 classes) and
reports invasive species. Everything runs as a GitHub Pages site:

| Page | What it does |
|---|---|
| `/` | Identify: pick photos, the model runs in the browser |
| `/latest/` | The newest invasive report (refreshes every 2 minutes) |
| `/all/` | Every report, with a count per species |

Reports are stored in `reports/` in this repository: one `.json` and one `.jpg` per find.

## Setup

1. **Create the repository.** On GitHub, create a **public** repository, for example
   `pyinsect-reports`, and upload everything in this folder (`index.html`, `README.md`,
   `all/`, `latest/`, `assets/`, `model/`) to its root.
2. **Turn on the website.** In the repository open **Settings → Pages**, choose
   **Deploy from a branch**, branch **main**, folder **/ (root)**, and save. After a minute the
   site is live at `https://<your-username>.github.io/pyinsect-reports/`.
3. **Make a token for reporting.** GitHub → **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories** → this repository
   - Repository permissions → **Contents: Read and write** (leave everything else at No access)
4. **Set up the report relay.** The token must never be in the site's files (the repository is
   public). Instead a free Cloudflare Worker holds it and saves reports for the site:
   1. Sign up at https://dash.cloudflare.com/sign-up (free).
   2. **Workers & Pages → Create → Start with Hello World**, name it `pyinsect-relay`, **Deploy**.
   3. **Edit code**, replace everything with the contents of `relay/worker.js`, **Deploy**.
   4. **Settings → Variables and Secrets → Add**:
      - `GITHUB_TOKEN`, type **Secret**: the token from step 3
      - `GITHUB_REPO`, type **Text**: `<your-username>/<repository>`
      - `ALLOWED_ORIGIN`, type **Text**: `https://<your-username>.github.io`
   5. Copy the worker's address (`https://pyinsect-relay.<something>.workers.dev`) into
      `RELAY_URL` at the top of `assets/reports.js`.

## Notes

- Anyone can use the identifier, and every invasive find is reported automatically.
- The relay only accepts invasive species, JPEG photos up to 1.5 MB and recent reports, and it
  can only add new files to `reports/`, never change or delete existing ones.
- If a report can't be sent (no internet), it waits in the browser and is sent with the next
  report, when the connection comes back, or with **Send waiting reports**.
- If you change `INVASIVE` in `index.html`, change it in `relay/worker.js` too and redeploy the
  worker.
- The invasive species list is `INVASIVE` near the top of the script in `index.html` (and in
  `relay/worker.js`).
- To use a newer model, replace `model/insect_model.onnx` and update `CLASS_NAMES` in
  `index.html`. `convert_to_onnx.py` in the app folder converts a `.pth` and writes its class
list to `assets/models/models.json`.
