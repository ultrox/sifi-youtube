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

## Editions

Home and Subscriptions each get a stable **Morning (08:00), Afternoon (13:00),
and Evening (18:00)** edition in local time. The edition is captured on the first
visit in that window, not by a background scheduler while the browser is closed.

The complete configured number of feed items is captured up front. Regular videos
and every Short in the included shelves retain their captured order. Reloads and
new tabs replay the saved data through YouTube’s native renderers. Video playback,
menus, and the recommendations below a video continue to use YouTube normally.

An open edition stays put at the next boundary; an **Open next edition** button
appears instead of silently replacing it. Explicit Home/Subscriptions tab entries
still reset pagination to page one. Back from a video retains your place.

Edition toggles require pagination and take effect after reload. Page-size changes
repartition the existing snapshot; larger limits cannot add fresh items to it.
The next capture uses the new page-size and page-limit settings.

Snapshots are account-scoped and saved on this device in YouTube-origin IndexedDB,
with a small synchronous bootstrap in local storage to prevent first-load
reshuffling. Only the current and previous edition per feed are retained; there
is no history browser. Clearing YouTube site data removes the saved editions.
This caches feed data, not video media for offline playback. Failed captures show
an error and a reload action rather than silently reverting to a live feed.

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

- `extension/editions-core.js` — schedule, native feed schema, frozen shelves, replay tokens.
- `extension/editions-store.js` — durable snapshots, bootstrap previews, bounded retention.
- `extension/editions.js` — initial-data/fetch interception, account isolation, capture coordination.
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


Version 0.4.0 adds editions. All 46 tests passed, including capture/replay,
compressed requests, interrupted capture, empty feeds, account isolation,
concurrent tabs, storage failure, time-window transitions, and navigation defaults.
Pixel verification captured 60 items for each feed. Subscriptions retained the
same full snapshot fingerprint and Shorts links across reload and a second tab;
the cached document made zero browse requests. Home reached page six and retained
its full snapshot across tab switching. Back restored page two at 500px, and
watch recommendations retained their separate five-item pagination.

Version 0.4.1 groups subscription uploads by channel within the complete saved
edition. The first native card stays visible; a neutral disclosure reveals all
other saved uploads from that channel without fetching more videos. Channel IDs
keep similarly named creators separate. Shorts shelves and cards without channel
metadata remain independent slots. Pagination counts groups, so the same saved
video budget can occupy fewer pages. Expansion is retained when returning from a
video. Disable **Group subscription videos** in Editions settings and reload to
restore individual cards. Grouping requires subscription editions to be enabled.
The shared disclosure component lives in `extension/subscription-groups.js`.

Version 0.5.0 adds **Saved suggestions** for mobile watch pages. Each account and
video gets an independent recommendation snapshot, retained for 24 hours by
default (configurable from 1 to 168 hours). Reloads and browser restarts reuse its
native cards in the same order. An open watch session stays pinned even after
expiry; a later visit can capture a new set. There is no refresh button.

Only the `watch-next-feed` recommendation section is replaced in native data.
Player responses, comments, metadata and engagement panels stay live. The native
recommendation filter chips are omitted because they request a different set.
The existing page size and page limit bound the capture; increasing those limits
does not extend an already saved set. Caching requires recommendation pagination.

`recommendations-core.js` defines the native watch schema and local continuation
format; `recommendations-store.js` persists snapshots in a separate IndexedDB;
`recommendations.js` coordinates native data interception and capture. A local
continuation loads storage before showing suggestions, preventing a flash of
new recommendations on reload. Per-video Web Locks synchronize concurrent tabs.
Interrupted captures keep their initial seed; storage failures show an explicit
retry state instead of silently serving a new set. Expired stored sets are pruned
on writes; unexpired sets are not evicted to make room. Browser site-data clearing
also clears these snapshots. Video media is not downloaded or cached.

Version 0.5.0 passes syntax checks and 64 automated tests. These cover reloads,
separate browser contexts, expiration, open-session pinning, interrupted capture,
compressed requests, concurrent tabs and account isolation. Phone installation
and live rendering verification are pending.
