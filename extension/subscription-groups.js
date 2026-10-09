(() => {
  // Native cards stay owned by YouTube. This component only controls visibility
  // and adds one disclosure button after each channel's first card.
  class SubscriptionGroups {
    constructor(expanded = []) {
      this.expanded = new Set(expanded);
      this.buttons = new Map();
      this.entries = [];
    }
    update(cards) {
      const entries = [], channels = new Map();
      for (const card of cards) {
        const channel = card.matches('ytm-rich-item-renderer')
          ? SifiYouTubeEditionsCore.channel({richItemRenderer:card.data}) : null;
        let entry = channel && channels.get(channel.id);
        if (!entry) {
          entry = {key:channel?.id, name:channel?.name, cards:[]};
          entries.push(entry);
          if (channel) channels.set(channel.id, entry);
        }
        entry.cards.push(card);
      }
      const used = new Set();
      for (const entry of entries) {
        if (!entry.key || entry.cards.length < 2) continue;
        used.add(entry.key);
        let button = this.buttons.get(entry.key);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'sifi-subscription-toggle';
          button.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation();
            if (this.expanded.has(entry.key)) this.expanded.delete(entry.key);
            else this.expanded.add(entry.key);
            this.paint();
          });
          this.buttons.set(entry.key, button);
        }
        entry.button = button;
        if (entry.cards[0].nextSibling !== button) entry.cards[0].after(button);
      }
      for (const [key, button] of this.buttons) if (!used.has(key)) { button.remove(); this.buttons.delete(key); }
      this.entries = entries;
      return entries;
    }
    show(start, end) {
      this.start = start; this.end = end;
      this.paint();
    }
    paint() {
      this.entries.forEach((entry, index) => {
        const visible = index >= this.start && index < this.end;
        const expanded = this.expanded.has(entry.key);
        entry.cards.forEach((card, member) => {
          card.toggleAttribute('data-sifi-page-hidden', !visible);
          card.toggleAttribute('data-sifi-group-hidden', member > 0 && !expanded);
        });
        if (entry.button) {
          entry.button.hidden = !visible;
          entry.button.setAttribute('aria-expanded', String(expanded));
          const count = entry.cards.length - 1;
          const text = expanded ? `Hide ${count} ${count === 1 ? 'video' : 'videos'} from ${entry.name}` : `${count} more from ${entry.name}`;
          if (entry.button.textContent !== text) entry.button.textContent = text;
        }
      });
    }
    destroy() {
      for (const button of this.buttons.values()) button.remove();
      for (const entry of this.entries) for (const card of entry.cards) card.removeAttribute('data-sifi-group-hidden');
      this.buttons.clear(); this.entries = [];
    }
  }
  globalThis.SifiYouTubeSubscriptionGroups = SubscriptionGroups;
})();
