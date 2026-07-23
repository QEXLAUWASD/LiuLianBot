const initializedRoots = new WeakMap();

export function setupTabs(root) {
  if (!root) return null;
  if (initializedRoots.has(root)) return initializedRoots.get(root);

  const tabs = [...root.querySelectorAll('[role="tab"]')]
    .filter(tab => tab.closest('[data-tabs]') === root);
  if (tabs.length === 0) return null;

  const pairs = tabs.map(tab => {
    const panelId = tab.getAttribute('aria-controls');
    if (!panelId) {
      throw new Error(`setupTabs: tab ${tab.id || '(without id)'} needs aria-controls`);
    }

    const matchingPanels = [...root.querySelectorAll('[id]')]
      .filter(panel => panel.id === panelId && panel.closest('[data-tabs]') === root);
    if (matchingPanels.length !== 1) {
      throw new Error(`setupTabs: panel #${panelId} was not found inside the tabs root`);
    }
    return { tab, panel: matchingPanels[0] };
  });
  const isEnabled = tab => !tab.disabled && tab.getAttribute('aria-disabled') !== 'true';

  function activate(target, { focus = true, emit = true } = {}) {
    const pair = pairs.find(item => item.tab === target || item.tab.id === target || item.panel.id === target);
    if (!pair || !isEnabled(pair.tab)) return false;
    const changed = pair.tab.getAttribute('aria-selected') !== 'true';

    for (const item of pairs) {
      const selected = item === pair;
      item.tab.setAttribute('aria-selected', String(selected));
      item.tab.tabIndex = selected ? 0 : -1;
      item.tab.classList.toggle('active', selected);
      item.panel.hidden = !selected;
      item.panel.classList.toggle('active', selected);
    }

    if (focus) pair.tab.focus();
    if (emit && changed) {
      const CustomEvent = root.ownerDocument.defaultView?.CustomEvent;
      if (CustomEvent) {
        root.dispatchEvent(new CustomEvent('tabs:change', {
          bubbles: true,
          detail: { tab: pair.tab, panel: pair.panel },
        }));
      }
    }
    return true;
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const enabledTabs = tabs.filter(isEnabled);
      if (enabledTabs.length === 0) return;

      if (event.key === 'Home') {
        activate(enabledTabs[0]);
        return;
      }
      if (event.key === 'End') {
        activate(enabledTabs.at(-1));
        return;
      }

      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const currentIndex = tabs.indexOf(tab);
      for (let offset = 1; offset <= tabs.length; offset += 1) {
        const candidate = tabs[(currentIndex + (direction * offset) + tabs.length) % tabs.length];
        if (isEnabled(candidate)) {
          activate(candidate);
          return;
        }
      }
    });
  }

  const enabledTabs = tabs.filter(isEnabled);
  const selected = enabledTabs.filter(tab => tab.getAttribute('aria-selected') === 'true');
  const initial = selected.length === 1 ? selected[0] : enabledTabs[0];
  if (initial) activate(initial, { focus: false, emit: false });
  else {
    for (const { tab, panel } of pairs) {
      tab.setAttribute('aria-selected', 'false');
      tab.tabIndex = -1;
      tab.classList.remove('active');
      panel.hidden = true;
      panel.classList.remove('active');
    }
  }

  const controller = { activate };
  initializedRoots.set(root, controller);
  return controller;
}
