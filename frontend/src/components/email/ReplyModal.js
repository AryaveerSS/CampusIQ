import { useState } from 'react';
import { aiApi } from '@/lib/api';
import { Wand2, Send, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

export default function ReplyModal({ email, onClose, onSent }) {
    const [draft, setDraft] = useState(email.ai_reply_draft || '');
    const [aiLoading, setAiLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    async function generateDraft() {
        setAiLoading(true);
        setError('');
        try {
            const res = await aiApi.draftReply(email.id);
            setDraft(res.draft);
        } catch (e) {
            setError(e.response?.data?.error || 'AI draft failed');
        } finally {
            setAiLoading(false);
        }
    }

    async function send() {
        if (!draft.trim()) return;
        setSending(true);
        setError('');
        try {
            await aiApi.sendReply(email.id, draft);
            onSent?.();
        } catch (e) {
            setError(e.response?.data?.error || 'Send failed');
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}>
            <div className="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-border">
                    <div className="min-w-0">
                        <h3 className="font-semibold text-slate-100 truncate">{email.subject || '(no subject)'}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                            From: {email.from_name} &lt;{email.from_email}&gt;
                            {email.received_at && (
                                <span className="text-slate-600"> · {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}</span>
                            )}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1 flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
                    <div>
                        <p className="text-xs font-medium text-slate-500 mb-1.5">Original message</p>
                        <p className="text-sm text-slate-400 bg-surface-raised rounded-lg p-3 whitespace-pre-wrap">
                            {email.snippet}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-500">Your reply</p>
                            <button onClick={generateDraft} disabled={aiLoading}
                                className={clsx('btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5', aiLoading && 'opacity-50')}>
                                <Wand2 size={12} className={aiLoading ? 'animate-pulse' : ''} />
                                {aiLoading ? 'Generating...' : 'Generate with AI'}
                            </button>
                        </div>
                        <textarea
                            className="input-base min-h-40 resize-y"
                            placeholder="Write your reply, or generate one with AI and edit it before sending."
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                        />
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-surface-border flex items-center justify-end gap-2">
                    <button onClick={onClose} className="btn-ghost text-xs py-2 px-4">Cancel</button>
                    <button onClick={send} disabled={sending || !draft.trim()}
                        className={clsx('btn-primary text-xs py-2 px-4', (sending || !draft.trim()) && 'opacity-50')}>
                        <Send size={13} /> {sending ? 'Sending...' : 'Send Reply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
