import { t, useLocale } from '../lib/i18n.mjs';
import { useEffect, useMemo, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { formatUtc8 } from '../lib/timeZone.mjs';
import { useAuth } from '../hooks/useAuth.mjs';
import { usePageVisibility } from '../hooks/usePageVisibility.mjs';
import { GUEST_PAGE_FALLBACK, USER_PAGE_FALLBACK } from '../components/NavBar.jsx';

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
    signedInOnly: true,
    icon: '👤',
    title: 'Account settings',
    description: 'Change your username, password or linked Discord account.',
  },
  {
    href: '/remote.html',
    pageKey: 'remote',
    signedInOnly: true,
    id: 'remoteFeatureCard',
    icon: '💻',
    title: 'Remote clients',
    description: 'Open an SSH terminal, a WebRDP desktop or generate an RDP file.',
  },
  {
    href: '/chromium.html',
    pageKey: 'chromium',
    signedInOnly: true,
    icon: '🌐',
    title: 'Chromium',
    description: 'Open the authorized Chromium workspace inside the website.',
  },
  {
    href: '/vless-tunnel.html',
    pageKey: 'vless-tunnel',
    signedInOnly: true,
    icon: '🔐',
    title: 'Interim VLESS Tunnel',
    description: 'Merge a temporary internal-network VLESS node into your configuration.',
  },
]);

const PAGE_SIZE = 5;
const PRIORITY_LIMIT = 5;
const EMPTY_EVENTS = Object.freeze([]);

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
  useLocale();
  return (
    <article className="stat-card">
      <p className="stat-label">{t(label)}</p>
      <p className="stat-value" id={id}>{value}</p>
      <p className="stat-hint">{t(hint)}</p>
    </article>
  );
}

