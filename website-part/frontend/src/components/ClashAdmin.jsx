import { useEffect, useState } from 'react';
import { requestJSON, sendJSON } from '../lib/apiClient.mjs';
import { formatUtc8, utc8InputToIso } from '../lib/timeZone.mjs';
import { t, useLocale } from '../lib/i18n.mjs';

const blankServer = () => ({ name: '', enabled: true, management_profile: '', proxy_yaml: 'type: vless\nserver: vpn.example.com\nport: 443\nuuid: 00000000-0000-0000-0000-000000000000\ntls: true\nudp: true\n' });
const customExample = 'rules:\n  - DOMAIN-SUFFIX,example.com,DIRECT\n  - MATCH,VPN\n';
const blankSubscription = () => ({ user_id: '', username: '', ruleset_id: 'all-vpn', custom_rules_yaml: '', enabled: true, expires_at: '', server_ids: [] });
const dateInput = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 19);

export function ClashAdmin({ askConfirm }) {
  useLocale();
  const [data, setData] = useState(null);
  const [server, setServer] = useState(blankServer);
  const [subscription, setSubscription] = useState(blankSubscription);
  const [serverEditor, setServerEditor] = useState(false);
  const [userEditor, setUserEditor] = useState(false);
  const [editingUser, setEditingUser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => {
    const [servers, subscriptions, profiles, sync, rulesets] = await Promise.all([
      requestJSON('/api/admin/clash/servers'), requestJSON('/api/admin/clash/subscriptions'),
      requestJSON('/api/admin/clash/profiles'), requestJSON('/api/admin/clash/sync-status'), requestJSON('/api/admin/clash/rulesets'),
    ]);
    setData({ servers: servers.servers, subscriptions: subscriptions.subscriptions, profiles: profiles.profiles, sync: sync.servers, rulesets: rulesets.rulesets });
  };
  useEffect(() => { load().catch(err => setError(err.message)); }, []);
  const run = async action => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); setNotice('Changes saved. SSH accounts synchronize in the background; use Refresh to check results.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const selectUser = user_id => {
    const current = data.subscriptions.find(item => item.user_id === user_id);
    setUserEditor(true); setEditingUser(Boolean(current));
    setSubscription(current ? { ...current, ruleset_id: current.ruleset_id ?? 'all-vpn', custom_rules_yaml: current.custom_rules_yaml || '', expires_at: dateInput(current.expires_at) } : { ...blankSubscription(), user_id });
  };
  return <section>
    <h2>{t('Clash subscriptions')}</h2>
    <p>{t('Manage VPN servers and per-user access. Changes are published automatically at /clash-sub-public/.')}</p>
    <p>{t('SSH-managed nodes use individual credentials and revoke expired users automatically. Unmanaged nodes only restrict subscription downloads.')}</p>
    {error && <p role="alert" className="status-error">{t(error)}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    <button className="btn btn-outline" type="button" disabled={busy} onClick={() => run(async () => {})}>{t('Refresh')}</button>
    {!data ? <button className="btn btn-outline" type="button" onClick={() => run(async () => {})}>{t('Reload')}</button> : <>
      <section className="clash-management-section" aria-labelledby="clash-servers-title">
      <div className="clash-list-header"><h3 id="clash-servers-title">{t('Server list / status')}</h3><div className="clash-actions">
        <button className="btn btn-outline" type="button" disabled={busy} onClick={() => run(() => requestJSON('/api/admin/clash/sync', { method: 'POST' }))}>{t('Sync now')}</button>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => { setServer(blankServer()); setServerEditor(true); }}>{t('Add VPN server')}</button>
      </div></div>
      <div className="admin-table-wrapper"><table className="admin-table"><thead><tr><th>{t('Name')}</th><th>{t('Status')}</th><th>{t('Last sync')}</th><th>{t('Details')}</th><th>{t('Actions')}</th></tr></thead>
        <tbody>{!data.servers.length && <tr><td colSpan={5}>{t('No VPN servers yet')}</td></tr>}{data.servers.map(item => { const sync = data.sync.find(status => status.id === item.id); return <tr key={item.id}><td>{item.name}</td><td>{t(item.enabled ? 'Enabled' : 'Disabled')} / {t(sync?.sync_status || item.sync_status || 'unmanaged')}</td><td>{sync?.synced_at ? formatUtc8(sync.synced_at) : '—'}</td><td>{sync?.sync_error || '—'}</td><td><div className="clash-actions">
          <button className="btn btn-sm btn-outline" type="button" disabled={busy} onClick={() => { setServer(item); setServerEditor(true); }}>{t('Edit')}</button>{' '}
          <button className="btn btn-sm btn-danger" type="button" disabled={busy} onClick={() => askConfirm('Delete VPN server', 'Delete this VPN server and remove it from all subscriptions?', () => run(async () => {
            await requestJSON(`/api/admin/clash/servers/${item.id}`, { method: 'DELETE' });
            if (server.id === item.id) { setServer(blankServer()); setServerEditor(false); }
            setSubscription(current => ({ ...current, server_ids: current.server_ids.filter(id => id !== item.id) }));
          }))}>{t('Delete')}</button>
        </div></td></tr>; })}</tbody></table></div>
      {serverEditor && <form className="clash-editor" onSubmit={event => { event.preventDefault(); run(async () => {
        await sendJSON(server.id ? `/api/admin/clash/servers/${server.id}` : '/api/admin/clash/servers', server, { method: server.id ? 'PUT' : 'POST' });
        setServer(blankServer()); setServerEditor(false);
      }); }}><fieldset disabled={busy}>
        <legend>{t(server.id ? 'Edit VPN server' : 'Add VPN server')}</legend>
        <div className="form-group"><label htmlFor="vpn-name">{t('Name')}</label><input id="vpn-name" required maxLength={100} value={server.name} onChange={event => setServer({ ...server, name: event.target.value })} /></div>
        <div className="form-group"><label htmlFor="vpn-yaml">{t('Clash proxy YAML (one node, without name)')}</label><textarea id="vpn-yaml" rows={10} required maxLength={16000} value={server.proxy_yaml} onChange={event => setServer({ ...server, proxy_yaml: event.target.value })} /></div>
        <div className="form-group"><label htmlFor="vpn-profile">{t('SSH management profile')}</label><select id="vpn-profile" value={server.management_profile || ''} disabled={Boolean(server.id && server.management_profile)} onChange={event => setServer({ ...server, management_profile: event.target.value })}><option value="">{t('Unmanaged (subscription download only)')}</option>{[...new Set([...data.profiles, ...(server.management_profile ? [server.management_profile] : [])])].map(name => <option key={name} value={name}>{name}</option>)}</select></div>
        <label><input type="checkbox" checked={server.enabled} onChange={event => setServer({ ...server, enabled: event.target.checked })} /> {t('Enabled')}</label>
        <p><button className="btn btn-primary" type="submit">{t('Save')}</button>{' '}<button className="btn btn-outline" type="button" onClick={() => { setServer(blankServer()); setServerEditor(false); }}>{t('Cancel')}</button></p>
      </fieldset></form>}
      <p>{t('Service restarts apply account changes and may briefly disconnect other users. Configure the VPS expiry timer before enabling SSH management.')}</p>
      {data.sync.some(item => item.deleted_at) && <details><summary>{t('Pending server removals')}</summary><ul>{data.sync.filter(item => item.deleted_at).map(item => <li key={item.id}>{item.name}: {t(item.sync_status)} {item.sync_error || ''}</li>)}</ul></details>}
      </section>
      <section className="clash-management-section" aria-labelledby="clash-users-title">
      <div className="clash-list-header"><h3 id="clash-users-title">{t('VPN users')}</h3><button className="btn btn-primary" type="button" disabled={busy} onClick={() => { setSubscription(blankSubscription()); setEditingUser(false); setUserEditor(true); }}>{t('Add VPN user')}</button></div>
      <p>{t('VPN users are managed independently. Enter a name to create a VPN subscription.')}</p>
      <div className="admin-table-wrapper"><table className="admin-table"><thead><tr><th>{t('VPN username')}</th><th>{t('Expires at (UTC+8)')}</th><th>{t('Status')}</th><th>{t('Allowed VPN servers')}</th><th>{t('Rule set')}</th><th>{t('Subscription URL')}</th><th>{t('Actions')}</th></tr></thead>
        <tbody>{!data.subscriptions.length && <tr><td colSpan={7}>{t('No VPN users yet')}</td></tr>}{data.subscriptions.map(item => <tr key={item.user_id}><td>{item.username}</td><td>{formatUtc8(item.expires_at)}</td><td>{t(!item.enabled ? 'Disabled' : Date.parse(item.expires_at) <= Date.now() ? 'Expired' : 'Enabled')}</td>
          <td>{item.server_ids.map(id => data.servers.find(server => Number(server.id) === Number(id))?.name).filter(Boolean).join(', ') || '—'}</td><td>{t(data.rulesets.find(ruleset => ruleset.id === (item.ruleset_id ?? 'all-vpn'))?.name || item.ruleset_id)}</td><td><input aria-label={`${t('Subscription URL')} ${item.username}`} readOnly value={`${globalThis.location.origin}${item.path}`} onFocus={event => event.target.select()} /></td>
          <td><div className="clash-actions"><button className="btn btn-sm btn-outline" type="button" disabled={busy} onClick={() => selectUser(item.user_id)}>{t('Edit')}</button>{' '}
            <button className="btn btn-sm btn-danger" type="button" disabled={busy} onClick={() => askConfirm('Remove VPN user', 'Remove this VPN subscription and revoke managed VPN access?', () => run(async () => {
              await requestJSON(`/api/admin/clash/subscriptions/${encodeURIComponent(item.user_id)}`, { method: 'DELETE' });
              if (subscription.user_id === item.user_id) { setSubscription(blankSubscription()); setUserEditor(false); }
            }))}>{t('Remove')}</button>
          </div></td></tr>)}</tbody></table></div>
      {userEditor && <form className="clash-editor" onSubmit={event => { event.preventDefault(); run(async () => {
        await sendJSON(editingUser ? `/api/admin/clash/subscriptions/${encodeURIComponent(subscription.user_id)}` : '/api/admin/clash/subscriptions', { username: subscription.username, ruleset_id: subscription.ruleset_id, ...(subscription.ruleset_id === 'custom' ? { custom_rules_yaml: subscription.custom_rules_yaml } : {}), enabled: subscription.enabled, expires_at: utc8InputToIso(subscription.expires_at), server_ids: subscription.server_ids }, { method: editingUser ? 'PUT' : 'POST' });
        setSubscription(blankSubscription()); setUserEditor(false);
      }); }}><fieldset disabled={busy}>
        <legend>{t(editingUser ? 'Edit VPN user' : 'Add VPN user')}</legend>
        <div className="form-group"><label htmlFor="vpn-user">{t('VPN username')}</label><input id="vpn-user" required maxLength={100} value={subscription.username} onChange={event => setSubscription({ ...subscription, username: event.target.value })} /></div>
        <div className="form-group"><label htmlFor="vpn-expiry">{t('Expires at (UTC+8)')}</label><input id="vpn-expiry" type="datetime-local" step="1" required value={subscription.expires_at} onChange={event => setSubscription({ ...subscription, expires_at: event.target.value })} /></div>
        <div className="form-group"><label htmlFor="vpn-ruleset">{t('Rule set')}</label><select id="vpn-ruleset" value={subscription.ruleset_id} onChange={event => setSubscription({ ...subscription, ruleset_id: event.target.value, custom_rules_yaml: event.target.value === 'custom' ? subscription.custom_rules_yaml || customExample : subscription.custom_rules_yaml })}>{data.rulesets.map(ruleset => <option key={ruleset.id} value={ruleset.id}>{t(ruleset.name)}</option>)}</select>
          <p>{t(data.rulesets.find(ruleset => ruleset.id === subscription.ruleset_id)?.description)}</p>
        </div>
        {subscription.ruleset_id === 'custom' && <div className="form-group"><label htmlFor="vpn-custom-rules">{t('Custom routing YAML')}</label><textarea id="vpn-custom-rules" rows={12} required maxLength={32000} value={subscription.custom_rules_yaml} onChange={event => setSubscription({ ...subscription, custom_rules_yaml: event.target.value })} />
          <p>{t('Use rules and optional rule-providers. Policies: VPN, DIRECT or REJECT. A missing final MATCH defaults to VPN. Provider URLs must use HTTPS.')}</p>
          <details><summary>{t('Supported rule types')}</summary><p>DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD, IP-CIDR, IP-CIDR6, SRC-IP-CIDR, GEOIP, GEOSITE, RULE-SET, DST-PORT, SRC-PORT, NETWORK, PROCESS-NAME, PROCESS-PATH, MATCH</p></details>
          <a href="https://wiki.metacubex.one/config/rules/" target="_blank" rel="noreferrer">{t('Rule syntax')}</a>
        </div>}
        <label><input type="checkbox" checked={subscription.enabled} onChange={event => setSubscription({ ...subscription, enabled: event.target.checked })} /> {t('Enabled')}</label>
        <p>{t('Allowed VPN servers')}</p>
        {data.servers.map(item => <label className="access-option" key={item.id}><input type="checkbox" checked={subscription.server_ids.includes(Number(item.id))} onChange={event => setSubscription({ ...subscription, server_ids: event.target.checked ? [...subscription.server_ids, Number(item.id)] : subscription.server_ids.filter(id => id !== Number(item.id)) })} /> {item.name} {!item.enabled && `(${t('Disabled')})`}</label>)}
        <p className="clash-actions"><button className="btn btn-primary" type="submit">{t('Save subscription')}</button><button className="btn btn-outline" type="button" onClick={() => { setSubscription(blankSubscription()); setUserEditor(false); }}>{t('Cancel')}</button>
          {editingUser && <button className="btn btn-outline" type="button" onClick={() => askConfirm('Rotate subscription URL', 'Invalidate the old URL and issue a new subscription URL?', () => run(() => requestJSON(`/api/admin/clash/subscriptions/${encodeURIComponent(subscription.user_id)}/rotate`, { method: 'POST' })))}>{t('Rotate URL')}</button>}</p>
      </fieldset></form>}
      </section>
    </>}
  </section>;
}
