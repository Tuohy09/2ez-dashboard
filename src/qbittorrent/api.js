export async function qbtRequest(endpoint, { method = 'GET', data, signal } = {}) {
  const multipart = data instanceof FormData;
  const response = await fetch(`/qbt/api/v2/${endpoint}`, {
    method, signal: signal || AbortSignal.timeout(50000),
    headers: method === 'POST' ? { 'X-2ez-qbt': '1', ...(!multipart ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) } : {},
    body: method === 'POST' ? (multipart ? data : new URLSearchParams(Object.entries(data || {}).map(([key, value]) => [key, String(value)]))) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    let message;
    try { message = JSON.parse(text).error; } catch { /* Upstream errors can be plain text. */ }
    throw new Error(message || (response.status === 403 ? 'qBittorrent access denied. Check the dashboard connection settings.' : response.status === 404 ? 'This item or operation is no longer available. Refresh and try again.' : `qBittorrent could not complete the request (${response.status}). ${text.slice(0, 180)}`));
  }
  if (/^fails?\.?$/i.test(text.trim())) throw new Error('qBittorrent rejected the torrent. Check the link or uploaded file.');
  try { return JSON.parse(text); } catch { return text; }
}

export function mergeSync(previous, update) {
  const next = update.full_update ? { torrents: {}, categories: {}, tags: [], server_state: {} } : { ...previous, torrents: { ...previous.torrents }, categories: { ...previous.categories }, tags: [...previous.tags], server_state: { ...previous.server_state } };
  for (const [hash, fields] of Object.entries(update.torrents || {})) next.torrents[hash] = { ...next.torrents[hash], ...fields, hash };
  for (const hash of update.torrents_removed || []) delete next.torrents[hash];
  Object.assign(next.categories, update.categories || {});
  for (const name of update.categories_removed || []) delete next.categories[name];
  next.tags = [...new Set([...next.tags, ...(update.tags || [])])].filter(tag => !(update.tags_removed || []).includes(tag));
  Object.assign(next.server_state, update.server_state || {});
  next.rid = update.rid;
  return next;
}
export function torrentGroup(torrent) {
  const state = torrent.state || '';
  if (['error', 'missingFiles', 'unknown'].includes(state)) return 'error';
  if (/^(paused|stopped)/.test(state)) return 'paused';
  if (/checking|allocating|moving/i.test(state)) return 'checking';
  if (/UP$|uploading|forcedUP/.test(state)) return 'seeding';
  return 'downloading';
}
export function stateLabel(torrent) {
  const labels = { error: 'Error', missingFiles: 'Missing files', unknown: 'Unknown', stalledDL: 'Waiting for peers', queuedDL: 'Queued', queuedUP: 'Queued to seed', metaDL: 'Getting metadata', forcedMetaDL: 'Getting metadata', checkingDL: 'Checking', checkingUP: 'Checking', checkingResumeData: 'Checking', allocating: 'Allocating', moving: 'Moving files', forcedDL: 'Force downloading', forcedUP: 'Force seeding' };
  return labels[torrent.state] || ({ paused: 'Stopped', downloading: 'Downloading', seeding: 'Seeding', checking: 'Checking' }[torrentGroup(torrent)]) || torrent.state;
}
export function bytes(value = 0) {
  if (!Number.isFinite(value) || value < 0) return '—';
  const unit = value >= 1024 ** 3 ? 3 : value >= 1024 ** 2 ? 2 : value >= 1024 ? 1 : 0;
  return `${(value / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
}
export function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= 8640000) return '—';
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s` : `${seconds}s`;
}
export const percent = value => `${((value || 0) * 100).toFixed(1)}%`;
export const modern = version => Number(String(version).replace(/^v/, '').split('.')[0]) >= 5;
