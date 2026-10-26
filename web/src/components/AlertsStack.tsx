import { BellRing, X } from 'lucide-react';
import { useEffect } from 'react';
import type { InAppAlert } from '../hooks/useNotifications';

export function AlertsStack({ alerts, onDismiss, onOpen }: { alerts: InAppAlert[]; onDismiss: (id: string) => void; onOpen: (oppId: string) => void }) {
  useEffect(() => {
    if (!alerts.length) return;
    const t = window.setTimeout(() => onDismiss(alerts[alerts.length - 1].id), 12_000);
    return () => window.clearTimeout(t);
  }, [alerts, onDismiss]);

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-50 flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2 sm:right-5 sm:bottom-5" aria-live="polite">
      {alerts.map((a) => (
        <div key={a.id} className="pointer-events-auto animate-fade-in rounded-xl border border-emerald-400/30 bg-ink-850/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-start gap-2">
            <BellRing size={16} className="mt-0.5 shrink-0 text-emerald-300" />
            <button className="min-w-0 flex-1 text-left" onClick={() => { onOpen(a.opp.id); onDismiss(a.id); }}>
              <div className="text-sm font-semibold text-white">{a.title}</div>
              <div className="mt-0.5 text-xs whitespace-pre-line text-slate-300">{a.body}</div>
            </button>
            <button className="text-slate-500 hover:text-white" onClick={() => onDismiss(a.id)} aria-label="Закрити">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Toast({ text, onClose, action }: { text: string; onClose: () => void; action?: { label: string; onClick: () => void } }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 7000);
    return () => window.clearTimeout(t);
  }, [text, onClose]);
  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 animate-fade-in items-center gap-3 rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-sm shadow-2xl">
      <span className="flex-1 text-slate-200">{text}</span>
      {action && (
        <button className="btn-ghost px-2 py-1 text-emerald-300" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button className="text-slate-500 hover:text-white" onClick={onClose} aria-label="Закрити">
        <X size={14} />
      </button>
    </div>
  );
}
