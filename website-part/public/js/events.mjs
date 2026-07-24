import { requestJSON } from './api_client.mjs';
import { authState } from './auth_state.mjs';
import { element, replaceChildren } from './dom.mjs';
import { withBusyControl } from './form_state.mjs';

const formatDate = value => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

function status(target, message, type = '') {
  target.textContent = message;
  target.className = `status-msg${type ? ` status-${type}` : ''}`;
}

export function eventCard(event, onChange) {
  const joined = Boolean(Number(event.joined));
  const action = element('button', {
    className: `btn btn-sm ${joined ? 'btn-outline' : 'btn-primary'}`,
    text: joined ? 'Leave' : 'Join', type: 'button',
  });
  action.addEventListener('click', async () => {
    await withBusyControl(action, async () => {
      await requestJSON(`/api/events/${event.id}/${joined ? 'leave' : 'join'}`, { method: 'POST' });
      await onChange();
    });
  });
  return element('article', { className: 'event-card' }, [
    element('div', { className: 'event-card-main' }, [
      element('div', { className: 'event-meta', text: `${event.mode} | ${formatDate(event.start_at || event.startAt)}` }),
      element('h2', { text: event.title }),
      element('p', { text: event.description || 'No additional notes.' }),
      element('div', { className: 'event-detail', text: `Server ${event.guild_name || event.guild_id || event.guildId} | Host ${event.creator_username || 'You'}` }),
    ]),
    element('div', { className: 'event-card-action' }, [
      element('strong', { text: `${event.participant_count || 0}/${event.max_players || event.maxPlayers}` }),
      action,
    ]),
  ]);
}

export async function initializeEventsPage() {
  const list = document.getElementById('eventList');
  const listStatus = document.getElementById('eventsStatus');
  const panel = document.getElementById('createEventPanel');
  const form = document.getElementById('eventForm');
  const formStatus = document.getElementById('eventFormStatus');
  const createButton = document.getElementById('showCreateEvent');
  const load = async () => {
    try {
      const data = await requestJSON('/api/events');
      const events = data.events || [];
      replaceChildren(list, events.map(item => eventCard(item, load)));
      status(listStatus, events.length ? '' : 'No upcoming events yet.');
    } catch (error) { status(listStatus, error.message, 'error'); }
  };
  const auth = await authState.load();
  createButton.hidden = auth?.user?.role !== 'admin';
  createButton.addEventListener('click', () => { panel.hidden = false; document.getElementById('eventTitle').focus(); });
  document.getElementById('cancelCreateEvent').addEventListener('click', () => { panel.hidden = true; form.reset(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    await withBusyControl(button, async () => {
      try {
        await requestJSON('/api/events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: document.getElementById('eventTitle').value,
            mode: document.getElementById('eventMode').value,
            guildId: document.getElementById('eventGuild').value,
            channelId: document.getElementById('eventChannel').value || null,
            startAt: new Date(document.getElementById('eventStart').value).toISOString(),
            maxPlayers: Number(document.getElementById('eventCapacity').value),
            description: document.getElementById('eventDescription').value,
          }),
        });
        form.reset(); panel.hidden = true; status(formStatus, ''); await load();
      } catch (error) { status(formStatus, error.message, 'error'); }
    });
  });
  await load();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initializeEventsPage);
