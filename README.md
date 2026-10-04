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
   - Repository access: **Only select repositories** → `pyinsect-reports`
   - Repository permissions → **Contents: Read and write** (leave everything else at No access)
4. **Turn on reporting on each device.** Open the site, expand **Reporting**, paste the token and
   press **Save token**. The token is kept in that browser only. It is never part of the site's
   files, so visitors can use the identifier without being able to file reports.

## Notes

- Anyone can use the identifier. Only browsers with a saved token file reports.
- If a report can't be sent (no internet, expired token), it waits in the browser and is sent
  with the next report, when the connection comes back, or with **Send waiting reports**.
- The invasive species list is `INVASIVE` near the top of the script in `index.html`.
- To use a newer model, replace `model/insect_model.onnx` and update `CLASS_NAMES` in
  `index.html`. `convert_to_onnx.py` in the app folder converts a `.pth` and writes its class
list to `assets/models/models.json`.
