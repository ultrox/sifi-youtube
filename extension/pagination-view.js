(() => {
  'use strict';
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  class PaginationView {
    constructor(scope, actions) {
      this.scope = scope;
      this.actions = actions;
      this.header = element('div', 'sifi-page-heading');
      this.header.tabIndex = -1;
      this.edition = element('div', 'sifi-edition-heading');
      this.editionLabel = element('strong', 'sifi-edition-label');
      this.editionDetail = element('span', 'sifi-edition-detail');
      this.editionNext = this.button('Open next edition', () => globalThis.SifiYouTubeEditions?.openNext(this.scope.kind));
      this.editionNext.classList.add('sifi-edition-next');
      this.edition.append(this.editionLabel, this.editionDetail, this.editionNext);
      this.pageHeading = element('div', 'sifi-page-description');
      this.header.append(this.edition, this.pageHeading);
      this.footer = element('nav', 'sifi-page-footer');
      this.footer.setAttribute('aria-label', `${scope.label} pages`);
      this.caption = element('div', 'sifi-page-caption');
      this.caption.id = `sifi-page-caption-${scope.kind}`;
      this.numbers = element('div', 'sifi-page-numbers');
      this.controls = element('div', 'sifi-page-controls');
      this.previous = this.button('Previous', actions.previous);
      this.next = this.button('Next', actions.next);
      this.controls.append(this.previous, this.next);
      this.status = element('p', 'sifi-page-status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.footer.append(this.caption, this.numbers, this.controls, this.status);
    }

    button(text, action) {
      const button = element('button', 'sifi-page-button', text);
      button.type = 'button';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action(); });
      return button;
    }

    render({ page, size, state, hasMore, limit, waiting, error, edition }) {
      const busy = !!waiting;
      // Mobile YouTube does not expose the desktop theme variables. Follow its
      // actual text color, including a site theme that differs from the OS.
      const channels = getComputedStyle(document.documentElement).color.match(/\d+/g) || ['0'];
      const dark = channels.slice(0, 3).reduce((sum, value) => sum + Number(value), 0) / 3 > 150;
      this.footer.style.colorScheme = dark ? 'dark' : 'light';
      this.edition.hidden = !edition;
      if (edition) {
        this.editionLabel.textContent = edition.label;
        this.editionDetail.textContent = edition.detail;
        this.editionNext.hidden = !edition.available;
      }
      this.pageHeading.textContent = `${this.scope.label} · Page ${page} · ${size} ${edition?.grouped ? 'groups' : 'items'} per page`;
      this.caption.textContent = `Page ${page} of ${state.pages}${!edition && hasMore && state.total < limit * size ? ' max' : ''}`;
      this.footer.setAttribute('aria-busy', String(busy));
      const signature = `${page}:${state.pages}:${busy}`;
      if (signature !== this.numberSignature) {
        this.numberSignature = signature;
        this.numbers.replaceChildren(...SifiYouTubePages.numbers(page, state.pages).map(number => {
          if (number === '…') return element('span', 'sifi-page-ellipsis', '…');
          const button = this.button(String(number), () => this.actions.page(number));
          button.disabled = busy || number === page;
          button.setAttribute('aria-label', `Page ${number}`);
          if (number === page) button.setAttribute('aria-current', 'page');
          return button;
        }));
      }
      this.previous.disabled = busy || !state.previous;
      this.next.disabled = busy || (!state.next && !error);
      this.next.textContent = edition?.error ? (edition.recommendations ? 'Reload suggestions' : 'Reload edition') : error ? 'Try again' : busy ? 'Loading…' : 'Next';
      const message = error || (busy ? `Loading page ${waiting.page}…` : edition && !state.next ? (edition.recommendations ? 'You’ve reached the end of these suggestions.' : 'You’re caught up with this edition.') : state.atLimit
        ? `You’ve reached your ${limit}-page limit.`
        : !state.next ? 'You’ve reached the end.'
          : `${state.end - state.start} ${edition?.grouped ? 'groups' : 'items'} on this page`);
      if (this.status.textContent !== message) this.status.textContent = message;
      this.footer.toggleAttribute('data-sifi-page-end', !state.next && !busy);
    }

  }
  globalThis.SifiYouTubePaginationView = PaginationView;
})();
