import { requestJSON } from './api_client.mjs';

const STORAGE_KEY = 'liulianbot.vless-tunnel.sources';
const formatState = { current: 'vless' };
const byId = id => document.getElementById(id);

function savedSources() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
}

function setStatus(message, error = false) {
  const status = byId('tunnelStatus');
  status.textContent = message;
  status.className = `status-msg${error ? ' status-error' : ''}`;
}

function setSourcePanel(format) {
  formatState.current = format;
  const vless = format === 'vless';
  byId('vlessSourcePanel').hidden = !vless;
  byId('clashSourcePanel').hidden = vless;
  byId('vlessSourceTab').classList.toggle('active', vless);
  byId('clashSourceTab').classList.toggle('active', !vless);
  byId('vlessSourceTab').setAttribute('aria-selected', String(vless));
  byId('clashSourceTab').setAttribute('aria-selected', String(!vless));
}

function currentSource() {
  return byId(formatState.current === 'vless' ? 'vlessSource' : 'clashSource').value;
}

function saveSource() {
  const sources = savedSources();
  sources[formatState.current] = currentSource();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
    byId('storageStatus').textContent = '已儲存於此瀏覽器（不會上傳）。';
  } catch (_) {
    byId('storageStatus').textContent = '瀏覽器拒絕儲存，請檢查隱私設定。';
  }
}

function clearSource() {
  const sources = savedSources();
  delete sources[formatState.current];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
    byId(formatState.current === 'vless' ? 'vlessSource' : 'clashSource').value = '';
    byId('storageStatus').textContent = '已清除這種格式的已儲存設定。';
  } catch (_) {
    byId('storageStatus').textContent = '無法清除瀏覽器儲存。';
  }
}

async function generate() {
  const source = currentSource().trim();
  if (!source) {
    setStatus('請先貼上原有設定。', true);
    return;
  }
  const button = byId('generateTunnel');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setStatus('正在產生 interim tunnel…');
  try {
    const result = await requestJSON('/api/vless-tunnel/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: formatState.current, source }),
    });
    byId('mergedOutput').value = result.config;
    byId('copyOutput').disabled = !result.config;
    const interim = result.interim;
    const meta = byId('resultMeta');
    meta.hidden = false;
    meta.textContent = `${interim.name} · 目標：${interim.internalTarget} · 有效至 ${new Date(interim.expiresAt).toLocaleString()}`;
    setStatus('已完成合併。請複製結果並匯入你的用戶端。');
  } catch (error) {
    byId('copyOutput').disabled = true;
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

async function copyOutput() {
  const output = byId('mergedOutput').value;
  if (!output) return;
  try {
    await navigator.clipboard.writeText(output);
    setStatus('已複製合併結果。');
  } catch (_) {
    byId('mergedOutput').select();
    setStatus('無法直接存取剪貼簿，已選取文字，請按 Ctrl+C。', true);
  }
}

function initialize() {
  const sources = savedSources();
  byId('vlessSource').value = sources.vless || '';
  byId('clashSource').value = sources.clash || '';
  if (sources.vless || sources.clash) byId('storageStatus').textContent = '已載入此瀏覽器的已儲存設定。';
  byId('vlessSourceTab').addEventListener('click', () => setSourcePanel('vless'));
  byId('clashSourceTab').addEventListener('click', () => setSourcePanel('clash'));
  byId('saveSource').addEventListener('click', saveSource);
  byId('clearSource').addEventListener('click', clearSource);
  byId('generateTunnel').addEventListener('click', generate);
  byId('copyOutput').addEventListener('click', copyOutput);
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initialize);
