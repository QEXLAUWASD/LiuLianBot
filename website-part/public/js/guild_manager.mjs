import { requestJSON } from './api_client.mjs';
import { element, replaceChildren } from './dom.mjs';

let selectedGuildId = null;
let currentDetail = null;
const list = document.getElementById('guildList');
const settings = document.getElementById('guildSettings');
const empty = document.getElementById('managerEmpty');
const status = document.getElementById('managerStatus');

function setStatus(message = '', error = false) {
  status.textContent = message;
  status.className = `status-msg${error ? ' status-error' : message ? ' status-success' : ''}`;
}

function channelSelect(logType, selected) {
  return element('label', { className: 'form-group log-channel-field' }, [
    element('span', { text: logType }),
    element('select', { dataset: { logType } }, [
      element('option', { text: 'Use all channel', attributes: { value: '' } }),
      ...currentDetail.channels.map(channel => element('option', {
        text: `#${channel.channel_name}`,
        attributes: { value: channel.channel_id, ...(String(selected) === channel.channel_id ? { selected: '' } : {}) },
      })),
    ]),
  ]);
}

function renderDetail(detail) {
  currentDetail = detail;
  document.getElementById('guildName').textContent = detail.guild_name;
  const language = document.getElementById('guildLanguage');
  replaceChildren(language, detail.languages.map(code => element('option', {
    text: code, attributes: { value: code, ...(code === detail.language ? { selected: '' } : {}) },
  })));
  replaceChildren(document.getElementById('logChannelFields'), detail.logTypes.map(type => channelSelect(
    type, detail.log_channels[type] || (type === 'all' ? detail.fallback_log_channel_id : null),
  )));
  empty.hidden = true;
  settings.hidden = false;
}

async function selectGuild(guildId) {
  selectedGuildId = guildId;
  setStatus();
  try {
    const data = await requestJSON(`/api/guild-manager/guilds/${encodeURIComponent(guildId)}`);
    renderDetail(data.guild);
    [...list.querySelectorAll('button')].forEach(button => { button.classList.toggle('active', button.dataset.guildId === guildId); });
  } catch (error) { setStatus(error.message, true); }
}

async function loadGuilds() {
  try {
    const data = await requestJSON('/api/guild-manager/guilds');
    const guilds = data.guilds || [];
    if (!guilds.length) {
      replaceChildren(list, [element('p', { className: 'table-subtext', text: 'No manageable servers found.' })]);
      return;
    }
    replaceChildren(list, guilds.map(guild => element('button', {
      className: 'guild-list-item', type: 'button', text: guild.guild_name,
      dataset: { guildId: guild.guild_id }, attributes: { title: guild.guild_id },
    })));
    await selectGuild(guilds[0].guild_id);
  } catch (error) { setStatus(error.message, true); replaceChildren(list, []); }
}

list.addEventListener('click', event => {
  const button = event.target.closest('[data-guild-id]');
  if (button) selectGuild(button.dataset.guildId);
});

document.getElementById('guildSettingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedGuildId) return;
  const allChannel = document.querySelector('[data-log-type="all"]')?.value;
  if (!allChannel) return setStatus('Choose a channel for all logs.', true);
  const logChannels = { all: allChannel };
  document.querySelectorAll('[data-log-type]').forEach(select => {
    if (select.dataset.logType !== 'all' && select.value) logChannels[select.dataset.logType] = select.value;
  });
  try {
    const data = await requestJSON(`/api/guild-manager/guilds/${encodeURIComponent(selectedGuildId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: document.getElementById('guildLanguage').value, log_channels: logChannels }),
    });
    renderDetail(data.guild);
    setStatus('Settings saved.');
  } catch (error) { setStatus(error.message, true); }
});

loadGuilds();
