export async function unmanicRequest(endpoint, { method = 'GET', data, signal } = {}) {
  const response = await fetch(`/um-api/${endpoint}`, {
    method, signal: signal || AbortSignal.timeout(35000),
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-2ez-unmanic': '1' },
    body: method === 'GET' ? undefined : JSON.stringify(data || {}),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Unmanic returned an unexpected response. Check the connection.'); }
  if (!response.ok || result.error || result.success === false) throw new Error(result.error || result.message || (result.messages ? JSON.stringify(result.messages) : `Unmanic request failed (${response.status}).`));
  return result;
}
export const filename = value => String(value || '').split('/').pop() || 'Untitled job';
export const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const progress = worker => worker.idle ? null : number(worker.subprocess?.percent);
export const workerState = worker => worker.paused ? 'Paused' : worker.idle ? 'Idle' : 'Processing';
export const logText = log => Array.isArray(log) ? log.join('\n') : String(log || '');
export function encodingSpeed(worker) {
  const matches = [...logText(worker.worker_log_tail).matchAll(/speed=\s*([\d.]+x)/g)];
  return matches.at(-1)?.[1] || '—';
}
export const date = value => Number(value) > 0 ? new Date(Number(value) * 1000).toLocaleString() : '—';
