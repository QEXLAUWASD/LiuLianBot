import { useEffect, useState } from 'react';
import { requestJSON } from '../lib/apiClient.mjs';
import { StatusMessage } from '../components/StatusMessage.jsx';
import { useAsyncAction } from '../hooks/useAsyncAction.mjs';

const EMPTY_DETAIL = { channels: [], languages: [], logTypes: [], log_channels: {} };

export function GuildManagerPage() {
  const [guilds, setGuilds] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState({ message: '', tone: '' });
  const [form, setForm] = useState({ language: '', privateVoiceTriggerId: '', logChannels: {} });
  const saveAction = useAsyncAction();

  const loadDetail = async guildId => {
    setSelectedId(guildId);
    setStatus({ message: '', tone: '' });
    try {
      const data = await requestJSON(`/api/guild-manager/guilds/${encodeURIComponent(guildId)}`);
      const next = { ...EMPTY_DETAIL, ...data.guild, logTypes: data.logTypes || [], languages: data.languages || [] };
      setDetail(next);
      setForm({
        language: next.language || '',
        privateVoiceTriggerId: next.private_voice_trigger_channel_id ? String(next.private_voice_trigger_channel_id) : '',
        logChannels: Object.fromEntries(next.logTypes.map(type => [
          type,
          String(
            next.log_channels?.[type]
            ?? (type === 'all' ? next.fallback_log_channel_id : '')
            ?? '',
          ),
        ])),
      });
    } catch (error) {
      setStatus({ message: error.message, tone: 'error' });
    }
  };

  useEffect(() => {
    let active = true;
    requestJSON('/api/guild-manager/guilds')
      .then(data => {
        if (!active) return;
        const items = data?.guilds || [];
        setGuilds(items);
        if (items.length === 0) {
          setStatus({ message: 'No manageable servers found.', tone: '' });
          return;
        }
        loadDetail(items[0].guild_id);
      })
      .catch(error => {
        if (active) setStatus({ message: error.message, tone: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = event => {
    event.preventDefault();
    if (!selectedId) return;
    if (!form.logChannels.all) {
      setStatus({ message: 'Choose a channel for all logs.', tone: 'error' });
      return;
    }

    saveAction.run(async () => {
      try {
        const logChannels = { all: form.logChannels.all };
        for (const [type, value] of Object.entries(form.logChannels)) {
          if (type !== 'all' && value) logChannels[type] = value;
        }
        const data = await requestJSON(`/api/guild-manager/guilds/${encodeURIComponent(selectedId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: form.language,
            log_channels: logChannels,
            private_voice_trigger_channel_id: form.privateVoiceTriggerId || null,
          }),
        });
        const next = { ...detail, ...data.guild };
        setDetail(next);
        setStatus({ message: 'Settings saved.', tone: 'success' });
      } catch (error) {
        setStatus({ message: error.message, tone: 'error' });
      }
    });
  };

  const textChannels = (detail?.channels || []).filter(channel => channel.channel_type === 'text');
  const voiceChannels = (detail?.channels || []).filter(channel => channel.channel_type === 'voice');

  return (
    <main className="main-content guild-manager-page" id="main-content">
      <div className="page-heading">
        <h1>Discord Server Manager</h1>
        <p>Manage settings for Discord servers where your linked account is an owner or bot administrator.</p>
      </div>
      <StatusMessage id="managerStatus" message={status.message} tone={status.tone} />
      <section className="guild-manager-layout" aria-label="Discord server settings">
        <aside className="guild-list-panel">
          <h2>Your servers</h2>
          <div id="guildList" className="guild-list">
            {guilds.map(guild => (
              <button
                key={guild.guild_id}
                className={`guild-list-item${String(guild.guild_id) === String(selectedId) ? ' active' : ''}`}
                type="button"
                title={guild.guild_id}
                data-guild-id={guild.guild_id}
                onClick={() => loadDetail(guild.guild_id)}
              >
                {guild.guild_name}
              </button>
            ))}
          </div>
        </aside>

        {detail ? (
          <section id="guildSettings" className="guild-settings-panel">
            <h2 id="guildName">{detail.guild_name}</h2>
            <form id="guildSettingsForm" onSubmit={submit}>
              <label className="form-group" htmlFor="guildLanguage">
                {'Bot language'}
                <select
                  id="guildLanguage"
                  required
                  value={form.language}
                  onChange={event => setForm({ ...form, language: event.target.value })}
                >
                  {(detail.languages || []).map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>

              <h3>Private voice channels</h3>
              <label className="form-group" htmlFor="privateVoiceTriggerChannel">
                {'Trigger voice channel'}
                <select
                  id="privateVoiceTriggerChannel"
                  value={form.privateVoiceTriggerId}
                  onChange={event => setForm({ ...form, privateVoiceTriggerId: event.target.value })}
                >
                  <option value="">Disabled</option>
                  {voiceChannels.map(channel => (
                    <option key={channel.channel_id} value={channel.channel_id}>
                      {channel.channel_name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="table-subtext">
                When a member joins this channel, the bot creates a temporary private voice
                channel in the same category.
              </p>

              <h3>Log channels</h3>
              <div id="logChannelFields" className="log-channel-fields">
                {(detail.logTypes || []).map(logType => (
                  <label className="form-group log-channel-field" key={logType}>
                    <span>{logType}</span>
                    <select
                      data-log-type={logType}
                      value={form.logChannels[logType] ?? ''}
                      onChange={event => setForm({
                        ...form,
                        logChannels: { ...form.logChannels, [logType]: event.target.value },
                      })}
                    >
                      <option value="">Use all channel</option>
                      {textChannels.map(channel => (
                        <option key={channel.channel_id} value={channel.channel_id}>
                          {`#${channel.channel_name}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <button className="btn btn-primary" type="submit" disabled={saveAction.busy}>
                Save settings
              </button>
            </form>
          </section>
        ) : (
          <section id="managerEmpty" className="guild-settings-panel">
            <h2>Select a server</h2>
            <p>
              Your Discord account must be linked from Account settings, then have
              server-owner or bot-admin access.
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
