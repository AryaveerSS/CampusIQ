import { useState, useEffect, useRef } from 'react';
import { gmailApi, bucketsApi } from '@/lib/api';
import { RefreshCw, Download, Plus, Trash2, Reply, ChevronRight, Zap, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReplyModal from './ReplyModal';
import EmailViewModal from './EmailViewModal';
import clsx from 'clsx';

const DEFAULT_BUCKETS = [
  { name: 'Internships', icon: '💼', keywords: ['internship', 'intern', 'hiring', 'opportunity', 'apply'], color: '#8b5cf6' },
  { name: 'Assignments', icon: '📝', keywords: ['assignment', 'submission', 'deadline', 'due date'], color: '#f59e0b' },
  { name: 'Quizzes & Tests', icon: '📊', keywords: ['quiz', 'test', 'exam', 'announcement', 'marks'], color: '#ef4444' },
  { name: 'Interviews', icon: '🎯', keywords: ['interview', 'shortlisted', 'selected', 'round'], color: '#10b981' },
];

const AUTO_SYNC_INTERVAL_MS = 30000;   // poll every 30s when auto-sync is on

export default function EmailInbox({ gmailConnected }) {
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [emails, setEmails] = useState([]);
  const [replyEmail, setReplyEmail] = useState(null);   // email open in reply popup
  const [viewEmail, setViewEmail] = useState(null);     // email open in read popup
  const [syncing, setSyncing] = useState('');     // '' | 'new' | 'old'
  const [autoSync, setAutoSync] = useState(false);
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [newBucket, setNewBucket] = useState({ name: '', icon: '📧', keywords: '', color: '#3b82f6' });
  const [bucketError, setBucketError] = useState('');
  const [notice, setNotice] = useState('');

  // Refs so the polling interval always sees the latest values
  const selectedBucketRef = useRef(null);
  const autoBusyRef = useRef(false);

  useEffect(() => { selectedBucketRef.current = selectedBucket; }, [selectedBucket]);

  useEffect(() => { fetchBuckets(); }, []);
  useEffect(() => { if (selectedBucket) fetchEmails(selectedBucket.id); }, [selectedBucket]);

  // Restore auto-sync preference
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('campusiq_autosync') === '1') {
      setAutoSync(true);
    }
  }, []);

  async function fetchBuckets() {
    try {
      const data = await bucketsApi.list();
      setBuckets(data);
      // Keep current selection if still present, else select first
      setSelectedBucket(prev => {
        if (prev) {
          const still = data.find(b => b.id === prev.id);
          if (still) return still;
        }
        return data[0] || null;
      });
    } catch (e) { console.error(e); }
  }

  async function fetchEmails(bucketId) {
    try {
      const data = await gmailApi.emails({ bucket_id: bucketId });
      setEmails(data);
    } catch (e) { console.error(e); }
  }

  async function syncEmails(mode) {
    setSyncing(mode);
    setNotice('');
    try {
      const res = await gmailApi.sync(mode);
      if (selectedBucket) await fetchEmails(selectedBucket.id);
      const label = mode === 'old' ? 'older' : 'new';
      setNotice(`Synced ${res.synced} ${label} email${res.synced === 1 ? '' : 's'}.`);
    } catch (e) {
      setNotice('Sync failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setSyncing('');
    }
  }

  // Silent background sync used by auto-sync polling (no spinner, no clearing notices)
  async function backgroundSync() {
    if (autoBusyRef.current) return;        // don't overlap runs
    autoBusyRef.current = true;
    try {
      const res = await gmailApi.sync('new');
      const current = selectedBucketRef.current;
      if (current) await fetchEmails(current.id);
      if (res.synced > 0) {
        setNotice(`Auto-synced ${res.synced} new email${res.synced === 1 ? '' : 's'}.`);
      }
    } catch (e) {
      // stay quiet on transient polling errors
      console.error('Auto-sync error:', e.response?.data?.error || e.message);
    } finally {
      autoBusyRef.current = false;
    }
  }

  // Auto-sync polling loop
  useEffect(() => {
    if (!autoSync || !gmailConnected) return;
    backgroundSync();                                  // run once immediately
    const id = setInterval(backgroundSync, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, gmailConnected]);

  function toggleAutoSync() {
    setAutoSync(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('campusiq_autosync', next ? '1' : '0');
      }
      setNotice(next ? 'Auto-sync on — checking for new emails every 30s.' : 'Auto-sync off.');
      return next;
    });
  }

  async function addDefaultBuckets() {
    for (const b of DEFAULT_BUCKETS) {
      try { await bucketsApi.create(b); } catch { /* skip duplicates */ }
    }
    fetchBuckets();
  }

  async function createBucket() {
    setBucketError('');
    const name = newBucket.name.trim();
    const keywords = newBucket.keywords.split(',').map(k => k.trim()).filter(Boolean);
    if (!name) { setBucketError('Bucket name is required.'); return; }
    if (!keywords.length) { setBucketError('Add at least one keyword.'); return; }

    // Client-side duplicate guard (backend enforces too)
    if (buckets.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      setBucketError(`A bucket named "${name}" already exists.`);
      return;
    }

    try {
      await bucketsApi.create({ ...newBucket, name, keywords });
      setNewBucket({ name: '', icon: '📧', keywords: '', color: '#3b82f6' });
      setShowNewBucket(false);
      fetchBuckets();
    } catch (e) {
      setBucketError(e.response?.data?.error || 'Could not create bucket.');
    }
  }

  async function deleteBucket(bucket) {
    if (!confirm(`Delete the "${bucket.name}" bucket? Emails in it won't be deleted from Gmail.`)) return;
    try {
      await bucketsApi.delete(bucket.id);
      fetchBuckets();
    } catch (e) {
      setNotice('Delete failed: ' + (e.response?.data?.error || e.message));
    }
  }

  if (!gmailConnected) {
    return (
      <div className="glass-card p-8 text-center space-y-4">
        <div className="text-4xl">📧</div>
        <h3 className="font-semibold text-slate-200">Connect Gmail</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Connect your Gmail account to automatically categorize emails about internships, assignments, quizzes, and more.
        </p>
        <button
          onClick={async () => {
            const { url } = await gmailApi.authUrl();
            window.location.href = url;
          }}
          className="btn-primary mx-auto"
        >
          Connect Gmail Account
        </button>
      </div>
    );
  }

  const syncingNew = syncing === 'new';
  const syncingOld = syncing === 'old';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => syncEmails('new')} disabled={!!syncing}
          className={clsx('btn-primary text-xs py-2 px-3 flex items-center gap-1.5', !!syncing && 'opacity-50')}>
          <RefreshCw size={13} className={syncingNew ? 'animate-spin' : ''} />
          {syncingNew ? 'Syncing...' : 'Sync New'}
        </button>
        <button onClick={() => syncEmails('old')} disabled={!!syncing}
          className={clsx('btn-ghost text-xs py-2 px-3 flex items-center gap-1.5', !!syncing && 'opacity-50')}>
          <Download size={13} className={syncingOld ? 'animate-pulse' : ''} />
          {syncingOld ? 'Fetching...' : 'Sync Older'}
        </button>
        <button onClick={toggleAutoSync}
          className={clsx('text-xs py-2 px-3 flex items-center gap-1.5 rounded-lg border transition-all',
            autoSync
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'border-surface-border text-slate-400 hover:text-slate-200 hover:border-accent')}>
          <Zap size={13} className={autoSync ? 'fill-emerald-400' : ''} />
          {autoSync ? 'Auto-Sync On' : 'Auto-Sync'}
          {autoSync && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />}
        </button>
        <button onClick={() => { setShowNewBucket(true); setBucketError(''); }}
          className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5">
          <Plus size={13} /> New Bucket
        </button>
        {buckets.length === 0 && (
          <button onClick={addDefaultBuckets} className="btn-primary text-xs py-2 px-3 ml-auto">
            Add Default Buckets
          </button>
        )}
      </div>

      {/* Helper text for the two sync modes */}
      <p className="text-xs text-slate-600">
        <strong className="text-slate-500">Sync New</strong> fetches emails since your last sync.{' '}
        <strong className="text-slate-500">Sync Older</strong> backfills up to a year of history.
      </p>

      {notice && (
        <div className="glass-card p-3 text-xs text-slate-300 border border-accent/20 bg-accent/5">
          {notice}
        </div>
      )}

      {/* New bucket form */}
      {showNewBucket && (
        <div className="glass-card p-4 space-y-3 animate-slide-up">
          <p className="text-sm font-medium text-slate-300">Create Email Bucket</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-base" placeholder="Bucket name" value={newBucket.name}
              onChange={e => setNewBucket(b => ({ ...b, name: e.target.value }))} />
            <input className="input-base" placeholder="Icon (emoji)" value={newBucket.icon}
              onChange={e => setNewBucket(b => ({ ...b, icon: e.target.value }))} />
            <input className="input-base col-span-2"
              placeholder="Keywords (comma-separated): internship, hiring, apply"
              value={newBucket.keywords}
              onChange={e => setNewBucket(b => ({ ...b, keywords: e.target.value }))} />
          </div>
          {bucketError && <p className="text-xs text-red-400">{bucketError}</p>}
          <div className="flex gap-2">
            <button onClick={createBucket} className="btn-primary text-xs py-2 px-3">Create</button>
            <button onClick={() => { setShowNewBucket(false); setBucketError(''); }}
              className="btn-ghost text-xs py-2 px-3">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Bucket list */}
        <div className="lg:col-span-1 space-y-2">
          {buckets.map(b => (
            <div key={b.id}
              onClick={() => setSelectedBucket(b)}
              className={clsx(
                'group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left cursor-pointer',
                selectedBucket?.id === b.id
                  ? 'bg-accent/15 border border-accent/20 text-slate-200'
                  : 'text-slate-400 hover:bg-surface-raised hover:text-slate-200 border border-transparent'
              )}>
              <span className="text-base">{b.icon}</span>
              <span className="flex-1 truncate">{b.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteBucket(b); }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                title="Delete bucket">
                <Trash2 size={13} />
              </button>
              <ChevronRight size={13} className="text-slate-600" />
            </div>
          ))}
          {buckets.length === 0 && (
            <div className="glass-card p-6 text-center text-slate-600 text-sm">
              No buckets yet. Add default buckets or create your own.
            </div>
          )}
        </div>

        {/* Right: Email list */}
        <div className="lg:col-span-2 space-y-2">
          {!selectedBucket ? (
            <div className="glass-card p-8 text-center text-slate-600 text-sm">
              Select a bucket to see its emails.
            </div>
          ) : emails.length === 0 ? (
            <div className="glass-card p-8 text-center text-slate-600 text-sm">
              No emails in this bucket yet. Hit "Sync New" or "Sync Older" to fetch.
            </div>
          ) : (
            emails.map(email => (
              <div key={email.id}
                onClick={() => setViewEmail(email)}
                className="glass-card p-3 transition-all hover:border-accent/30 group cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-200 truncate">{email.from_name || email.from_email}</p>
                      {email.replied_at && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5 flex-shrink-0">
                          <CheckCircle2 size={10} /> Replied
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{email.subject}</p>
                    <p className="text-xs text-slate-600 truncate mt-1">{email.snippet}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <p className="text-xs text-slate-600 whitespace-nowrap">
                      {email.received_at ? formatDistanceToNow(new Date(email.received_at), { addSuffix: true }) : ''}
                    </p>
                    <button onClick={(e) => { e.stopPropagation(); setReplyEmail(email); }}
                      className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5">
                      <Reply size={12} /> Reply
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Read email popup */}
      {viewEmail && (
        <EmailViewModal
          email={viewEmail}
          onClose={() => setViewEmail(null)}
          onReply={(email) => { setViewEmail(null); setReplyEmail(email); }}
        />
      )}

      {/* Reply popup */}
      {replyEmail && (
        <ReplyModal
          email={replyEmail}
          onClose={() => setReplyEmail(null)}
          onSent={() => {
            setReplyEmail(null);
            setNotice('Reply sent.');
            if (selectedBucket) fetchEmails(selectedBucket.id);   // refresh to show Replied badge
          }}
        />
      )}
    </div>
  );
}
