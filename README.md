# SIFI YouTube Focus

A small Chromium extension that adds stopping points to YouTube while keeping its
native videos, cards, playback controls, and navigation.

## Features

- **Lock Shorts swiping.** Watch the Short you selected; leave the viewer to choose
  another. Blocks carousel swipes, wheel input, and navigation keys while retaining
  playback taps, comments, and a persistent sound control.
- **Start in Subscriptions.** A fresh Home load opens Subscriptions. Tapping Home
  afterward still opens Home, and Back does not redirect you.
- **Open channels on Videos.** Bare channel links select the native Videos tab.
  Explicit tabs remain available.
- **Paginate mobile feeds.** Home, Subscriptions, and recommendations below the
  player share one native-style pager. Comments and channel feeds are excluded.
  Page changes use YouTube’s own loading mechanism without reloading the document.
- **Pause between pages.** A visible loading state applies even to cached pages.
  Fetching runs during the pause rather than adding a second delay afterward.

## Settings

Open **YouTube Focus settings** from the browser’s Extensions menu.
Settings are saved locally in the browser and survive restarts.

| Setting | Default | Range |
| --- | --- | --- |
| Home items per page | 10 | 1–30 |
| Subscription items per page | 10 | 1–30 |
| Recommendations per page | 5 | 1–30 |
| Page limit | 6 | 1–30 |
| Page loading delay | 900 ms | 500–10,000 ms |

Each feature and each paginated feed can be toggled independently. Native shelves
count as one feed item. The delay minimum is enforced in both settings and the
pager. Initial page mounting and browser Back restoration are not artificially
delayed. Changing a feed’s page size resets its pagination to page one.

## Install

Requires a Chromium browser with extension support. This affects the YouTube
website, not the Android YouTube app. Ordinary Chrome for Android does not provide
the required extension installation workflow.

For development, enable Developer mode in the browser’s extension manager and
load the `extension/` directory as an unpacked extension.

For the Android Titanium installer, build a signed CRX and install
`dist/sifi-youtube.crx`. A signing key is required; it is deliberately not included
in this repository. Using your own key creates a distinct extension identity.

## Development

Requires Node.js 22 or later and Python 3. No npm dependencies.

```sh
npm run check
npm test
npm run build
```

`npm run build` creates an unsigned ZIP in `dist/`.
For signed packaging, supply your own RSA private key via `SIFI_YOUTUBE_KEY`, or
place it at `.keys/youtube.pem`, then run:

```sh
npm run build:crx
```

Keep the same signing key for updates. `.keys/` and `dist/` are excluded from Git.

## Structure

- `extension/pagination-view.js` — shared pager markup, controls, and render states.
- `extension/pagination.css` — one visual definition for all three paginated feeds.
- `extension/pagination.js` — native list loading, page state, and scroll restoration.
- `extension/pagination-core.js` — page calculations and numeric limits.
- `extension/settings-model.js` — defaults and normalization.
- `extension/settings-bridge.js` — storage bridge into the page execution world.
- `extension/options.*` — settings interface.
- `extension/shorts-*` — carousel gesture lock and audio control.
- `extension/navigation.js` — initial page and channel defaults.

The Android extension loader deduplicates identical script filenames across
execution worlds, so the storage bridge keeps its normalization self-contained.
Update both normalization paths when adding settings.

## Verification and limitations

Version 0.3.5 passed syntax checks and 29 automated tests. Pixel checks covered
pagination on all three mobile surfaces, the six-page stopping point, configurable
page sizes, native navigation, and visible bottom controls. Cached navigation
measured approximately 900 ms by default; attempting a zero delay still enforced
the 500 ms minimum.

Pagination currently targets `m.youtube.com`. Desktop YouTube is matched for the
other features but has not received equivalent live UI verification. YouTube can
change its markup and gesture handling; real-device checks remain necessary.

The extension requests only the storage permission. Settings stay in
`chrome.storage.local`; no analytics or external service is added.

Version 0.3.6 resets pagination to page one on explicit Home or Subscriptions
entries, including reselecting the active feed tab. Browser Back from a video
still restores the previous page and scroll position. Pixel checks verified both
feed-switch directions, same-tab reset, and Home page-two restoration at 500px.
All 30 automated tests passed.
