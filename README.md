# ESM — English · Serbian · Macedonian

Phone-first conjugation trainer. Installable as an app (PWA), works offline,
progress stays on the device.

- **Serbian**: ekavian, Latin script (č ć š ž đ)
- **Macedonian**: Cyrillic (ѓ ќ ѕ љ њ џ ј)
- 50 common verbs × present / past / future × ja·ti·on·mi·vi·oni × affirmative / negative
  (Serbian past also drilled by gender M / F / N)
- Negation done properly: *ne čitam, nisam čitao, neću čitati, nemam* · *не читам, нема да читам, немам*
- Pick Srpski, Македонски, or Mix right on the practice screen
- Hint: Serbian infinitive, Macedonian dictionary form (3sg present)
- Tracker decodes *what kind* of mistake you made — wrong person, tense, gender,
  missing auxiliary / ќе, negation, special letters, SR↔MK mix-up, wrong verb, spelling —
  and weights practice toward what you miss (simple spaced repetition)

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Put it on your phone

Install needs HTTPS, so host it — GitHub Pages is free and easiest:

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Deploy from branch → `main` / root**.
3. Open `https://<user>.github.io/<repo>/` on the phone.
   - Android/Chrome: Settings tab → **Install on this device** (or menu → Install app).
   - iPhone/Safari: **Share → Add to Home Screen**.

Tip: add the Macedonian keyboard on your phone (Gboard / iOS both have it); the
letter bar in the app covers the special characters either way.

Progress lives in the browser's storage on that device — use **Back up progress**
in Settings now and then.

## Adding verbs

Edit [js/verbs.js](js/verbs.js) — one entry per meaning with full tables, so
everything is easy to proofread. Then run the tests, which check every entry's shape:

```sh
npm test   # needs Node 18+
```

## Layout

| File | What |
|---|---|
| `js/verbs.js` | verb data |
| `js/engine.js` | conjugation tables, answer checking, mistake decoding |
| `js/store.js` | localStorage, spaced repetition, stats |
| `js/app.js` | UI |
| `sw.js`, `manifest.webmanifest` | offline + install |
| `tools/make_icons.py` | regenerates the PNG icons |
