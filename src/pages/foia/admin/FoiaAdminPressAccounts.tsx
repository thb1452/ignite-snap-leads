import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Save, X, Loader2, Newspaper } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { supabase } from '@/integrations/supabase/client';
import type { PressAccount } from '@/types/foia';
import { cn } from '@/lib/utils';

const db = supabase as any;

interface PressAccountFormData {
  name: string;
  domain: string;
  email: string;
  notes: string;
  is_active: boolean;
}

const emptyForm: PressAccountFormData = {
  name: '',
  domain: '',
  email: '',
  notes: '',
  is_active: true,
};

export default function FoiaAdminPressAccounts() {
  const [accounts, setAccounts] = useState<PressAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<PressAccountFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchAccounts = async () => {
    setLoading(true);
    const { data } = await db
      .from('press_accounts')
      .select('*')
      .order('name');
    setAccounts((data || []) as PressAccount[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleEdit = (account: PressAccount) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      domain: account.domain,
      email: account.email ?? '',
      notes: account.notes ?? '',
      is_active: account.is_active,
    });
    setError('');
  };

  const handleNew = () => {
    setEditingId('new');
    setForm(emptyForm);
    setError('');
  };

  const handleCancel = () => {
    setEditingId(null);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.domain.trim()) {
      setError('Name and domain are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingId === 'new') {
        const { error: e } = await db.from('press_accounts').insert({
          name: form.name.trim(),
          domain: form.domain.trim().toLowerCase(),
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
          is_active: form.is_active,
        });
        if (e) throw e;
      } else {
        const { error: e } = await db
          .from('press_accounts')
          .update({
            name: form.name.trim(),
            domain: form.domain.trim().toLowerCase(),
            email: form.email.trim() || null,
            notes: form.notes.trim() || null,
            is_active: form.is_active,
          })
          .eq('id', editingId!);
        if (e) throw e;
      }

      setEditingId(null);
      await fetchAccounts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this press account? This may affect rotation history.')) return;
    await db.from('press_accounts').delete().eq('id', id);
    await fetchAccounts();
  };

  const handleToggleActive = async (account: PressAccount) => {
    await db
      .from('press_accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id);
    await fetchAccounts();
  };

  return (
    <FoiaLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Press Accounts</h1>
            <p className="text-slate-500 text-sm mt-1">Manage the {accounts.filter(a => a.is_active).length} active press accounts used for FOIA submissions</p>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </button>
        </div>

        {editingId === 'new' && (
          <div className="bg-white rounded-xl border border-blue-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">New Press Account</h3>
            <AccountForm form={form} setForm={setForm} error={error} saving={saving} onSave={handleSave} onCancel={handleCancel} />
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
            <Newspaper className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p>No press accounts yet. Add your first account above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className={cn(
                'bg-white rounded-xl border overflow-hidden transition-colors',
                account.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'
              )}>
                {editingId === account.id ? (
                  <div className="p-6">
                    <AccountForm form={form} setForm={setForm} error={error} saving={saving} onSave={handleSave} onCancel={handleCancel} />
                  </div>
                ) : (
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm">
                      {account.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{account.name}</span>
                        {!account.is_active && (
                          <span className="text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{account.domain}</p>
                      {account.email && <p className="text-xs text-slate-400">{account.email}</p>}
                      {account.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{account.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(account)}
                        className={cn(
                          'text-xs px-3 py-1 rounded-full border font-medium transition-colors',
                          account.is_active
                            ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                            : 'border-green-300 text-green-700 hover:bg-green-50'
                        )}
                      >
                        {account.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => handleEdit(account)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(account.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </FoiaLayout>
  );
}

function AccountForm({
  form,
  setForm,
  error,
  saving,
  onSave,
  onCancel,
}: {
  form: PressAccountFormData;
  setForm: React.Dispatch<React.SetStateAction<PressAccountFormData>>;
  error: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Civic Records"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Domain *</label>
          <input
            value={form.domain}
            onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            placeholder="civicrecords.it.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="contact@civicrecords.it.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Optional notes"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          className="rounded"
        />
        <label htmlFor="is_active" className="text-sm text-slate-700">Active (include in rotations)</label>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button onClick={onCancel} className="flex items-center gap-1.5 border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-50">
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
