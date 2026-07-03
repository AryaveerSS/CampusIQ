import DashboardLayout from '@/components/layout/DashboardLayout';
import EmailInbox from '@/components/email/EmailInbox';
import { gmailApi } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function EmailsPage() {
  const [gmailConnected, setGmailConnected] = useState(null);

  useEffect(() => {
    gmailApi.status()
      .then(res => setGmailConnected(res.connected))
      .catch(() => setGmailConnected(false));
  }, []);

  return (
    <DashboardLayout title="Smart Inbox">
      <div className="space-y-2 mb-4">
        <p className="text-sm text-slate-500">
          Your college emails — automatically sorted into Internships, Assignments, Quizzes, and more.
        </p>
      </div>

      {gmailConnected === null ? (
        <div className="glass-card p-8 text-center text-slate-600 text-sm animate-pulse-soft">
          Checking Gmail connection...
        </div>
      ) : (
        <EmailInbox gmailConnected={gmailConnected} />
      )}
    </DashboardLayout>
  );
}
