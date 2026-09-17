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
  const signedIn = status === 'signed-in';

  return (
    <main className="main-content" id="main-content">
      <div className="dashboard">
        <section className="dashboard-hero">
          <p className="page-eyebrow">LiuLianBot console</p>
          <h2>
            Welcome, <span id="welcomeName">{signedIn ? user.username : ''}</span>!
          </h2>
          <p className="dashboard-desc">
            {signedIn
              ? 'Your home server in one place — roll Rainbow Six picks, plan events and reach the machines on your network.'
              : 'This is the LiuLianBot web dashboard. Use the R6 Roller to randomly pick operators and maps.'}
          </p>

          <div className="hero-actions">
            {visibility.roller === true && (
              <>
                <a className="btn btn-primary" href="/roller.html">Roll an operator</a>
                <a className="btn btn-outline" href="/roller.html?tab=map">Roll a map</a>
              </>
            )}
            {signedIn && visibility.account === true && (
              <a className="btn btn-outline" href="/account.html">Account settings</a>
            )}
            {!signedIn && (
              <a className="btn btn-outline" href="/login.html">Sign in</a>
            )}
          </div>
        </section>

        <h3 className="feature-heading">Tools</h3>
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
