(() => {
  'use strict';
  let enabled = true;
  let button = null;
  let scheduled = false;

  function currentVideo() {
    if (!enabled || !/^\/shorts\/[^/]+\/?$/.test(location.pathname)) return null;
    return document.querySelector('ytd-reel-video-renderer[is-active] video, #movie_player video');
  }

  function render() {
    scheduled = false;
    const video = currentVideo();
    if (!video || !document.body) { button?.remove(); return; }
    if (!button) {
      button = document.createElement('button');
      button.id = 'sifi-youtube-sound';
      button.type = 'button';
      button.addEventListener('click', toggleSound);
    }
    const muted = video.muted || video.volume === 0;
    button.textContent = muted ? 'Sound off' : 'Sound on';
    button.setAttribute('aria-label', muted ? 'Unmute this Short' : 'Mute this Short');
    button.setAttribute('aria-pressed', String(!muted));
    button.dataset.muted = String(muted);
    if (!button.isConnected) document.body.appendChild(button);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function toggleSound(event) {
    const video = currentVideo();
    if (!video) return;
    // Keep the gesture local: it must not pause the player or navigate the feed.
    event.preventDefault();
    event.stopPropagation();
    const player = video.closest('.html5-video-player');
    const muted = video.muted || video.volume === 0;
    // Use YouTube's API so its own controls/settings agree with the media state.
    // The media fallback also works when YouTube replaces its player wrapper.
    if (muted) {
      if (video.volume === 0) {
        player?.setVolume?.(100);
        video.volume = 1;
      }
      player?.unMute?.();
      video.muted = false;
    } else {
      player?.mute?.();
      video.muted = true;
    }
    // Do not call play(): changing sound must preserve a deliberate pause.
    render();
  }

  window.addEventListener('sifi-youtube-settings', event => {
    enabled = event.detail?.shortsLock !== false;
    schedule();
  });
  window.addEventListener('sifi-youtube-route', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  for (const type of ['loadedmetadata', 'play', 'volumechange', 'emptied']) {
    document.addEventListener(type, schedule, true);
  }
  // Media and route events keep this current without polling or observing feeds.
  schedule();
})();
