import { useState } from 'react';
import Modal from '../qbittorrent/Modal';
import { filename } from './api';

export default function ActionDialog({ operation, libraries, busy, error, onClose, onSubmit }) {
  const [path, setPath] = useState('');
  const [library, setLibrary] = useState(String(libraries[0]?.id || ''));
  const descriptions = {
    removeQueue: ['Remove queued jobs', 'Remove these entries from the processing queue. Local source files are kept; Unmanic may clean up cached files for remote jobs.'],
    removeHistory: ['Remove history records', 'Remove these processing records and their logs from history. This does not remove the library files.'],
    terminate: ['Stop current job', 'Terminate this worker’s current job. Any work in progress may be lost. The worker can pick up another queued job afterward.'],
    reprocess: ['Reprocess files', 'Add these files back to the processing queue using the selected library’s plugins. Unmanic may replace source files according to that library’s configuration.'],
    scan: ['Scan libraries', 'Scan the configured libraries and queue files that need processing.'],
    cancelScan: ['Cancel library scan', 'Stop the current or scheduled scan. Jobs already queued are retained.'],
    add: ['Add a file', 'Enter a file path as seen by Unmanic, such as /library/movies/film.mkv. This queues the file directly using the selected library’s processing plugins.'],
  };
  const [title, description] = descriptions[operation.kind];
  return <Modal title={title} busy={busy} onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSubmit(operation.kind === 'add' ? { path: path.trim(), library_id: Number(library) } : operation.kind === 'reprocess' ? { library_id: Number(library) } : {}); }}>
    <p className="qb-modal-description">{description}</p>
    {operation.items?.length > 0 && <ul className="qb-targets">{operation.items.map(item => <li key={item.id}>{item.name || item.task_label || filename(item.abspath)}</li>)}</ul>}
    <fieldset disabled={busy}>{operation.kind === 'add' && <label>File path<input required value={path} onChange={event => setPath(event.target.value)} placeholder="/library/movies/film.mkv" pattern="/.*" /></label>}
    {['add', 'reprocess'].includes(operation.kind) && <label>Library<select aria-label="Library" required value={library} onChange={event => setLibrary(event.target.value)}><option value="" disabled>Select a library</option>{libraries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </fieldset>{error && <div className="qb-error" role="alert">{error}</div>}<footer><button type="button" className="qb-button" disabled={busy} onClick={onClose}>Cancel</button><button className={`qb-button ${['removeQueue', 'removeHistory', 'terminate', 'cancelScan'].includes(operation.kind) ? 'qb-danger' : 'qb-primary'}`} disabled={busy || (['add', 'reprocess'].includes(operation.kind) && !library)}>{busy ? 'Applying…' : title}</button></footer>
  </form></Modal>;
}
