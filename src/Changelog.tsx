import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { version } from '../package.json';
import changelog from '../CHANGELOG.md?raw';
import './changelog.css';

export default function Changelog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') { event.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [onClose]);
  return <div className="modal-overlay" onClick={onClose}>
    <section ref={dialog} tabIndex={-1} className="modal changelog-modal" role="dialog" aria-modal="true" aria-label="更新日志" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><div><span className="eyebrow">WHAT'S NEW · v{version}</span><h2>更新日志</h2></div><button className="icon-button" title="关闭更新日志" onClick={onClose}><X size={20} /></button></div>
      <div className="changelog-content">{changelog.split('\n').map((line, index) => {
        if (line.startsWith('# ')) return null;
        if (line.startsWith('## ')) return <h3 key={index}>{line.slice(3)}</h3>;
        if (line.startsWith('### ')) return <h4 key={index}>{line.slice(4)}</h4>;
        if (line.startsWith('- ')) return <p className="changelog-item" key={index}>{line.slice(2)}</p>;
        return line.trim() ? <p key={index}>{line.replaceAll('`', '')}</p> : null;
      })}</div>
    </section>
  </div>;
}
