import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { Annotation, ChangeSet, Compartment, EditorState, Prec, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentLess, indentMore, indentWithTab, redo, redoDepth, toggleComment, undo, undoDepth } from '@codemirror/commands';
import { gotoLine, openSearchPanel } from '@codemirror/search';
import { foldAll, HighlightStyle, indentUnit, syntaxHighlighting, unfoldAll } from '@codemirror/language';
import { completeFromList } from '@codemirror/autocomplete';
import { yaml, yamlLanguage } from '@codemirror/lang-yaml';
import { getOriginalDoc, originalDocChangeEffect, unifiedMergeView } from '@codemirror/merge';
import { tags } from '@lezer/highlight';
import './compose-editor.css';

const externalUpdate = Annotation.define();
const composeKeys = ['services', 'image', 'build', 'container_name', 'restart', 'ports', 'volumes', 'networks', 'environment', 'env_file', 'depends_on', 'healthcheck', 'command', 'entrypoint', 'working_dir', 'user', 'labels', 'profiles', 'secrets', 'configs', 'deploy', 'resources', 'limits', 'cpus', 'memory', 'test', 'interval', 'timeout', 'retries', 'start_period', 'logging', 'driver', 'options', 'read_only', 'init', 'stop_grace_period'];
const complete = completeFromList(composeKeys.map(label => ({ label, type: 'property', apply: label + ': ' })));
const highlighting = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], class: 'ce-token-key' },
  { tag: tags.string, class: 'ce-token-string' }, { tag: [tags.number, tags.bool, tags.null], class: 'ce-token-value' },
  { tag: tags.comment, class: 'ce-token-comment' }, { tag: [tags.meta, tags.punctuation], class: 'ce-token-meta' },
]);

