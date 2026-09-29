import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export default function Modal({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement; dialog.showModal(); return () => { dialog.close(); previous?.focus(); }; }, []);
  return createPortal(<dialog className="qb-modal" ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2>{title}</h2><button type="button" className="qb-icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></header>{children}
  </dialog>, document.body);
}
