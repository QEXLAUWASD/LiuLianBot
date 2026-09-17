import { useAuth } from '../hooks/useAuth.mjs';
import { usePageVisibility } from '../hooks/usePageVisibility.mjs';
import { USER_PAGE_FALLBACK } from '../components/NavBar.jsx';

export const DASHBOARD_CARDS = Object.freeze([
  {
    href: '/roller.html',
    icon: '🎯',
    title: 'R6 Operator Roller',
    description: 'Randomly pick an operator with weapons and gadgets. Attacker or Defender mode available.',
  },
  {
    href: '/roller.html?tab=map',
    icon: '🗺️',
    title: 'R6 Map Roller',
    description: 'Randomly pick a map with game mode for your next Rainbow Six Siege match.',
  },
  {
    href: '/account.html',
    pageKey: 'account',
    icon: '👤',
    title: 'Account settings',
    description: 'Change your username or update your account password.',
  },
  {
    href: '/remote.html',
    pageKey: 'remote',
    id: 'remoteFeatureCard',
    icon: '💻',
    title: 'Remote clients',
    description: 'Open an SSH terminal or create an RDP connection file.',
  },
  {
    href: '/chromium.html',
    pageKey: 'chromium',
    icon: '🌐',
    title: 'Chromium',
    description: 'Open the authorized Chromium workspace inside the website.',
  },
  {
    href: '/vless-tunnel.html',
    pageKey: 'vless-tunnel',
    icon: '🔐',
    title: 'Interim VLESS Tunnel',
    description: 'Merge a temporary internal-network VLESS node into your existing configuration.',
  },
]);

export function DashboardPage() {
  const { status, user } = useAuth();
  const pages = usePageVisibility();
  const visibility = pages || USER_PAGE_FALLBACK;

  return (
    <main className="main-content">
      <div className="dashboard">
        <h2>
          Welcome, <span id="welcomeName">{status === 'signed-in' ? user.username : ''}</span>!
        </h2>
        <p className="dashboard-desc">
          This is the LiuLianBot web dashboard. Use the R6 Roller to randomly pick
          operators and maps.
        </p>

        <div className="feature-cards">
          {DASHBOARD_CARDS.map(card => {
            const pageKey = card.pageKey || 'roller';
            const hidden = visibility[pageKey] !== true
              || (card.pageKey === 'remote' && user?.remoteAvailable === false);
            if (hidden) return null;
            return (
              <a
                key={card.href}
                id={card.id}
                href={card.href}
                className="feature-card"
                data-page-key={pageKey}
              >
                <div className="feature-icon" aria-hidden="true">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}