export default function ComposeEditor({ value, savedValue = '', onChange, onSave, onValidate, onDiscard, onReload, readOnly = false, busy = false, dirty = false, canSave = true, filename = 'compose.yaml', label = 'Compose configuration', saveLabel = 'Save', isNew = false, error = '', notice = '' }) {
  const host = useRef(null), view = useRef(null), fileInput = useRef(null), container = useRef(null);
  const latest = useRef({ value, onChange, onSave, onValidate, readOnly, busy, canSave });
  const settings = useRef({ locked: new Compartment(), wrap: new Compartment(), review: new Compartment() });
  const [wrap, setWrap] = useState(false), [expanded, setExpanded] = useState(false), [review, setReview] = useState(false);
  const [position, setPosition] = useState({ line: 1, column: 1, lines: value.split('\n').length, undo: 0, redo: 0 });
  const [feedback, setFeedback] = useState('');
  useEffect(() => { latest.current = { value, onChange, onSave, onValidate, readOnly, busy, canSave }; }, [value, onChange, onSave, onValidate, readOnly, busy, canSave]);
  useEffect(() => {
    const compartments = settings.current;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: latest.current.value, extensions: [
      basicSetup, yaml(), indentUnit.of('  '), EditorState.tabSize.of(2), syntaxHighlighting(highlighting),
      EditorView.contentAttributes.of({ 'aria-label': label, 'aria-describedby': 'ce-keyboard-help', spellcheck: 'false', autocapitalize: 'off' }),
      yamlLanguage.data.of({ autocomplete: context => /^\s*(?:-\s*)?[\w-]*$/.test(context.state.doc.lineAt(context.pos).text.slice(0, context.pos - context.state.doc.lineAt(context.pos).from)) ? complete(context) : null }),
      compartments.locked.of([EditorState.readOnly.of(latest.current.readOnly || latest.current.busy)]), compartments.wrap.of([]), compartments.review.of([]),
      Prec.highest(keymap.of([{ key: 'Mod-s', run: () => { const props = latest.current; if (!props.readOnly && !props.busy && props.canSave) props.onSave?.(); return true; } }, { key: 'Mod-Enter', run: () => { const props = latest.current; if (!props.readOnly && !props.busy) props.onValidate?.(); return true; } }, indentWithTab])),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalUpdate))) latest.current.onChange(update.state.doc.toString());
        if (update.docChanged || update.selectionSet || update.transactions.length) {
          const selection = update.state.selection.main, line = update.state.doc.lineAt(selection.head);
          setPosition({ line: line.number, column: selection.head - line.from + 1, lines: update.state.doc.lines, undo: undoDepth(update.state), redo: redoDepth(update.state) });
        }
      }),
    ] }) });
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
  }, [label]);
  useEffect(() => { const editor = view.current; if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value }, annotations: [Transaction.addToHistory.of(false), externalUpdate.of(true)] }); }, [value]);
  useEffect(() => { view.current?.dispatch({ effects: settings.current.locked.reconfigure(EditorState.readOnly.of(readOnly || busy)) }); }, [readOnly, busy]);
  useEffect(() => { view.current?.dispatch({ effects: settings.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []) }); }, [wrap]);
  useEffect(() => {
    const editor = view.current; if (!editor) return;
    editor.dispatch({ effects: settings.current.review.reconfigure(review ? unifiedMergeView({ original: savedValue, mergeControls: false, highlightChanges: true, gutter: true }) : []) });
    if (review) {
      const original = getOriginalDoc(editor.state);
      if (original.toString() !== savedValue) editor.dispatch({ effects: originalDocChangeEffect(editor.state, ChangeSet.of({ from: 0, to: original.length, insert: savedValue }, original.length)) });
    }
  }, [review, savedValue]);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const escape = event => { if (event.key === 'Escape' && !event.defaultPrevented) setExpanded(false); };
    window.addEventListener('keydown', escape);
    view.current?.requestMeasure();
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', escape); view.current?.requestMeasure(); };
  }, [expanded]);
  function run(command) { if (view.current) { command(view.current); view.current.focus(); } }
  function download() {
    const url = URL.createObjectURL(new Blob([value], { type: 'text/yaml;charset=utf-8' })); const link = document.createElement('a');
    link.href = url; link.download = filename.split('/').pop() || 'compose.yaml'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > 200 * 1024) { setFeedback('Choose a Compose file smaller than 200 KiB.'); return; }
    try {
      const text = await file.text();
      if (latest.current.readOnly || latest.current.busy) return;
      if (text.includes('\0')) { setFeedback('Choose a plain-text YAML file.'); return; }
      if (latest.current.value.trim() && !window.confirm('Replace the current editor contents with this file? This only changes your draft until you save.')) return;
      const editor = view.current; if (!editor) return;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } }); editor.focus(); setFeedback(`Imported ${file.name} into the draft. Validate and save to apply it.`);
    } catch { setFeedback('Could not read the file. Try another YAML file.'); }
  }
  const locked = readOnly || busy;
  return <section ref={container} className={`compose-editor ${expanded ? 'ce-expanded' : ''}`} aria-label="Stack file editor">
    <div className="ce-filebar"><div><strong>{filename}</strong><span className={dirty ? 'ce-unsaved' : ''}>{busy ? 'Working…' : readOnly ? 'View only' : dirty ? '● Unsaved changes' : isNew ? 'New stack draft' : 'Saved version'}</span></div><div className="ce-file-actions">{onReload && <button type="button" className="surface-button" disabled={busy} onClick={onReload}>Reload</button>}{onDiscard && <button type="button" className="surface-button" disabled={locked || !dirty} onClick={onDiscard}>Discard</button>}{onValidate && <button type="button" className="surface-button" disabled={locked} onClick={onValidate}>Validate</button>}<button type="button" className="surface-button sm-primary" disabled={locked || !canSave} onClick={onSave}>{busy ? 'Working…' : saveLabel}</button></div></div>
    <div className="ce-tools" aria-label="Editor tools"><div><button type="button" disabled={locked || !position.undo} onClick={() => run(undo)} title="Undo (Ctrl/Cmd+Z)">Undo</button><button type="button" disabled={locked || !position.redo} onClick={() => run(redo)} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button></div><div><button type="button" onClick={() => run(openSearchPanel)}>Find / Replace</button><button type="button" onClick={() => run(gotoLine)}>Go to line</button></div><div><button type="button" disabled={locked} onClick={() => run(indentMore)}>Indent</button><button type="button" disabled={locked} onClick={() => run(indentLess)}>Outdent</button><button type="button" disabled={locked} onClick={() => run(toggleComment)}>Comment</button></div><div><button type="button" onClick={() => run(foldAll)}>Fold all</button><button type="button" onClick={() => run(unfoldAll)}>Unfold</button></div><div><button type="button" aria-pressed={wrap} onClick={() => setWrap(previous => !previous)}>Wrap</button><button type="button" aria-pressed={review} onClick={() => setReview(previous => !previous)}>Review changes</button><button type="button" aria-pressed={expanded} onClick={() => setExpanded(previous => !previous)}>{expanded ? 'Exit expanded view' : 'Expand editor'}</button></div><div><button type="button" disabled={locked} onClick={() => fileInput.current?.click()}>Import YAML</button><button type="button" onClick={download}>Download YAML</button></div></div>
    <input ref={fileInput} className="ce-file-input" type="file" accept=".yaml,.yml,.txt,text/yaml,text/plain" aria-label="Import Compose file" onChange={importFile} />
    {(error || notice || feedback || review) && <div className="ce-messages">{error && <p className="sm-error" role="alert">{error}</p>}{notice && <p className="sm-notice" role="status">{notice}</p>}{feedback && <p className="sm-notice" role="status">{feedback}<button type="button" className="sm-text-button" onClick={() => setFeedback('')}>Dismiss</button></p>}{review && <p className="ce-review-legend"><span>− Removed from {isNew ? 'starter template' : 'saved version'}</span><span>+ Added in your draft</span></p>}</div>}
    <div ref={host} className="ce-host" />
    <div className="ce-status"><span>Ln {position.line}, Col {position.column} · {position.lines} lines</span><span>YAML · 2 spaces · {readOnly ? 'Read only' : dirty ? 'Modified' : isNew ? 'Draft' : 'Saved'}</span></div>
    <p id="ce-keyboard-help" className="ce-help">Ctrl/Cmd+S {isNew ? 'creates' : 'saves'} · {onValidate && 'Ctrl/Cmd+Enter validates · '}Ctrl/Cmd+F searches · Tab indents · Esc then Tab leaves the editor</p>
  </section>;
}
