import { element, replaceChildren } from './dom.mjs';

function navLink(href, text, pathname) {
  const active = pathname === href || (href === '/index.html' && pathname === '/');
  return element('a', {
    className: `nav-link${active ? ' active' : ''}`,
    text,
    attributes: {
      href,
      ...(active ? { 'aria-current': 'page' } : {}),
    },
  });
}

export function renderNavbar(target, location = globalThis.location) {
  const pathname = location?.pathname || '';
  const home = navLink('/index.html', 'Home', pathname);
  const roller = navLink('/roller.html', 'R6 Roller', pathname);
  const events = navLink('/events.html', 'Events', pathname);
  const account = navLink('/account.html', 'Account', pathname);
  const admin = navLink('/admin.html', 'Admin', pathname);
  admin.classList.add('admin-only');
  admin.dataset.adminOnly = '';
  admin.hidden = true;

  const dropdownToggle = element('button', {
    className: 'nav-link nav-dropdown-toggle',
    type: 'button',
    attributes: {
      'aria-expanded': 'false',
      'aria-controls': 'websiteDropdownMenu',
    },
  }, [
    element('span', { text: 'Connected websites' }),
    element('span', { className: 'dropdown-chevron', text: '▾', attributes: { 'aria-hidden': 'true' } }),
  ]);
  const dropdownMenu = element('div', {
    className: 'nav-dropdown-menu',
    attributes: { id: 'websiteDropdownMenu', role: 'menu' },
  }, [element('div', { className: 'nav-dropdown-status', text: 'Loading...' })]);
  dropdownMenu.hidden = true;
  const dropdown = element('div', {
    className: 'nav-dropdown',
    attributes: { id: 'websiteDropdown' },
  }, [dropdownToggle, dropdownMenu]);
  dropdown.hidden = true;

  const username = element('a', {
    className: 'nav-username',
    attributes: { id: 'navUsername', href: '/account.html', title: 'Account settings' },
  });
  username.hidden = true;
  const login = element('a', {
    className: 'btn btn-sm btn-primary',
    text: 'Login',
    attributes: { href: '/login.html' },
  });
  login.hidden = true;
  const logout = element('button', {
    className: 'btn btn-sm btn-outline',
    text: 'Logout',
    type: 'button',
    dataset: { logout: '' },
    attributes: { id: 'logoutBtn' },
  });
  logout.hidden = true;
  const status = element('span', {
    className: 'nav-auth-status',
    text: 'Loading account...',
    attributes: {
      id: 'logoutStatus',
      role: 'status',
      'aria-live': 'polite',
    },
  });
  const user = element('div', { className: 'nav-user', attributes: { id: 'navUser' } }, [
    username,
    login,
    logout,
    status,
  ]);

  replaceChildren(target, [
    element('div', { className: 'nav-brand', text: '🎮 LiuLianBot' }),
    element('div', { className: 'nav-links' }, [home, roller, events, dropdown, account, admin]),
    user,
  ]);

  return {
    account,
    admin,
    dropdown,
    dropdownMenu,
    dropdownToggle,
    events,
    login,
    logout,
    roller,
    status,
    user,
    username,
  };
}
