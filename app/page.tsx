'use client';

import { useEffect, useState } from 'react';
import type { Domain } from '@/lib/supabase';

function StatusBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Unknown</span>;
  if (days < 0) return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-800 text-white">⚫ Expired</span>;
  if (days < 14) return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">🔴 Critical</span>;
  if (days < 30) return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">🟡 Warning</span>;
  return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">🟢 Safe</span>;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

type EditState = {
  valid_from: string;
  expiry_date: string;
  alert_email: string;
};

export default function Home() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // Add form
  const [newDomain, setNewDomain] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditState>({ valid_from: '', expiry_date: '', alert_email: '' });
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadDomains() {
    const res = await fetch('/api/domains');
    const data = await res.json();
    setDomains(data);
    setLoading(false);
  }

  useEffect(() => { loadDomains(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    setAddError('');
    const res = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: newDomain.trim().toLowerCase(),
        valid_from: validFrom || undefined,
        expiry_date: expiryDate || undefined,
        alert_email: alertEmail || undefined,
      }),
    });
    if (res.ok) {
      setNewDomain('');
      setValidFrom('');
      setExpiryDate('');
      setAlertEmail('');
      await loadDomains();
    } else {
      const data = await res.json();
      setAddError(data.error || 'Failed to add domain');
    }
    setAdding(false);
  }

  function startEdit(d: Domain) {
    setEditId(d.id);
    setEditFields({
      valid_from: d.valid_from ?? '',
      expiry_date: d.expiry_date ?? '',
      alert_email: d.alert_email ?? '',
    });
    setDeleteId(null);
  }

  async function handleSave(id: string) {
    setSaving(true);
    await fetch(`/api/domains/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editFields),
    });
    setEditId(null);
    setSaving(false);
    await loadDomains();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/domains/${id}`, { method: 'DELETE' });
    setDeleteId(null);
    await loadDomains();
  }

  async function handleCheckAll() {
    setChecking(true);
    await fetch('/api/check', { method: 'POST' });
    await loadDomains();
    setChecking(false);
  }

  const lastChecked = domains.reduce((latest, d) => {
    if (!d.last_checked) return latest;
    return !latest || d.last_checked > latest ? d.last_checked : latest;
  }, null as string | null);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🔒 CertWatch</h1>
          <p className="text-gray-500 mt-1">SSL certificate expiry monitor</p>
        </div>

        {/* Add Domain Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Add Domain</h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Domain <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="e.g. example.com"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={adding || !newDomain.trim() || !validFrom || !expiryDate || !alertEmail.trim()}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {adding ? 'Adding...' : '+ Add Domain'}
              </button>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Valid From <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Expiry Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Alert Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="notify@example.com"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={adding}
                  required
                />
              </div>
            </div>
          </form>
          {addError && <p className="text-red-500 text-sm mt-2">{addError}</p>}
        </div>

        {/* Dashboard */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">Tracked Domains</h2>
              {lastChecked && (
                <p className="text-xs text-gray-400 mt-0.5">Last checked: {formatDate(lastChecked)}</p>
              )}
            </div>
            <button
              onClick={handleCheckAll}
              disabled={checking || domains.length === 0}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {checking ? '⏳ Checking...' : '🔄 Check Now'}
            </button>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading...</div>
          ) : domains.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">No domains tracked yet. Add one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Domain</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valid From</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Days Left</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alert Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Checked</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {domains.map((d) => (
                    editId === d.id ? (
                      // Edit row
                      <tr key={d.id} className="bg-blue-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{d.domain}</td>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={editFields.valid_from}
                            onChange={(e) => setEditFields(f => ({ ...f, valid_from: e.target.value }))}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={editFields.expiry_date}
                            onChange={(e) => setEditFields(f => ({ ...f, expiry_date: e.target.value }))}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3">
                          <input
                            type="email"
                            value={editFields.alert_email}
                            onChange={(e) => setEditFields(f => ({ ...f, alert_email: e.target.value }))}
                            placeholder="default"
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex gap-2">
                            <button
                              onClick={() => handleSave(d.id)}
                              disabled={saving}
                              className="text-blue-600 text-xs font-medium hover:underline disabled:opacity-50"
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => setEditId(null)} className="text-gray-400 text-xs hover:underline">Cancel</button>
                          </span>
                        </td>
                      </tr>
                    ) : (
                      // Normal row
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4 font-medium text-gray-900">{d.domain}</td>
                        <td className="px-4 py-4 text-gray-600">{formatDate(d.valid_from)}</td>
                        <td className="px-4 py-4 text-gray-600">{formatDate(d.expiry_date)}</td>
                        <td className="px-4 py-4 text-gray-600">{d.days_remaining !== null ? `${d.days_remaining}d` : '—'}</td>
                        <td className="px-4 py-4"><StatusBadge days={d.days_remaining} /></td>
                        <td className="px-4 py-4 text-gray-500 text-xs">{d.alert_email || <span className="text-gray-300">default</span>}</td>
                        <td className="px-4 py-4 text-gray-400">{d.last_checked ? formatDate(d.last_checked) : '—'}</td>
                        <td className="px-4 py-4 text-right">
                          {deleteId === d.id ? (
                            <span className="inline-flex gap-2">
                              <button onClick={() => handleDelete(d.id)} className="text-red-600 text-xs font-medium hover:underline">Confirm</button>
                              <button onClick={() => setDeleteId(null)} className="text-gray-400 text-xs hover:underline">Cancel</button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-3">
                              <button onClick={() => startEdit(d)} className="text-blue-500 text-xs hover:underline">Edit</button>
                              <button onClick={() => { setDeleteId(d.id); setEditId(null); }} className="text-gray-400 text-xs hover:text-red-500 transition-colors">Remove</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
