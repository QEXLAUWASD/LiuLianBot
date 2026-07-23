import { setupTabs } from './tabs.mjs';

const loaders = {
  users: 'loadUsers',
  groups: 'loadGroups',
  guilds: 'loadGuilds',
  connections: 'loadConnections',
};

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-tabs]');
  setupTabs(root);
  root?.addEventListener('tabs:change', event => {
    const tab = event.detail?.tab;
    if (event.target !== root || tab?.parentElement?.closest('[data-tabs]') !== root) return;

    const loader = window[loaders[tab.dataset.tab]];
    if (typeof loader === 'function') loader();
  });
  window.loadUsers?.();
});
