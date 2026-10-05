import { t, useLocale } from '../lib/i18n.mjs';
import { useEffect, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { formatUtc8, utc8InputToIso } from '../lib/timeZone.mjs';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';
import { useAuth } from '../hooks/useAuth.mjs';

const EMPTY_FORM = {
  title: '',
  mode: 'Custom match',
  guildId: '',
  channelId: '',
  startAt: '',
  maxPlayers: '10',
  description: '',
};

export function EventCard({ event, onChanged }) {
  useLocale();
  const joined = Boolean(Number(event.joined));
  const action = useAsyncAction();

  const toggle = () => {
    action.run(async () => {
      await requestJSON(`/api/events/${event.id}/${joined ? 'leave' : 'join'}`, { method: 'POST' });
      await onChanged();
    });
  };

  return (
    <article className="event-card">
      <div className="event-card-main">
        <div className="event-meta">
          {`${event.mode} | ${formatUtc8(event.start_at || event.startAt)}`}
        </div>
        <h2>{event.title}</h2>
        <p>{event.description || t("No additional notes.")}</p>
        <div className="event-detail">
          {t("Server {0} | Host {1}", { 0: event.guild_name || event.guild_id || event.guildId, 1: event.creator_username || t('You') })}
        </div>
      </div>
      <div className="event-card-action">
        <strong>{`${event.participant_count || 0}/${event.max_players || event.maxPlayers}`}</strong>
        <button
          type="button"
          className={`btn btn-sm ${joined ? 'btn-outline' : 'btn-primary'}`}
          disabled={action.busy}
          onClick={toggle}
        >
          {joined ? t("Leave") : t("Join")}
        </button>
      </div>
    </article>
  );
}

export function EventsPage() {
  useLocale();
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [listStatus, setListStatus] = useState({ message: 'Loading events...', tone: '' });
  const [formStatus, setFormStatus] = useState({ message: '', tone: '' });
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const createAction = useAsyncAction();
  const isAdmin = user?.role === 'admin';

  const load = async () => {
    try {
      const data = await requestJSON('/api/events');
      const items = data?.events || [];
      setEvents(items);
      setListStatus({ message: items.length ? '' : 'No upcoming events yet.', tone: '' });
    } catch (error) {
      setListStatus({ message: error.message, tone: 'error' });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = event => {
    event.preventDefault();
    createAction.run(async () => {
      try {
        await requestJSON('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            mode: form.mode,
            guildId: form.guildId,
            channelId: form.channelId || null,
            startAt: utc8InputToIso(form.startAt),
            maxPlayers: Number(form.maxPlayers),
            description: form.description,
          }),
        });
        setForm(EMPTY_FORM);
        setPanelOpen(false);
        setFormStatus({ message: '', tone: '' });
        await load();
      } catch (error) {
        setFormStatus({ message: error.message, tone: 'error' });
      }
    });
  };

  return (
    <main className="main-content events-page" id="main-content">
      <header className="page-heading">
        <div>
          <h1>{t("R6 Events")}</h1>
          <p>{t("Plan matches and keep one shared signup list with Discord.")}</p>
        </div>
        {isAdmin && (
          <button
            id="showCreateEvent"
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setPanelOpen(true);
              document.getElementById('eventTitle')?.focus();
            }}
          >{t("Create event")}</button>
        )}
      </header>

      {isAdmin && (
        <section id="createEventPanel" className="event-form-panel" hidden={!panelOpen} aria-labelledby="createEventHeading">
          <h2 id="createEventHeading">{t("Create an event")}</h2>
          <form id="eventForm" className="event-form" onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="eventTitle">{t("Title")}</label>
              <input
                id="eventTitle"
                maxLength="100"
                required
                value={form.title}
                onChange={event => setForm({ ...form, title: event.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="eventMode">{t("Mode")}</label>
              <input
                id="eventMode"
                maxLength="30"
                value={form.mode}
                onChange={event => setForm({ ...form, mode: event.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="eventGuild">{t("Discord server ID")}</label>
              <input
                id="eventGuild"
                inputMode="numeric"
                pattern="[0-9]+"
                required
                value={form.guildId}
                onChange={event => setForm({ ...form, guildId: event.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="eventChannel">{t("Reminder channel ID (optional)")}</label>
              <input
                id="eventChannel"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.channelId}
                onChange={event => setForm({ ...form, channelId: event.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="eventStart">{t("Start time (UTC+8)")}</label>
              <input
                id="eventStart"
                type="datetime-local"
                required
                value={form.startAt}
                onChange={event => setForm({ ...form, startAt: event.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="eventCapacity">{t("Players")}</label>
              <input
                id="eventCapacity"
                type="number"
                min="2"
                max="99"
                required
                value={form.maxPlayers}
                onChange={event => setForm({ ...form, maxPlayers: event.target.value })}
              />
            </div>
            <div className="form-group event-description">
              <label htmlFor="eventDescription">{t("Notes")}</label>
              <textarea
                id="eventDescription"
                maxLength="500"
                rows="3"
                value={form.description}
                onChange={event => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <StatusMessage id="eventFormStatus" message={formStatus.message} tone={formStatus.tone} />
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={createAction.busy}>{t("Create")}</button>
              <button
                id="cancelCreateEvent"
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setPanelOpen(false);
                  setForm(EMPTY_FORM);
                }}
              >{t("Cancel")}</button>
            </div>
          </form>
        </section>
      )}

      <StatusMessage id="eventsStatus" message={listStatus.message} tone={listStatus.tone} />
      <section id="eventList" className="event-list" aria-label={t("Upcoming events")}>
        {events.map(event => (
          <EventCard key={event.id} event={event} onChanged={load} />
        ))}
      </section>
    </main>
  );
}
