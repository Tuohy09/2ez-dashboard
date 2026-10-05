import { useEffect, useRef, useState } from 'react';
import { filesRequest, rawURL, resourceURL } from './api';
import { demoListing, demoText } from './demo';
import './files.css';

const APP_URL = 'https://2ez.dinosaur-banana.ts.net:8084';
const VIEWS = [{ id: 'explorer', label: 'Explorer', icon: 'list', description: 'Folder rail, file list, and details' }, { id: 'gallery', label: 'Gallery', icon: 'grid', description: 'Visual tiles with a preview below' }, { id: 'columns', label: 'Columns', icon: 'columns', description: 'Follow your folder hierarchy' }, { id: 'compact', label: 'Compact', icon: 'compact', description: 'More files, less scrolling' }, { id: 'split', label: 'Split view', icon: 'split', description: 'Browse two folders side by side' }];
const previewMode = new URLSearchParams(window.location.search).get('filesPreview') === '1';
const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
const joinPath = (parent, name) => `${parent === '/' ? '' : parent}/${name}`;
const kindOf = item => item.isDir ? 'folder' : /\.(flac|mp3|wav|m4a|ogg)$/i.test(item.name) ? 'audio' : /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(item.name) ? 'image' : /\.(mp4|mkv|webm|mov)$/i.test(item.name) ? 'video' : /\.(txt|md|json|ya?ml|toml|ini|conf|log|csv|srt|lrc|nfo|[jt]sx?|css|html|xml|sh|py|env)$/i.test(item.name) ? 'text' : 'file';
const bytes = value => { if (!Number.isFinite(value)) return '—'; if (!value) return '0 B'; const index = Math.min(3, Math.floor(Math.log(value) / Math.log(1024))); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][index]}`; };
const date = value => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
function Icon({ name = 'file', size = 20 }) {
  const paths = {
    folder: <path d="M3 7V5h6l2 3h10v12H3Z" />, file: <><path d="M5 3h9l5 5v13H5Z" /><path d="M14 3v6h5" /></>, audio: <><path d="M9 18V5l11-2v13M9 5v5l11-2" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>, image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>, video: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m10 8 6 4-6 4Z" /></>, text: <><path d="M5 3h9l5 5v13H5Z" /><path d="M9 11h6M9 15h6M9 18h4" /></>, search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>, list: <><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1" /></>, grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>, columns: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></>, compact: <><path d="M3 5h18M3 9h18M3 13h18M3 17h18M3 21h18" /></>, split: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M6 8h3M15 8h3M6 12h3M15 12h3" /></>, arrow: <path d="m9 5 7 7-7 7" />, back: <path d="m15 5-7 7 7 7" />, up: <path d="m5 14 7-7 7 7" />, refresh: <><path d="M20 7V3l-4 4M4 17v4l4-4M4 10a8 8 0 0 1 14-5M20 14a8 8 0 0 1-14 5" /></>, download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>, link: <><path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></>, close: <path d="m6 6 12 12M6 18 18 6" />, star: <path d="m12 3 3 6 6 1-5 5 1 6-5-3-5 3 1-6-5-5 6-1Z" />, external: <><path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" /></>, lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
function FileGlyph({ item, large = false }) { return <span className={`fb-glyph fb-${kindOf(item)}${large ? ' fb-glyph-large' : ''}`}><Icon name={kindOf(item)} size={large ? 32 : 18} /></span>; }
function Artwork() { return <svg className="fb-artwork" viewBox="0 0 240 200" role="img" aria-label="Sample album artwork"><rect width="240" height="200" fill="#91bac9" /><circle cx="120" cy="96" r="65" fill="#e8c1a0" /><path d="M55 96h130a65 65 0 0 1-130 0" fill="#d48d76" /><path d="M0 151h240v49H0Z" fill="#668997" /><path d="M0 169h240" stroke="#e8c1a0" strokeWidth="2" /><text x="16" y="24" fontSize="11" fill="#263b44" fontFamily="Manrope">TYCHO / AWAKE</text><text x="16" y="188" fontSize="8" fill="#fff" fontFamily="DM Mono">SAMPLE ARTWORK</text></svg>; }
function Waveform() { return <div className="fb-waveform" aria-hidden="true">{Array.from({ length: 38 }, (_, index) => <i key={index} style={{ height: `${16 + ((index * 17 + index * index * 7) % 52)}%` }} />)}</div>; }
function Breadcrumbs({ path, navigate }) { const parts = path.split('/').filter(Boolean); return <nav className="fb-breadcrumbs" aria-label="Folder path"><button onClick={() => navigate('/')}>All files</button>{parts.map((part, index) => <span key={index}><Icon name="arrow" size={12} /><button onClick={() => navigate(`/${parts.slice(0, index + 1).join('/')}`)} aria-current={index === parts.length - 1 ? 'location' : undefined}>{part}</button></span>)}</nav>; }
function FileList({ items, selected, select, open, compact = false }) { return <div className={`fb-list${compact ? ' fb-list-compact' : ''}`}><div className="fb-list-head"><span>Name</span><span>Size</span><span>Modified</span><span>Type</span></div>{items.map(item => <div className={`fb-row${selected?.path === item.path ? ' is-selected' : ''}`} key={item.path}><button className="fb-file-name" onClick={() => item.isDir ? open(item.path) : select(item)} aria-label={`${item.isDir ? 'Open folder' : 'Inspect file'} ${item.name}`}><FileGlyph item={item} /><span>{item.name}</span>{item.isDir && <Icon name="arrow" size={14} />}</button><span className="fb-data">{item.isDir ? '—' : bytes(item.size)}</span><span className="fb-data">{date(item.modified)}</span><span className="fb-data fb-type">{item.isDir ? 'Folder' : item.name.split('.').pop().toUpperCase()}</span></div>)}</div>; }
function FilePreview({ item, preview }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState(false);
  const kind = kindOf(item);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setContent(null); setError(''); setMediaError(false);
      if (kind !== 'text') return;
      try { const result = preview ? { text: demoText, truncated: false } : await filesRequest(`text?path=${encodeURIComponent(item.path)}`, { signal: controller.signal }); if (!controller.signal.aborted) setContent({ ...result, path: item.path }); }
      catch (err) { if (!controller.signal.aborted) setError(err.message); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [item.path, kind, preview]);
  if (kind === 'text') return <div className="fb-text-preview">{error ? <p role="alert">{error}</p> : content?.path === item.path ? <><pre>{content.text}</pre>{content.truncated && <p>Showing the first 128 KB. Download to read the full file.</p>}</> : <p role="status">Loading preview…</p>}</div>;
  if (mediaError) return <div className="fb-no-preview"><Icon name={kind} size={40} /><p>Your browser cannot preview this file.<br />Download it to open it.</p></div>;
  if (kind === 'image') return preview ? <Artwork /> : <img className="fb-image-preview" src={rawURL(item.path, true)} alt={item.name} onError={() => setMediaError(true)} />;
  if (kind === 'audio') return <div className="fb-audio-preview"><Icon name="audio" size={32} /><Waveform />{preview ? <span className="fb-data">FLAC · lossless audio</span> : <audio key={item.path} controls preload="none" src={rawURL(item.path, true)} onError={() => setMediaError(true)} />}</div>;
  if (kind === 'video' && /\.(mp4|webm)$/i.test(item.name)) return preview ? <div className="fb-no-preview"><Icon name="video" size={40} /><p>Video preview</p></div> : <video key={item.path} controls preload="metadata" src={rawURL(item.path, true)} onError={() => setMediaError(true)} />;
  return <div className="fb-no-preview"><Icon name={kind} size={40} /><p>{item.isDir ? 'Open this folder to see its contents.' : 'Download this file to open it.'}</p></div>;
}
function Inspector({ item, preview, close, notice, variant }) {
  if (!item) return <aside className="fb-inspector fb-inspector-empty"><Icon name="file" size={40} /><h3>A closer look</h3><p>Select a file to see its details and preview.</p></aside>;
  return <aside className={`fb-inspector${variant === 'gallery' ? ' fb-inspector-gallery' : ''}`} aria-label="File details"><div className="fb-inspector-top"><span className="fb-eyebrow">File details</span><button className="fb-icon-button" onClick={close} aria-label="Close file details"><Icon name="close" size={16} /></button></div><div className="fb-preview"><FilePreview item={item} preview={preview} /></div><div className="fb-inspector-info"><h3>{item.name}</h3><p className="fb-file-path">{item.path}</p><dl><div><dt>Size</dt><dd>{bytes(item.size)}</dd></div><div><dt>Type</dt><dd>{item.name.split('.').pop().toUpperCase()} file</dd></div><div><dt>Modified</dt><dd>{date(item.modified)}</dd></div></dl><div className="fb-detail-actions">{!item.isDir && (preview ? <button className="fb-button fb-primary" onClick={() => notice('Sample file — sign in to download your own files.')}><Icon name="download" size={16} />Download</button> : <a className="fb-button fb-primary" href={rawURL(item.path)} download onClick={() => notice('Download requested. Check your browser’s downloads.')}><Icon name="download" size={16} />Download</a>)}<button className="fb-button" onClick={async () => { try { await navigator.clipboard.writeText(item.path); notice('File path copied.'); } catch { notice(`Copy this path: ${item.path}`); } }}><Icon name="link" size={16} />Copy path</button></div></div></aside>;
}
function SignIn({ signedIn, onSignIn, preview, onPreview }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="fb-signin"><div className="fb-signin-symbol"><Icon name="folder" size={32} /></div><span className="fb-eyebrow">Your homelab, within reach</span><h2>Open your files.</h2><p>Sign in with your existing File Browser account.<br />Your folders and account permissions carry over.</p><form onSubmit={async event => { event.preventDefault(); setError(''); setBusy(true); const values = new FormData(event.currentTarget); try { const session = await filesRequest('session', { method: 'POST', data: { username: values.get('username'), password: values.get('password') } }); onSignIn(session); } catch (err) { setError(err.message); } finally { setBusy(false); } }}><label>Username<input name="username" autoComplete="username" required disabled={busy} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label>{error && <p className="fb-error-text" role="alert">{error}</p>}<button className="fb-button fb-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to File Browser'}<Icon name="arrow" size={16} /></button></form><button className="fb-text-button" onClick={onPreview}>{preview ? 'Close sample preview' : 'Explore the five views with sample files'}<Icon name="arrow" size={14} /></button><a className="fb-text-button" href={APP_URL} target="_blank" rel="noreferrer">Open full File Browser<Icon name="external" size={14} /></a>{signedIn && <p>Signed in as {signedIn.username}</p>}</div>;
}
export default function FileBrowserPage() {
  const [view, setView] = useState(() => { const requested = new URLSearchParams(window.location.search).get('filesView'); try { const saved = requested || localStorage.getItem('2ez-files-view'); return VIEWS.some(item => item.id === saved) ? saved : 'explorer'; } catch { return 'explorer'; } });
  const [preview, setPreview] = useState(previewMode);
  const [session, setSession] = useState(null);
  const [checkedSession, setCheckedSession] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [sessionCheck, setSessionCheck] = useState(0);
  const [path, setPath] = useState(previewMode ? '/Music/Tycho/Awake' : '/');
  const [secondPath, setSecondPath] = useState('/');
  const [listings, setListings] = useState({});
  const [error, setError] = useState(null);
  const [secondaryError, setSecondaryError] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState(previewMode ? demoListing('/Music/Tycho/Awake').items[0] : null);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pinned, setPinned] = useState(() => { try { const stored = JSON.parse(localStorage.getItem('2ez-files-pins') || '[]'); return Array.isArray(stored) ? stored.filter(value => typeof value === 'string' && value.startsWith('/')).slice(0, 12) : []; } catch { return []; } });
  const searchRef = useRef(null);
  useEffect(() => { try { localStorage.setItem('2ez-files-view', view); } catch { /* Browsing still works without storage. */ } }, [view]);
  useEffect(() => { try { localStorage.setItem('2ez-files-pins', JSON.stringify(pinned)); } catch { /* Pins remain usable for this session. */ } }, [pinned]);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    filesRequest('session', { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setSession(value); setConnectionError(''); }
    }).catch(error => {
      if (!controller.signal.aborted && error.status !== 401) setConnectionError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setCheckedSession(true); });
    return () => controller.abort();
  }, [preview, sessionCheck]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timeout); }, [notice]);
  useEffect(() => {
    const focus = event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', focus); return () => window.removeEventListener('keydown', focus);
  }, []);
  useEffect(() => {
    if (!preview && !session) return;
    const controller = new AbortController();
    const parts = path.split('/').filter(Boolean);
    const ancestors = parts.map((_, index) => `/${parts.slice(0, index).join('/')}`);
    const paths = [...new Set(['/', path, ...(view === 'columns' ? ancestors.slice(-2) : []), ...(view === 'split' ? [secondPath] : [])])];
    async function load() {
      const results = await Promise.all(paths.map(async current => {
        try {
          const result = preview ? demoListing(current) : await filesRequest(resourceURL(current), { signal: controller.signal });
          if (!result.isDir || !Array.isArray(result.items)) throw new Error('Choose a folder to browse its files.');
          return { current, result: { ...result, items: result.items.map(item => ({ ...item, path: joinPath(current, item.name) })) } };
        } catch (err) { return { current, error: err }; }
      }));
      if (controller.signal.aborted) return;
      const fatal = results.find(result => result.error?.status === 401);
      if (fatal) { setSession(null); setCheckedSession(true); setNotice(fatal.error.message); setListings({}); return; }
      setListings(Object.fromEntries(results.filter(result => !result.error).map(result => [result.current, result.result])));
      setError(results.find(result => result.current === path && result.error) || null);
      setSecondaryError(view === 'split' ? results.find(result => result.current === secondPath && result.error) || null : null);
    }
    load(); return () => controller.abort();
  }, [path, secondPath, session, preview, refresh, view]);
  function navigate(next) { setPath(next); setQuery(''); setSelected(null); setError(null); }
  function switchPreview(value) { setPreview(value); setPath(value ? '/Music/Tycho/Awake' : '/'); setSecondPath('/'); setSelected(value ? demoListing('/Music/Tycho/Awake').items[0] : null); setQuery(''); setListings({}); setError(null); }
  const root = listings['/'];
  const current = listings[path];
  const filter = items => [...(items || [])].filter(item => (showHidden || !item.name.startsWith('.')) && item.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.isDir) - Number(a.isDir) || (sort === 'size' ? b.size - a.size : sort === 'modified' ? new Date(b.modified) - new Date(a.modified) : a.name.localeCompare(b.name, undefined, { numeric: true })));
  const items = filter(current?.items);
  const folderCount = current?.items.filter(item => item.isDir).length || 0;
  const fileCount = (current?.items.length || 0) - folderCount;
  const totalBytes = current?.items.reduce((sum, item) => sum + (item.isDir ? 0 : item.size || 0), 0) || 0;
  const select = item => { setSelected(item); if (window.matchMedia('(max-width: 767px)').matches) requestAnimationFrame(() => document.querySelector('.fb-inspector')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })); };
  const list = (rows, open = navigate, compact = view === 'compact') => <FileList items={rows} selected={selected} select={select} open={open} compact={compact} />;
  const empty = <div className="fb-empty"><Icon name={query ? 'search' : 'folder'} size={36} /><h3>{query ? 'No matching files' : 'This folder is empty'}</h3><p>{query ? 'Try a different name or clear your search.' : 'Add files using the full File Browser app.'}</p>{query ? <button className="fb-button" onClick={() => setQuery('')}>Clear search</button> : <a className="fb-button" href={APP_URL} target="_blank" rel="noreferrer">Open File Browser<Icon name="external" size={16} /></a>}</div>;
  const inspector = <Inspector item={selected} preview={preview} close={() => setSelected(null)} notice={setNotice} variant={view} />;
  const ready = preview || session;
  return <section className={`fb-page fb-view-${view}${selected ? ' fb-has-selection' : ''}`} aria-label="File browser">
    <div className="fb-heading"><div><span className="fb-eyebrow">Storage / File Browser</span><h1>Files, in their place.</h1><p>Browse your homelab. Find what you came for.</p></div><div className="fb-heading-actions">{ready && <span className={`fb-account${preview ? ' fb-sample-account' : ''}`}><i />{preview ? 'Sample files' : session.username}</span>}<a className="fb-button" href={APP_URL} target="_blank" rel="noreferrer">Full File Browser<Icon name="external" size={15} /></a>{session && !preview && <button className="fb-text-button" onClick={async () => { try { await filesRequest('session', { method: 'DELETE' }); setSession(null); setListings({}); setSelected(null); setNotice('Signed out of File Browser.'); } catch (err) { setNotice(err.message); } }}>Sign out</button>}</div></div>
    <div className="fb-view-picker" role="group" aria-label="File browser layout">{VIEWS.map(item => <button key={item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)} title={item.description}><Icon name={item.icon} size={18} /><span>{item.label}</span></button>)}</div>
    {preview && <div className="fb-preview-notice"><span>Design preview · Sample files, sizes, and artwork</span><button className="fb-text-button" onClick={() => switchPreview(false)}>Browse my files<Icon name="arrow" size={14} /></button></div>}
    {notice && <div className="fb-notice" role="status">{notice}<button className="fb-icon-button" onClick={() => setNotice('')} aria-label="Dismiss message"><Icon name="close" size={16} /></button></div>}
    {!ready ? (!checkedSession ? <div className="fb-loading" role="status">Connecting to File Browser…</div> : connectionError ? <div className="fb-signin"><Icon name="lock" size={32} /><h2>Could not restore your login</h2><p role="alert">{connectionError}</p><button className="fb-button fb-primary" onClick={() => { setConnectionError(''); setCheckedSession(false); setSessionCheck(value => value + 1); }}>Retry connection</button></div> : <SignIn signedIn={session} onSignIn={value => { setSession(value); setPath('/'); setNotice('Signed in. Your files are ready to browse.'); }} preview={preview} onPreview={() => switchPreview(true)} />) : <>
      <div className="fb-toolbar"><div className="fb-path-controls"><button className="fb-icon-button" onClick={() => navigate(parentOf(path))} disabled={path === '/'} aria-label="Parent folder"><Icon name="up" size={18} /></button><Breadcrumbs path={path} navigate={navigate} /></div><div className="fb-tools"><label className="fb-search"><Icon name="search" size={16} /><input ref={searchRef} type="search" placeholder="Find in this folder…" aria-label="Find in this folder" value={query} onChange={event => setQuery(event.target.value)} /><kbd>/</kbd></label><label className="fb-sort"><span className="fb-sr-only">Sort files</span><select aria-label="Sort files" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name A–Z</option><option value="modified">Newest first</option><option value="size">Largest first</option></select></label><button className="fb-icon-button" onClick={() => { setRefresh(value => value + 1); setNotice('Folder refresh requested.'); }} aria-label="Refresh folder"><Icon name="refresh" size={18} /></button></div></div>
      <div className="fb-workspace">
        {['explorer', 'gallery'].includes(view) && <aside className="fb-locations"><span className="fb-eyebrow">Locations</span><button className={path === '/' ? 'is-active' : ''} onClick={() => navigate('/')}><Icon name="folder" size={18} />All files</button>{root?.items.filter(item => item.isDir && (showHidden || !item.name.startsWith('.'))).map(item => <button key={item.path} className={path === item.path || path.startsWith(`${item.path}/`) ? 'is-active' : ''} onClick={() => navigate(item.path)}><Icon name="folder" size={18} /><span>{item.name}</span></button>)}<div className="fb-pinned-head"><span className="fb-eyebrow">Pinned folders</span><button className="fb-icon-button" disabled={path === '/'} aria-label={pinned.includes(path) ? 'Unpin current folder' : 'Pin current folder'} onClick={() => setPinned(previous => previous.includes(path) ? previous.filter(value => value !== path) : [...previous.slice(-11), path])}><Icon name="star" size={14} /></button></div>{pinned.length ? pinned.map(value => <button key={value} onClick={() => navigate(value)}><Icon name="star" size={15} /><span>{value.split('/').pop()}</span></button>) : <p className="fb-location-hint">Pin a folder to keep it close.</p>}<div className="fb-location-footer"><Icon name="lock" size={14} /><span>File Browser permissions</span></div></aside>}
        <div className="fb-main"><div className="fb-folder-heading"><div><span className="fb-eyebrow">{view === 'columns' ? 'Folder hierarchy' : view === 'split' ? 'Left folder' : 'Current folder'}</span><h2>{path.split('/').pop() || 'All files'}<span>{current ? current.items.length : '—'} items</span></h2></div><label className="fb-hidden"><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)} />Hidden files</label></div>
          {error && <div className="fb-error" role="alert"><Icon name={error.error.status === 403 ? 'lock' : 'folder'} size={24} /><div><strong>{error.error.status === 403 ? 'Access to this folder is restricted' : 'This folder could not be opened'}</strong><p>{error.error.message}</p><button className="fb-button" onClick={() => { setError(null); setRefresh(value => value + 1); }}>Try again</button><button className="fb-text-button" onClick={() => navigate(parentOf(error.current))}>Open parent folder</button></div></div>}
          {!error && !current ? <div className="fb-skeleton" role="status" aria-label="Loading files">{Array.from({ length: 8 }, (_, index) => <div key={index}><i /><span /><span /></div>)}</div> : !error && !items.length ? empty : !error && view === 'gallery' ? <div className="fb-gallery">{items.map(item => <button key={item.path} className={`fb-file-tile${selected?.path === item.path ? ' is-selected' : ''}`} aria-label={`${item.isDir ? 'Open folder' : 'Inspect file'} ${item.name}`} onClick={() => item.isDir ? navigate(item.path) : select(item)}><span className={`fb-tile-visual fb-tile-${kindOf(item)}`}>{kindOf(item) === 'image' ? preview ? <Artwork /> : <img src={rawURL(item.path, true)} alt="" loading="lazy" /> : kindOf(item) === 'audio' ? <><Icon name="audio" size={28} /><Waveform /><span>{item.name.split('.').pop().toUpperCase()}</span></> : kindOf(item) === 'text' ? <><Icon name="text" size={28} /><span className="fb-tile-text-lines"><i /><i /><i /></span></> : <FileGlyph item={item} large />}</span><strong>{item.name}</strong><span className="fb-data">{item.isDir ? 'Folder' : bytes(item.size)}</span></button>)}</div> : !error && view === 'columns' ? <div className="fb-columns">{[...new Set([...(path === '/' ? [] : [parentOf(parentOf(path)), parentOf(path)]), path])].map((columnPath, columnIndex, columnPaths) => <div className="fb-column" key={columnPath}><div className="fb-column-head"><span>{columnPath.split('/').pop() || 'All files'}</span><span className="fb-data">{listings[columnPath]?.items.length || 0}</span></div>{(columnPath === path ? items : (listings[columnPath]?.items || []).filter(item => showHidden || !item.name.startsWith('.'))).map(item => <button key={item.path} className={item.path === columnPaths[columnIndex + 1] || selected?.path === item.path ? 'is-selected' : ''} onClick={() => item.isDir ? navigate(item.path) : select(item)} aria-label={`${item.isDir ? 'Open folder' : 'Inspect file'} ${item.name}`}><FileGlyph item={item} /><span>{item.name}</span>{item.isDir && <Icon name="arrow" size={13} />}</button>)}</div>)}</div> : !error && list(items)}
          <div className="fb-folder-footer"><span>{folderCount} folders · {fileCount} files</span><span>{bytes(totalBytes)} in files</span></div>
        </div>
        {view === 'split' && <div className="fb-second"><div className="fb-second-path"><span className="fb-eyebrow">Right folder</span><button className="fb-icon-button" disabled={secondPath === '/'} onClick={() => setSecondPath(parentOf(secondPath))} aria-label="Right parent folder"><Icon name="up" size={16} /></button></div><Breadcrumbs path={secondPath} navigate={setSecondPath} /><div className="fb-folder-heading"><h2>{secondPath.split('/').pop() || 'All files'}</h2><span className="fb-data">{listings[secondPath]?.items.length ?? '—'} items</span></div>{secondaryError ? <div className="fb-error" role="alert"><Icon name={secondaryError.error.status === 403 ? 'lock' : 'folder'} size={24} /><div><strong>Right folder could not be opened</strong><p>{secondaryError.error.message}</p><button className="fb-button" onClick={() => { setSecondaryError(null); setRefresh(value => value + 1); }}>Retry right folder</button><button className="fb-text-button" onClick={() => setSecondPath(parentOf(secondPath))}>Open right parent folder</button></div></div> : listings[secondPath] ? listings[secondPath].items.length ? list(filter(listings[secondPath].items), setSecondPath) : <div className="fb-empty"><Icon name="folder" size={32} /><h3>This folder is empty</h3><p>Choose another folder to browse.</p></div> : <div className="fb-loading" role="status">Loading right folder…</div>}<div className="fb-folder-footer">Browse folders independently</div></div>}
        {['explorer', 'columns'].includes(view) && selected && inspector}
      </div>
      {['gallery', 'compact', 'split'].includes(view) && selected && inspector}
      <div className="fb-bottom-note"><span><Icon name="lock" size={12} />{preview ? 'Sample library · no changes to your files' : 'Access follows your File Browser account'}</span><span>Browse, preview, download<span className="fb-key-hint"> · / to find a file</span></span></div>
    </>}
  </section>;
}
