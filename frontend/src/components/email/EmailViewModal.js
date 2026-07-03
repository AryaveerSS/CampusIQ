import { useState, useEffect } from 'react';
import { gmailApi } from '@/lib/api';
import { X, Reply, CheckCircle2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

export default function EmailViewModal({ email, onClose, onReply }) {
    const [data, setData] = useState(null);   // { body_text, body_html, gmail_link }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const res = await gmailApi.body(email.id);
                if (!cancelled) setData(res);
            } catch (e) {
                if (!cancelled) setError(e.response?.data?.error || 'Could not load the email.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [email.id]);

    const gmailLink = data?.gmail_link ||
        `https://mail.google.com/mail/u/0/#all/${email.gmail_message_id}`;

    // Wrap HTML so it renders on a readable light background inside the iframe
    const iframeDoc = data?.body_html
        ? `<!DOCTYPE html><html><head><meta charset="utf-8">
       <base target="_blank">
       <style>
         body { font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a;
                background: #fff; margin: 0; padding: 16px; word-break: break-word; }
         img { max-width: 100%; height: auto; }
         a { color: #2563eb; }
         table { max-width: 100%; }
       </style></head><body>${data.body_html}</body></html>`
        : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}>
            <div className="glass-card w-full max-w-3xl max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-border">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-100 truncate">{email.subject || '(no subject)'}</h3>
                            {email.replied_at && (
                                <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 flex-shrink-0">
                                    <CheckCircle2 size={11} /> Replied
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                            {email.from_name} &lt;{email.from_email}&gt;
                        </p>
                        {email.received_at && (
                            <p className="text-xs text-slate-600 mt-0.5">
                                {format(new Date(email.received_at), 'PPp')}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1 flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="space-y-2 animate-pulse-soft px-5 py-4">
                            <div className="h-3 bg-surface-raised rounded w-3/4" />
                            <div className="h-3 bg-surface-raised rounded w-full" />
                            <div className="h-3 bg-surface-raised rounded w-5/6" />
                            <div className="h-3 bg-surface-raised rounded w-2/3" />
                        </div>
                    ) : error ? (
                        <p className="text-sm text-red-400 px-5 py-4">{error}</p>
                    ) : iframeDoc ? (
                        <iframe
                            title="Email content"
                            srcDoc={iframeDoc}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            className="w-full bg-white rounded-b-none"
                            style={{ height: '60vh', border: 'none' }}
                        />
                    ) : (
                        <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed px-5 py-4">
                            {data?.body_text || '(No readable content. Try opening it in Gmail.)'}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-surface-border flex items-center justify-between gap-2">
                    <a href={gmailLink} target="_blank" rel="noopener noreferrer"
                        className="btn-ghost text-xs py-2 px-4 flex items-center gap-1.5">
                        <ExternalLink size={13} /> Open in Gmail
                    </a>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="btn-ghost text-xs py-2 px-4">Close</button>
                        <button onClick={() => onReply(email)} className="btn-primary text-xs py-2 px-4">
                            <Reply size={13} /> {email.replied_at ? 'Reply Again' : 'Reply'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
