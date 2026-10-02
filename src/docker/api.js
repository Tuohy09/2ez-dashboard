export async function request(path, { method = 'GET', data, signal } = {}) {
  const response = await fetch(path, { method, signal: signal || AbortSignal.timeout(50000), headers: { 'Content-Type': 'application/json', 'X-2ez-docker': '1' }, body: method === 'GET' ? undefined : JSON.stringify(data || {}) });
  let result;
  try { result = await response.json(); } catch { throw new Error('Docker returned an unexpected response. Refresh and retry.'); }
  if (!response.ok || result?.error) throw new Error(result?.error || `Docker request failed (${response.status}).`);
  return result;
}
export const imageName = image => image.tags?.[0] || image.id?.slice(0, 19) || 'Untagged image';
export const splitTag = reference => { const at = reference.indexOf('@'); if (at >= 0) return [reference.slice(0, at), reference.slice(at + 1)]; const colon = reference.lastIndexOf(':'); return colon > reference.lastIndexOf('/') ? [reference.slice(0, colon), reference.slice(colon + 1)] : [reference, 'latest']; };