export function DashboardPage() {
  useLocale();
  const { status, user, error: authError } = useAuth();
  const pages = usePageVisibility();
  const signedIn = status === 'signed-in';
  const visibility = pages || (signedIn ? USER_PAGE_FALLBACK : GUEST_PAGE_FALLBACK);
  const canViewEvents = signedIn && visibility.events === true;

  const [events, setEvents] = useState(null);
  const [eventsError, setEventsError] = useState('');
  const [connectionCount, setConnectionCount] = useState(null);
  const [connectionsError, setConnectionsError] = useState('');
  const [eventsAttempt, setEventsAttempt] = useState(0);
  const [connectionsAttempt, setConnectionsAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('start');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setEvents(null);
    setEventsError('');
    if (!canViewEvents) return undefined;
    const controller = new AbortController();

    requestJSON('/api/events', { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        setEvents(Array.isArray(data?.events) ? data.events : EMPTY_EVENTS);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setEventsError(error.message || 'Unable to load events');
      });

    return () => controller.abort();
  }, [canViewEvents, user?.id, eventsAttempt]);

  useEffect(() => {
    setConnectionCount(null);
    setConnectionsError('');
    if (!signedIn) return undefined;
    const controller = new AbortController();

    requestJSON('/api/connections', { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setConnectionCount((data?.connections || []).length);
      })
      .catch(error => {
        if (!controller.signal.aborted) setConnectionsError(error.message || 'Unable to load connected websites');
      });

    return () => controller.abort();
  }, [signedIn, user?.id, connectionsAttempt]);

  const tools = DASHBOARD_CARDS.filter(card => {
    const pageKey = card.pageKey || 'roller';
    return (!card.signedInOnly || signedIn)
      && visibility[pageKey] === true
      && !(card.pageKey === 'remote' && user?.remoteAvailable === false);
  });

  const eventList = canViewEvents && events ? events : EMPTY_EVENTS;
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

  const eventsLoaded = canViewEvents && events !== null;
  const count = value => (eventsLoaded ? value : '–');
  const eventsHint = !canViewEvents
    ? 'Events are not available for this account'
    : eventsError ? 'Unable to load events' : 'Loading events…';
  const hasFilters = query.trim() !== '' || statusFilter !== 'all';
  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setPage(1);
  };

  if (status === 'loading' || status === 'error') {
    return (
      <main className="main-content dashboard" id="main-content">
        <header className="page-heading dashboard-hero">
          <div>
            <p className="page-eyebrow">{t("LiuLianBot console")}</p>
            <h1>{t("Your workspace")}</h1>
            {status === 'loading' ? (
              <p className="page-heading-desc" role="status">{t("Loading your workspace…")}</p>
            ) : (
              <div className="dashboard-load-error">
                <p className="status-msg status-error" role="alert">{t("Unable to load your account. ")}{t(authError?.message)}
                </p>
                <button className="btn btn-primary" type="button" onClick={() => globalThis.location.reload()}>{t("Try again")}</button>
              </div>
            )}
          </div>
        </header>
      </main>
    );
  }

  return (
    <main className="main-content dashboard" id="main-content">
      <header className="page-heading dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="page-eyebrow">{t("Your community, connected")}</p>
          <h1>
            {signedIn ? <>{t("Welcome back, ")}<span id="welcomeName">{user.username}</span>.</> : <>{t("Good games.")}<br /><span>{t("One place.")}</span></>}
          </h1>
          <p className="page-heading-desc">
            {signedIn
              ? t("Your next match, your community and your workspace. Pick up where you left off.")
              : t("Take the guesswork out of your next Rainbow Six match. Roll an operator, discover a map and bring your squad together.")}
          </p>
          <div className="page-heading-actions">
            {visibility.roller === true && (
              <a className="btn btn-primary" href="/roller.html">{t("Roll an operator ")}<span aria-hidden="true">↗</span></a>
            )}
            {canViewEvents && <a className="btn btn-outline" href="/events.html">{t("Explore events")}</a>}
            {!signedIn && <a className="btn btn-outline" href="/login.html">{t("Sign in to your workspace")}</a>}
          </div>
        </div>
        <div className="dashboard-hero-art" aria-hidden="true">
          <div className="hero-orbit hero-orbit-outer" />
          <div className="hero-orbit hero-orbit-inner" />
          <div className="hero-crosshair" />
          <span className="hero-coordinate">{t("01 / NEXT ROUND")}</span>
          <div className="hero-die"><span /><span /><span /><span /><span /></div>
          <span className="hero-caption">{t("A different pick. A new play.")}</span>
        </div>
      </header>

      {!signedIn && (
        <section className="dashboard-welcome" aria-label={t("Your LiuLianBot workspace")}>
          <div><span className="welcome-step">01</span><h2>{t("Make your next pick")}</h2><p>{t("Explore the operator and map rollers for your next match.")}</p></div>
          <div><span className="welcome-step">02</span><h2>{t("Find your squad")}</h2><p>{t("Sign in to see community events and manage your signups.")}</p></div>
          <div><span className="welcome-step">03</span><h2>{t("Open your workspace")}</h2><p>{t("Reach the files, websites and remote tools available to your account.")}</p></div>
        </section>
      )}

      {signedIn && <>
      <section className="stat-grid" aria-label={t("Overview")}>
        <StatCard
          id="statUpcoming"
          label={t("Upcoming events")}
          value={count(eventList.length)}
          hint={eventsLoaded ? t('{count} still open for signup', { count: openCount }) : eventsHint}
        />
        <StatCard
          id="statJoined"
          label={t("Your signups")}
          value={count(joinedCount)}
          hint={eventsLoaded ? (joinedCount ? t("You are on the list") : t("Nothing joined yet")) : eventsHint}
        />
        <StatCard
          id="statWebsites"
          label={t("Connected websites")}
          value={connectionCount === null ? '–' : connectionCount}
          hint={connectionsError ? t("Unable to load connected websites") : connectionCount === null ? t("Loading websites…") : connectionCount ? t("Available under Websites") : t("No proxied websites yet")}
        />
        <StatCard
          id="statTools"
          label={t("Available tools")}
          value={tools.length}
          hint={signedIn ? t("Unlocked for this account") : t("Sign in for more")}
        />
      </section>
      {connectionsError && (
        <div className="dashboard-load-error dashboard-alert">
          <p className="status-msg status-error" role="alert">{t("Connected websites: ")}{t(connectionsError)}</p>
          <button className="btn btn-sm btn-outline" type="button" onClick={() => setConnectionsAttempt(value => value + 1)}>{t("Try again")}</button>
        </div>
      )}
      </>}

      <section className={`split-grid dashboard-grid${canViewEvents ? '' : ' dashboard-tools-only dashboard-grid-tools-only'}`}>
        {canViewEvents && (
        <article className="panel" id="priorityPanel">
          <header className="panel-head">
            <div>
              <p className="page-eyebrow">{t("On the calendar")}</p>
              <h2 className="panel-title">{t("Up next")}</h2>
              <p className="panel-hint">{t("Upcoming events, soonest first.")}</p>
            </div>
            {signedIn && visibility.events === true && (
              <a className="panel-link" href="/events.html">{t("View all")}</a>
            )}
          </header>

          {eventsError ? (
            <div className="dashboard-load-error dashboard-empty">
              <span className="empty-symbol" aria-hidden="true">!</span>
              <h3>{t("Events couldn’t be loaded")}</h3>
              <p className="status-msg status-error" role="alert">{t("Events: ")}{t(eventsError)}</p>
              <button className="btn btn-sm btn-outline" type="button" onClick={() => setEventsAttempt(value => value + 1)}>{t("Try again")}</button>
            </div>
          ) : priority.length === 0 ? (
            <div className="dashboard-empty">
              <span className="empty-symbol" aria-hidden="true">◇</span>
              <h3>{eventsLoaded ? t("Your next match starts here") : t("Checking the calendar…")}</h3>
              <p>{eventsLoaded ? t("No upcoming events yet. Check back soon for your next session.") : t("Loading events…")}</p>
              {eventsLoaded && <a className="panel-link" href="/events.html">{t("Explore events ")}<span aria-hidden="true">→</span></a>}
            </div>
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
                    <span className={`badge badge-${state.key}`}>{t(state.label)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
        )}

        <article className="panel" id="toolsPanel">
          <header className="panel-head">
            <div>
              <p className="page-eyebrow">{t("Jump right in")}</p>
              <h2 className="panel-title">{t("Your tools")}</h2>
              <p className="panel-hint">{signedIn ? t("Shortcuts to your everyday workspace.") : t("A fresh start for every round.")}</p>
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
                    <span className="tool-name">{t(tool.title)}</span>
                    <span className="tool-desc">{t(tool.description)}</span>
                  </span>
                  <span className="tool-arrow" aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
          {tools.length === 0 && <p className="panel-empty">{t("No tools are available for this account yet.")}</p>}
        </article>
      </section>

      {canViewEvents && (
      <section className="panel table-panel" aria-labelledby="eventsTableHeading" aria-busy={!eventsLoaded && !eventsError}>
        <header className="panel-head">
          <div>
            <h2 className="panel-title" id="eventsTableHeading">{t("Upcoming events")}</h2>
            <p className="panel-hint">{t("Find your next match, then manage your signup in Events.")}</p>
          </div>
          {hasFilters && (
            <button className="btn btn-sm btn-outline" type="button" onClick={clearFilters}>{t("Clear filters")}</button>
          )}
        </header>

        <div className="filter-bar">
          <label className="filter-search">
            <span className="sr-only">{t("Search events")}</span>
            <input
              id="eventSearch"
              type="search"
              placeholder={t("Search title, mode or server")}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <label className="filter-field">
            <span className="sr-only">{t("Event status")}</span>
            <select
              id="eventStatusFilter"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{value === 'open' ? t('Signup open') : t(label)}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span className="sr-only">{t("Sort events")}</span>
            <select
              id="eventSort"
              value={sort}
              onChange={event => setSort(event.target.value)}
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </select>
          </label>
        </div>

        <div
          className="data-table-wrapper"
          tabIndex="0"
          aria-label={t("Scrollable upcoming events table")}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("Event")}</th>
                <th scope="col">{t("Start (UTC+8)")}</th>
                <th scope="col">{t("Mode")}</th>
                <th scope="col">{t("Signups")}</th>
                <th scope="col">{t("Status")}</th>
              </tr>
            </thead>
            <tbody id="eventTableBody">
              {rows.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan="5">
                    {eventsError
                      ? t("Events could not be loaded. Use Try again in Up next above.")
                      : !eventsLoaded ? t("Loading events…")
                        : eventList.length === 0 ? t("No upcoming events yet. Check back soon for your next session.")
                          : t("No events match these filters. Clear the filters to see all events.")}
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
                    <td><span className={`badge badge-${state.key}`}>{t(state.label)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-foot">
          <span className="table-count" id="eventTableCount" role="status" aria-live="polite" aria-atomic="true">
            {eventsError ? t("Events unavailable") : !eventsLoaded ? t("Loading events…") : t(filteredEvents.length === 1 ? '{count} event' : '{count} events', { count: filteredEvents.length })}
          </span>
          <div className="pager">
            <button
              className="btn btn-sm btn-outline"
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(value => Math.max(1, value - 1))}
            >{t("Previous")}</button>
            <span className="pager-page" id="eventPageIndicator">{`${currentPage}/${pageCount}`}</span>
            <button
              className="btn btn-sm btn-outline"
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(value => Math.min(pageCount, value + 1))}
            >{t("Next")}</button>
          </div>
        </div>
      </section>
      )}
    </main>
  );
}
