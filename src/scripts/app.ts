import type { SearchItem } from '../lib/search';
import { searchIndex } from '../lib/search';

const THEME_KEY = 'sr-theme';
const VIEW_KEY = 'sr-view';
const RESULT_CAP = 8;

type Theme = 'dark' | 'light';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: session-only preference */
  }
}

/* ------------------------------------------------------------------ theme */

function effectiveTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return 'dark';
}

function paintThemeControls(): void {
  const current = effectiveTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    const label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = next === 'light' ? 'Light' : 'Dark';
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    button.setAttribute('aria-pressed', String(current === 'light'));
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
  button.addEventListener('click', () => {
    const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    writeStored(THEME_KEY, next);
    paintThemeControls();
  });
}

paintThemeControls();

/* -------------------------------------------------- keyboard j / k / o nav */

function navTargets(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-nav-item]')).filter(
    (element) => element.offsetParent !== null,
  );
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  ) {
    return;
  }

  if (event.key === 'j' || event.key === 'k') {
    const items = navTargets();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    const nextIndex =
      event.key === 'j'
        ? current < 0
          ? 0
          : Math.min(current + 1, items.length - 1)
        : current <= 0
          ? 0
          : current - 1;
    const next = items[nextIndex];
    if (!next) return;
    next.focus({ preventScroll: true });
    next.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    event.preventDefault();
    return;
  }

  if (event.key === 'o') {
    const active = document.activeElement;
    if (active instanceof HTMLAnchorElement && active.matches('a[data-nav-item]')) {
      event.preventDefault();
      active.click();
    }
  }
});

/* -------------------------------------------------------- search index io */

let indexPromise: Promise<SearchItem[]> | null = null;

function loadIndex(): Promise<SearchItem[]> {
  indexPromise ??= fetch('/search-index.json')
    .then((response) => (response.ok ? response.json() : []))
    .then((data: unknown) => (Array.isArray(data) ? (data as SearchItem[]) : []))
    .catch(() => [] as SearchItem[]);
  return indexPromise;
}

function metaLine(item: SearchItem): string {
  return `${item.vertical.toUpperCase()} · ${item.date} · ${item.type} · ${item.sources} sources · ${
    item.readMinutes
  } min`;
}

function resultMarkup(item: SearchItem): HTMLLIElement {
  const meta = document.createElement('span');
  meta.className = 'sr-row__meta sr-micro';
  meta.textContent = metaLine(item);
  const title = document.createElement('span');
  title.className = 'sr-row__title';
  title.textContent = item.headline;
  const link = document.createElement('a');
  link.className = 'sr-palette__item';
  link.href = item.url;
  link.setAttribute('data-palette-item', '');
  link.append(meta, title);
  const wrapper = document.createElement('li');
  wrapper.append(link);
  return wrapper;
}

function renderResults(list: HTMLElement, items: SearchItem[]): void {
  list.replaceChildren(...items.map(resultMarkup));
}

/* ------------------------------------------------------- command palette */

const palette = document.querySelector<HTMLDialogElement>('[data-palette]');

if (palette) {
  const input = palette.querySelector<HTMLInputElement>('[data-palette-input]');
  const results = palette.querySelector<HTMLElement>('[data-palette-results]');
  const status = palette.querySelector<HTMLElement>('[data-palette-status]');

  const update = (query: string) => {
    if (!input || !results || !status) return;
    if (query.trim().length === 0) {
      results.replaceChildren();
      status.hidden = false;
      status.textContent = 'Type to search';
      return;
    }
    loadIndex().then((items) => {
      const matches = searchIndex(items, query, RESULT_CAP);
      renderResults(results, matches);
      status.hidden = matches.length > 0;
      status.textContent = matches.length === 0 ? 'No matches' : '';
      if (matches.length > 0) results.querySelector('a')?.focus({ preventScroll: true });
    });
  };

  const open = () => {
    if (!palette.open) palette.showModal();
    input?.focus();
    input?.select();
    void loadIndex();
  };

  for (const trigger of document.querySelectorAll('[data-search-open]')) {
    trigger.addEventListener('click', open);
  }

  input?.addEventListener('input', () => update(input.value));

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      const first = results?.querySelector('a');
      if (first) {
        event.preventDefault();
        first.focus();
      }
    } else if (event.key === 'Enter') {
      const first = results?.querySelector<HTMLAnchorElement>('a');
      if (first) {
        event.preventDefault();
        window.location.assign(first.href);
      }
    }
  });

  results?.addEventListener('keydown', (event) => {
    const links = Array.from(results.querySelectorAll<HTMLAnchorElement>('a[data-palette-item]'));
    if (links.length === 0) return;
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      links[Math.min(current + 1, links.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (current <= 0) input?.focus();
      else links[current - 1]?.focus();
    }
  });

  palette.addEventListener('click', (event) => {
    if (event.target === palette) palette.close();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (palette.open) palette.close();
      else open();
    }
  });
}

/* ------------------------------------------------------------ search page */

const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');

if (searchInput) {
  const results = document.querySelector<HTMLElement>('[data-search-results]');
  const count = document.querySelector<HTMLElement>('[data-search-count]');
  let timer = 0;

  const run = (query: string) => {
    loadIndex().then((items) => {
      const matches = searchIndex(items, query, 20);
      if (results) results.replaceChildren(...matches.map(resultMarkup));
      if (count) {
        count.textContent =
          query.trim().length === 0
            ? `${items.length} stories indexed`
            : `${matches.length} result${matches.length === 1 ? '' : 's'} for “${query.trim()}”`;
      }
    });
  };

  const params = new URLSearchParams(window.location.search);
  const initial = params.get('q');
  if (initial) searchInput.value = initial;

  searchInput.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => run(searchInput.value), 120);
  });

  void run(searchInput.value);
}

/* ---------------------------------------------------------- view toggles */

for (const view of document.querySelectorAll<HTMLElement>('[data-view]')) {
  const key = `${VIEW_KEY}-${view.dataset.viewKey ?? 'default'}`;
  const stored = readStored(key);
  if (stored === 'list' || stored === 'timeline') view.dataset.view = stored;

  const buttons = Array.from(view.querySelectorAll<HTMLButtonElement>('[data-view-btn]'));
  const sync = () => {
    for (const button of buttons) {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(button.dataset.viewBtn === view.dataset.view));
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const next = button.dataset.viewBtn;
      if (next !== 'list' && next !== 'timeline') return;
      view.dataset.view = next;
      writeStored(key, next);
      sync();
    });
  }

  sync();
}
