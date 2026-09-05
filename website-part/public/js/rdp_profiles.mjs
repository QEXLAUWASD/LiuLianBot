import { requestJSON } from './api_client.mjs';

export function createRdpProfiles(document, request = requestJSON) {
  const el = id => document.getElementById(id);
  const list = el('rdpProfileList'), name = el('rdpProfileName'), status = el('rdpProfileStatus');
  const save = el('saveRdp'), load = el('loadRdp'), remove = el('deleteServerProfile'), fresh = el('newRdp');
  const fields = { host: el('rdpHost'), port: el('rdpPort'), username: el('rdpUsername'), domain: el('rdpDomain'), password: el('rdpPassword') };
  let busy = false, available = false;
  const setBusy = value => {
    busy = value;
    for (const control of [list, name, save, load, remove, fresh]) control.disabled = busy || !available;
    load.disabled ||= !list.value;
    remove.disabled ||= !list.value;
  };
  const fill = profile => {
    for (const [key, field] of Object.entries(fields)) field.value = profile?.[key] ?? (key === 'port' ? 3389 : '');
    name.value = profile?.name || '';
  };
  const refresh = async selected => {
    const data = await request('/api/rdp/profiles');
    available = data.available;
    list.replaceChildren();
    const empty = document.createElement('option');
    empty.value = ''; empty.textContent = '新增連線設定';
    list.append(empty);
    for (const profile of data.profiles) {
      const option = document.createElement('option');
      option.value = profile.id; option.textContent = profile.name;
      list.append(option);
    }
    list.value = selected || '';
  };
  const run = async action => {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (error) { status.textContent = error.message || '設定操作失敗，請重試。'; }
    finally { setBusy(false); }
  };
  const loadSelected = async () => {
    if (!list.value) { fill(null); return; }
    fill(null);
    const data = await request('/api/rdp/profiles/' + encodeURIComponent(list.value));
    fill(data.profile);
    status.textContent = '已載入設定與密碼。';
  };
  list.addEventListener('change', () => run(loadSelected));
  load.addEventListener('click', () => run(loadSelected));
  fresh.addEventListener('click', () => { if (busy) return; list.value = ''; fill(null); setBusy(false); name.focus(); });
  save.addEventListener('click', () => run(async () => {
    const body = { name: name.value, ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])) };
    const id = list.value;
    const result = await request('/api/rdp/profiles' + (id ? '/' + encodeURIComponent(id) : ''), {
      method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    await refresh(id || result.id);
    status.textContent = '已加密儲存至你的帳號資料庫。';
  }));
  remove.addEventListener('click', () => run(async () => {
    if (!list.value) return;
    await request('/api/rdp/profiles/' + encodeURIComponent(list.value), { method: 'DELETE' });
    await refresh();
    fill(null);
    status.textContent = '已刪除此組連線設定。';
  }));
  setBusy(false);
  return {
    initialize: legacy => run(async () => {
      await refresh();
      if (!available) { status.textContent = '請管理員設定 REMOTE_CREDENTIAL_ENCRYPTION_KEY，以啟用加密資料庫儲存。'; return; }
      if (legacy) { fill({ ...legacy, name: '舊版 RDP 設定' }); status.textContent = '已載入舊設定，按儲存可轉存為命名設定。'; }
      else status.textContent = '選取或新增連線設定；每組密碼都會加密儲存。';
    }),
  };
}
