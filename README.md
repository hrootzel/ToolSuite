# ToolSuite

A modern, lightweight set of browser-based utilities (static HTML/CSS/JS). No build step.

## Utilities

- Strong Password Generator (`StrongPassword.html`): configurable passwords with weighted character sets and multi-output.
- Dose Calculator (`DoseCalculator.html`): half-life decay chart with daily dosing, stats, and click-to-read values.
- QR Code Generator (`QRCodeGenerator.html`): client-side QR creation with selectable version, error correction, and mask.

## Add a new utility

1. Add a new `*.html` file in the repo root.
2. Add a card/link in `index.html`.
3. Reuse the shared styling in `style.css`.

## Run locally

ToolSuite is easiest to use via a local static server (avoids some browser restrictions around `file://`).

- Windows: `.\serve.bat`
- macOS/Linux: `chmod +x serve.sh` then `./serve.sh`
- Manual: `python -m http.server 8000` (or `python3 -m http.server 8000`)

Then open `http://localhost:8000/`.
