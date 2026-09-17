import { useEffect, useMemo, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { formatUtc8 } from '../lib/timeZone.mjs';
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
    description: 'Change your username, password or linked Discord account.',
  },
  {
    href: '/remote.html',
    pageKey: 'remote',
    id: 'remoteFeatureCard',
    icon: '💻',
    title: 'Remote clients',
    description: 'Open an SSH terminal, a WebRDP desktop or generate an RDP file.',
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
    description: 'Merge a temporary internal-network VLESS node into your configuration.',
  },
]);

const PAGE_SIZE = 5;
const PRIORITY_LIMIT = 5;

const STATUS_LABELS = {
  all: 'All statuses',
  joined: 'Joined',
  open: 'Open',
  full: 'Full',
};

const SORT_LABELS = {
  start: 'Sort: start time',
  signups: 'Sort: signups',
};

export function eventStartTime(event) {
  const value = event?.start_at || event?.startAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function eventCapacity(event) {
  return Number(event?.participant_count || 0);
}

export function eventStatus(event) {
  if (Number(event?.joined)) {
    return { key: 'joined', label: 'Joined' };
  }
  const max = Number(event?.max_players || event?.maxPlayers || 0);
  if (max > 0 && eventCapacity(event) >= max) {
    return { key: 'full', label: 'Full' };
  }
  return { key: 'open', label: 'Signup open' };
}

export function eventStartLabel(event) {
  const value = event?.start_at || event?.startAt;
  return value ? formatUtc8(value) : '—';
}

function StatCard({ label, value, hint, id }) {
  return (
    <article className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value" id={id}>{value}</p>
      <p className="stat-hint">{hint}</p>
    </article>
  );
}

export function DashboardPage() {
  const { status, user } = useAuth();
  const pages = usePageVisibility();
  const visibility = pages || USER_PAGE_FALLBACK;
  const signedIn = status === 'signed-in';

  const [events, setEvents] = useState(null);
  const [eventsError, setEventsError] = useState('');
  const [connectionCount, setConnectionCount] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('start');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;

    requestJSON('/api/events')
      .then(data => {
        if (!active) return;
        setEvents(data?.events || []);
        setEventsError('');
      })
      .catch(error => {
        if (!active) return;
        setEvents([]);
        setEventsError(error.message || 'Unable to load events');
      });

    requestJSON('/api/connections')
      .then(data => {
        if (active) setConnectionCount((data?.connections || []).length);
      })
      .catch(() => {
        if (active) setConnectionCount(0);
      });

    return () => {
      active = false;
    };
  }, [signedIn]);

  const tools = DASHBOARD_CARDS.filter(card => {
    const pageKey = card.pageKey || 'roller';
    return visibility[pageKey] === true
      && !(card.pageKey === 'remote' && user?.remoteAvailable === false);
  });

  const eventList = events || [];
  const joinedCount = eventList.filter(event => Boolean(Number(event.joined))).length;
  const openCount = eventList.filter(event => eventStatus(event).key === 'open').length;

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return eventList
      .filter(event => (statusFilter === 'all' ? true : eventStatus(event).key === statusFilter))
      .filter(event => {
        if (!needle) return true;
        return [event.title, event.mode, event.guild_name, event.guild_id]
          .some(value => String(value || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => (
        sort === 'signups'
          ? eventCapacity(b) - eventCapacity(a) || eventStartTime(a) - eventStartTime(b)
          : eventStartTime(a) - eventStartTime(b)
      ));
  }, [eventList, query, statusFilter, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const priority = useMemo(
    () => [...eventList].sort((a, b) => eventStartTime(a) - eventStartTime(b)).slice(0, PRIORITY_LIMIT),
    [eventList],
  );

  const eventsLoaded = events !== null;
  const count = value => (eventsLoaded ? value : '–');

  return (
    <main className="main-content dashboard" id="main-content">
      <header className="page-heading">
        <div>
          <p className="page-eyebrow">LiuLianBot console</p>
          <h1>
            Welcome, <span id="welcomeName">{signedIn ? user.username : ''}</span>
          </h1>
          <p className="page-heading-desc">
            {signedIn
              ? 'Your home server in one place — roll Rainbow Six picks, plan events and reach the machines on your network.'
              : 'This is the LiuLianBot web dashboard. Use the R6 Roller to randomly pick operators and maps.'}
          </p>
        </div>
        <div className="page-heading-actions">
          {visibility.roller === true && (
            <a className="btn btn-primary" href="/roller.html">Roll an operator</a>
          )}
          {signedIn && visibility.events === true && (
            <a className="btn btn-outline" href="/events.html">Plan an event</a>
          )}
        </div>
      </header>

      <section className="stat-grid" aria-label="Overview">
        <StatCard
          id="statUpcoming"
          label="Upcoming events"
          value={count(eventList.length)}
          hint={eventsLoaded ? `${openCount} still open for signup` : 'Loading events…'}
        />
        <StatCard
          id="statJoined"
          label="Your signups"
          value={count(joinedCount)}
          hint={joinedCount ? 'You are on the list' : 'Nothing joined yet'}
        />
        <StatCard
          id="statWebsites"
          label="Connected websites"
          value={connectionCount === null ? '–' : connectionCount}
          hint={connectionCount ? 'Available under Websites' : 'No proxied websites yet'}
        />
        <StatCard
          id="statTools"
          label="Available tools"
          value={tools.length}
          hint={signedIn ? 'Unlocked for this account' : 'Sign in for more'}
        />
      </section>

      <section className="split-grid">
        <article className="panel" id="priorityPanel">
          <header className="panel-head">
            <div>
              <h2 className="panel-title">Priority</h2>
              <p className="panel-hint">Upcoming events, soonest first.</p>
            </div>
            {signedIn && visibility.events === true && (
              <a className="panel-link" href="/events.html">View all</a>
            )}
          </header>

          {priority.length === 0 ? (
            <p className="panel-empty">
              {eventsLoaded ? 'No upcoming events yet.' : 'Loading events…'}
            </p>
          ) : (
            <ul className="list-rows" id="priorityList">
              {priority.map(event => {
                const state = eventStatus(event);
                return (
                  <li className="list-row" key={event.id}>
                    <div className="list-row-main">
                      <p className="list-title">{event.title}</p>
                      <p className="list-meta">
                        {`${event.mode || 'Match'} · ${eventStartLabel(event)}`}
                      </p>
                    </div>
                    <span className={`badge badge-${state.key}`}>{state.label}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {eventsError && (
            <p className="status-msg status-error" role="alert">{eventsError}</p>
          )}
        </article>

        <article className="panel" id="toolsPanel">
          <header className="panel-head">
            <div>
              <h2 className="panel-title">Tools</h2>
              <p className="panel-hint">Everything this account can open.</p>
            </div>
          </header>

          <ul className="tool-list">
            {tools.map(tool => (
              <li key={tool.href}>
                <a
                  className="tool-row"
                  id={tool.id}
                  href={tool.href}
                  data-page-key={tool.pageKey || 'roller'}
                >
                  <span className="tool-icon" aria-hidden="true">{tool.icon}</span>
                  <span className="tool-text">
                    <span className="tool-name">{tool.title}</span>
                    <span className="tool-desc">{tool.description}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="panel table-panel" aria-labelledby="eventsTableHeading">
        <h2 className="sr-only" id="eventsTableHeading">Upcoming events</h2>

        <div className="filter-bar">
          <label className="filter-search">
            <span className="sr-only">Search events</span>
            <input
              id="eventSearch"
              type="search"
              placeholder="Search title, mode or server"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <label className="filter-field">
            <span className="sr-only">Event status</span>
            <select
              id="eventStatusFilter"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span className="sr-only">Sort events</span>
            <select
              id="eventSort"
              value={sort}
              onChange={event => setSort(event.target.value)}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Start (UTC+8)</th>
                <th scope="col">Mode</th>
                <th scope="col">Signups</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody id="eventTableBody">
              {rows.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan="5">
                    {eventsLoaded ? 'No events match these filters.' : 'Loading events…'}
                  </td>
                </tr>
              ) : rows.map(event => {
                const state = eventStatus(event);
                const max = event.max_players || event.maxPlayers || '—';
                return (
                  <tr key={event.id}>
                    <td>
                      <span className="table-title">{event.title}</span>
                      <span className="table-sub">{event.guild_name || event.guild_id || '—'}</span>
                    </td>
                    <td className="table-nowrap">{eventStartLabel(event)}</td>
                    <td>{event.mode || '—'}</td>
                    <td className="table-nowrap">{`${eventCapacity(event)}/${max}`}</td>
                    <td><span className={`badge badge-${state.key}`}>{state.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-foot">
          <span className="table-count" id="eventTableCount">
            {`${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'}`}
          </span>
          <div className="pager">
            <button
              className="btn btn-sm btn-outline"
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(value => Math.max(1, value - 1))}
            >
              Previous
            </button>
            <span className="pager-page" id="eventPageIndicator">{`${currentPage}/${pageCount}`}</span>
            <button
              className="btn btn-sm btn-outline"
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(value => Math.min(pageCount, value + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
