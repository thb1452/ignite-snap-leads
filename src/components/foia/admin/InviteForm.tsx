import { useState } from 'react';
import { Copy, Check, Mail, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { FoiaInvite } from '@/types/foia';

function generateToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface InviteFormProps {
  adminId: string;
  onInviteCreated: () => void;
}

export function InviteForm({ adminId, onInviteCreated }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setGeneratedLink('');

    try {
      const token = generateToken();

      const { error: insertError } = await supabase.from('foia_invites').upsert(
        {
          email: email.toLowerCase().trim(),
          invited_by: adminId,
          token,
          accepted: false,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'email' }
      );

      if (insertError) throw insertError;

      const link = `${window.location.origin}/foia/login?token=${token}`;
      setGeneratedLink(link);
      setEmail('');
      onInviteCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Invite a Virtual Assistant</h2>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-4">
        <div className="flex-1">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="va@example.com"
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-60 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Generate Invite
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {generatedLink && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 text-sm font-medium mb-2">Invite link created!</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-green-200 rounded px-2 py-1.5 text-slate-700 truncate">
              {generatedLink}
            </code>
            <button
              onClick={copyLink}
              className="flex items-center gap-1 text-green-700 hover:text-green-900 text-sm font-medium"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-green-600 text-xs mt-2">Expires in 7 days. Share this link with the VA.</p>
        </div>
      )}
    </div>
  );
}

interface InviteListProps {
  invites: FoiaInvite[];
  loading: boolean;
}

export function InviteList({ invites, loading }: InviteListProps) {
  if (loading) return <div className="text-slate-500 text-sm py-4">Loading invites...</div>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">Pending Invites</h3>
      </div>
      {invites.length === 0 ? (
        <div className="px-6 py-8 text-center text-slate-400 text-sm">No pending invites</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Email</th>
              <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Created</th>
              <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Expires</th>
              <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invites.map((invite) => {
              const expired = new Date(invite.expires_at) < new Date();
              return (
                <tr key={invite.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-900">{invite.email}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(invite.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(invite.expires_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3">
                    {invite.accepted ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Accepted</span>
                    ) : expired ? (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Expired</span>
                    ) : (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
