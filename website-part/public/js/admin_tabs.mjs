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
    const loader = window[loaders[event.detail.tab.dataset.tab]];
    if (typeof loader === 'function') loader();
  });
  window.loadUsers?.();
});
