export async function filesRequest(endpoint, { method = 'GET', data, signal } = {}) {
  const response = await fetch(`/files-api/${endpoint}`, {
    method, signal, credentials: 'same-origin', cache: 'no-store', headers: { 'X-2ez-files': '1', ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json().catch(() => ({ error: 'File Browser returned an unexpected response. Check the dashboard connection.' }));
  if (!response.ok) { const error = new Error(result.error || 'Cannot read files. Refresh and try again.'); error.status = response.status; throw error; }
  return result;
}
export const resourceURL = path => `resources?path=${encodeURIComponent(path)}`;
export const rawURL = (path, inline = false) => `/files-api/raw?path=${encodeURIComponent(path)}${inline ? '&inline=1' : ''}`;
