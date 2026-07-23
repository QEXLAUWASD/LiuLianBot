const initializedRoots = new WeakMap();

export function setupTabs(root) {
  if (!root) return null;
  if (initializedRoots.has(root)) return initializedRoots.get(root);

  const tabs = [...root.querySelectorAll('[role="tab"]')];
  if (tabs.length === 0) return null;

  const pairs = tabs.map(tab => {
    const panelId = tab.getAttribute('aria-controls');
    if (!panelId) {
      throw new Error(`setupTabs: tab ${tab.id || '(without id)'} needs aria-controls`);
    }

    const panel = root.ownerDocument.getElementById(panelId);
    if (!panel || !root.contains(panel)) {
      throw new Error(`setupTabs: panel #${panelId} was not found inside the tabs root`);
    }
    return { tab, panel };
  });
  const enabledTabs = tabs.filter(tab => !tab.disabled && tab.getAttribute('aria-disabled') !== 'true');

  function activate(target, { focus = true, emit = true } = {}) {
    const pair = pairs.find(item => item.tab === target || item.tab.id === target || item.panel.id === target);
    if (!pair || !enabledTabs.includes(pair.tab)) return false;

    for (const item of pairs) {
      const selected = item === pair;
      item.tab.setAttribute('aria-selected', String(selected));
      item.tab.tabIndex = selected ? 0 : -1;
      item.tab.classList.toggle('active', selected);
      item.panel.hidden = !selected;
      item.panel.classList.toggle('active', selected);
    }

    if (focus) pair.tab.focus();
    if (emit) {
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
      if (enabledTabs.length === 0) return;

      const currentIndex = enabledTabs.indexOf(tab);
      let nextIndex;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = enabledTabs.length - 1;
      else {
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        nextIndex = (currentIndex + direction + enabledTabs.length) % enabledTabs.length;
      }
      activate(enabledTabs[nextIndex]);
    });
  }

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
