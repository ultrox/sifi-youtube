(() => {
  'use strict';
  const core = SifiYouTubePages;
  const continuationSelector = 'ytm-continuation-item-renderer';
  const cardSelector = 'ytm-rich-item-renderer, ytm-rich-section-renderer, ytm-video-with-context-renderer, ytm-compact-video-renderer, ytm-reel-shelf-renderer';
  const triggerStyle = { display: 'block', position: 'fixed', left: '1px', top: '50vh', width: '2px', height: '2px', opacity: '0', 'pointer-events': 'none' };
  let settings = null;
  let active = null;
  let route = null;
  let mountTimer = null;
  let mountAttempts = 0;
  const remembered = new Map();

  function getScope() { return settings && core.scope(new URL(location.href), settings); }
  function visible(node) { return !!node && !node.closest('[hidden]') && node.getClientRects().length > 0; }

  function findList(scope) {
    if (scope.kind !== 'recommendations') {
      const selected = document.querySelector(scope.kind === 'home' ? '.pivot-w2w[aria-selected="true"]' : '.pivot-subs[aria-selected="true"]');
      if (!selected) return null; // The previous SPA page may still be mounted.
      return [...document.querySelectorAll('ytm-rich-grid-renderer > .rich-grid-renderer-contents')].find(visible) || null;
    }
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (canonical && new URL(canonical, location.href).searchParams.get('v') !== new URL(location.href).searchParams.get('v')) return null;
    return [...document.querySelectorAll('ytm-item-section-renderer.scwnr-content > lazy-list')]
      .find(list => list.querySelector(':scope > ytm-video-with-context-renderer, :scope > ytm-compact-video-renderer')) || null;
  }

  function remember(controller) {
    remembered.delete(controller.scope.key);
    remembered.set(controller.scope.key, controller.departure || { page: controller.page, scroll: window.scrollY });
    if (remembered.size > 12) remembered.delete(remembered.keys().next().value);
  }

  function routeChanged() {
    const next = getScope();
    if (active && next?.key === active.scope.key && active.list.isConnected) return;
    if (active) { remember(active); active.destroy(); active = null; }
    clearTimeout(mountTimer);
    route = next;
    mountAttempts = 0;
    document.documentElement?.toggleAttribute('data-sifi-youtube-paged', !!next);
    if (next) document.documentElement?.setAttribute('data-sifi-youtube-page-kind', next.kind);
    else document.documentElement?.removeAttribute('data-sifi-youtube-page-kind');
    mountTimer = setTimeout(mount, 100);
  }

  function mount() {
    clearTimeout(mountTimer);
    if (!route || active || getScope()?.key !== route.key) return;
    const list = findList(route);
    if (list && [...list.children].some(node => node.matches(cardSelector))) {
      active = new Pager(list, route, remembered.get(route.key));
      return;
    }
    if (++mountAttempts < 50) mountTimer = setTimeout(mount, 200);
  }

  class Pager {
    constructor(list, scope, saved) {
      this.list = list;
      this.scope = scope;
      this.page = 1;
      this.cards = [];
      this.waiting = null;
      this.error = '';
      this.destroyed = false;
      this.frame = null;
      this.loadTimer = null;
      this.granted = null;
      this.view = new SifiYouTubePaginationView(scope, {
        page: number => this.go(number),
        previous: () => this.go(this.page - 1),
        next: () => this.go(this.error ? this.failedTarget || this.page : this.page + 1),
      });
      this.header = this.view.header;
      this.footer = this.view.footer;
      const barHeight = document.querySelector('ytm-pivot-bar-renderer')?.getBoundingClientRect().height || 0;
      const app = document.querySelector('ytm-app');
      const nativePadding = app ? parseFloat(getComputedStyle(app).paddingBottom) || 0 : 0;
      this.footer.style.setProperty('--sifi-page-bottom-inset', `${Math.max(0, Math.ceil(barHeight - nativePadding))}px`);
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(list, { childList: true });
      this.parentObserver = new MutationObserver(() => {
        if (!list.isConnected) routeChanged();
        else if (!this.footer.isConnected) this.schedule();
      });
      this.parentObserver.observe(list.parentElement, { childList: true });
      this.initializing = true;
      this.refresh();
      this.initializing = false;
      const target = Math.min(saved?.page || 1, core.limit(settings.pageLimit));
      this.restoreScroll = saved?.scroll;
      this.go(target, false);
    }

    schedule() {
      if (this.frame || this.destroyed) return;
      this.frame = requestAnimationFrame(() => { this.frame = null; this.refresh(); });
    }

    refresh() {
      if (this.destroyed) return;
      if (getScope()?.key !== this.scope.key) { routeChanged(); return; }
      const nextCards = [...this.list.children].filter(node => node.matches(cardSelector));
      const replaced = this.cards.length && nextCards.length && !this.cards.some(node => nextCards.includes(node));
      if (replaced) {
        // A native filter/sort replaced the feed rather than appending a batch.
        this.cancelLoad(); this.page = 1; this.restoreScroll = null; this.error = '';
      }
      this.cards = nextCards;
      const cap = core.limit(settings.pageLimit);
      this.page = Math.min(this.page, cap);
      const state = core.view(this.cards.length, this.page, cap, this.hasMore(), this.size);
      this.page = state.page;
      this.cards.forEach((card, index) => card.toggleAttribute('data-sifi-page-hidden', index < state.start || index >= state.end));
      if (!this.header.isConnected) this.list.before(this.header);
      if (!this.footer.isConnected) this.list.after(this.footer);
      this.paint();
      if (!this.initializing && (replaced || (!this.waiting && !this.error && this.page === 1 && this.cards.length < this.size && this.hasMore()))) this.go(1, false);
      else if (this.waiting) this.continueLoad();
    }

    get size() { return core.pageSize(this.scope.kind, settings); }

    continuations() { return [...this.list.children].filter(node => node.matches(continuationSelector)); }
    hasMore() { return this.continuations().length > 0; }

    paint() {
      this.view.render({
        page: this.page, size: this.size,
        state: core.view(this.cards.length, this.page, settings.pageLimit, this.hasMore(), this.size),
        hasMore: this.hasMore(), limit: core.limit(settings.pageLimit),
        waiting: this.waiting, error: this.error,
      });
    }

    go(requested, scroll = true) {
      if (this.destroyed || this.waiting) return;
      const target = Math.max(1, Math.min(requested, core.limit(settings.pageLimit)));
      this.error = '';
      this.failedTarget = target;
      const ready = this.cards.length >= target * this.size || !this.hasMore();
      if (!scroll && ready) {
        this.commit(target, scroll);
        return;
      }
      this.waiting = { page: target, scroll, notBefore: performance.now() + (scroll ? core.delay(settings.pageDelayMs) : 0) };
      this.paint();
      this.loadTimer = setTimeout(() => {
        this.cancelLoad();
        this.error = 'Couldn’t load more videos. Your current page is still here.';
        this.paint();
      }, 15000);
      if (ready) this.finishLoad();
      else this.continueLoad();
    }

    finishLoad() {
      const pending = this.waiting;
      if (!pending || pending.ready) return;
      pending.ready = true;
      clearTimeout(this.loadTimer);
      clearTimeout(this.settleTimer); this.settleTimer = null;
      this.releaseGrant();
      const finish = () => {
        if (this.destroyed || this.waiting !== pending) return;
        this.cancelLoad();
        this.commit(pending.page, pending.scroll);
      };
      const remaining = pending.notBefore - performance.now();
      if (remaining > 0) this.delayTimer = setTimeout(finish, remaining);
      else finish();
    }

    continueLoad() {
      const pending = this.waiting;
      if (!pending || pending.ready) return;
      if (this.cards.length >= pending.page * this.size) {
        this.finishLoad();
        return;
      }
      if (!this.hasMore()) {
        // A response can remove the old sentinel before mounting the new one.
        if (!this.settleTimer) this.settleTimer = setTimeout(() => {
          this.settleTimer = null;
          if (!this.waiting) return;
          if (this.hasMore()) { this.continueLoad(); return; }
          this.finishLoad();
        }, 250);
        return;
      }
      clearTimeout(this.settleTimer); this.settleTimer = null;
      const next = this.continuations()[0];
      if (this.granted !== next) {
        this.releaseGrant();
        this.granted = next;
        // YouTube fetches and renders its own continuation. Only an explicit
        // page request (or filling the first page) may reveal this tiny trigger.
        next.setAttribute('data-sifi-load-page', 'true');
        // Watch-next's visibility monitor also reacts to the element's inline
        // style. Restore only these owned properties when the request finishes.
        this.grantStyles = Object.keys(triggerStyle).map(key => [key, next.style.getPropertyValue(key), next.style.getPropertyPriority(key)]);
        for (const [key, value] of Object.entries(triggerStyle)) next.style.setProperty(key, value, 'important');
      }
    }

    releaseGrant() {
      if (!this.granted) return;
      for (const [key, value, priority] of this.grantStyles || []) {
        if (this.granted.style.getPropertyValue(key) !== triggerStyle[key]) continue;
        if (value) this.granted.style.setProperty(key, value, priority);
        else this.granted.style.removeProperty(key);
      }
      this.granted.removeAttribute('data-sifi-load-page');
      this.granted = null;
      this.grantStyles = null;
    }

    commit(target, scroll) {
      this.page = Math.min(target, Math.max(1, Math.ceil(this.cards.length / this.size)), core.limit(settings.pageLimit));
      this.refresh();
      if (scroll) {
        let inset = 8;
        for (const node of document.querySelectorAll('#player-container-id, .mobile-topbar-header, ytm-mobile-topbar-renderer')) {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          if (['fixed', 'sticky'].includes(style.position) && rect.top < 64 && rect.bottom < innerHeight * .65) inset = Math.max(inset, rect.bottom + 8);
        }
        const top = window.scrollY + this.header.getBoundingClientRect().top - inset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        this.header.focus({ preventScroll: true });
      } else if (Number.isFinite(this.restoreScroll)) {
        const top = this.restoreScroll;
        this.restoreScroll = null;
        requestAnimationFrame(() => { if (!this.destroyed) window.scrollTo({ top, behavior: 'instant' }); });
      }
    }

    cancelLoad() {
      clearTimeout(this.delayTimer);
      clearTimeout(this.loadTimer);
      clearTimeout(this.settleTimer); this.settleTimer = null;
      this.releaseGrant();
      this.waiting = null;
    }

    destroy() {
      this.destroyed = true;
      this.cancelLoad();
      cancelAnimationFrame(this.frame);
      this.observer.disconnect(); this.parentObserver.disconnect();
      this.cards.forEach(card => card.removeAttribute('data-sifi-page-hidden'));
      this.header.remove(); this.footer.remove();
    }
  }

  // Capture position before YouTube clears its list and resets scroll for a link.
  window.addEventListener('click', event => {
    const link = event.composedPath().find(node => node instanceof Element && node.matches('a[href]'));
    if (!active || !link) return;
    const destination = core.scope(new URL(link.href, location.href), settings);
    if (destination?.key !== active.scope.key) active.departure = { page: active.page, scroll: window.scrollY };
  }, true);

  window.addEventListener('sifi-youtube-settings' , event => {
    const previousSize = active?.size;
    settings = SifiYouTubeSettings.normalize(event.detail);
    if (active && getScope()?.key === active.scope.key) {
      if (previousSize !== active.size) {
        active.cancelLoad(); active.page = 1; active.error = '';
        remembered.delete(active.scope.key);
      }
      if (active.waiting?.page > core.limit(settings.pageLimit)) active.cancelLoad();
      active.refresh();
    } else routeChanged();
  });
  window.addEventListener('sifi-youtube-route', routeChanged);
  window.addEventListener('pageshow', routeChanged);
  document.addEventListener('yt-navigate-finish', routeChanged);
  document.addEventListener('DOMContentLoaded', routeChanged, { once: true });
})();
