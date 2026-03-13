'use client';

import { useEffect, useState } from 'react';
import type { Domain } from '@/lib/supabase';

type Status = 'all' | 'critical' | 'warning' | 'safe' | 'expired';
type SortKey = 'domain' | 'days_remaining' | 'expiry_date';

function getStatus(days: number | null): Status {
  if (days === null) return 'safe';
  if (days < 0) return 'expired';
  if (days < 14) return 'critical';
  if (days < 30) return 'warning';
  return 'safe';
}

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

type EditState = { valid_from: string; expiry_date: string; alert_email: string; notes: string };

export default function Home() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // Add form
  const [newDomain, setNewDomain] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditState>({ valid_from: '', expiry_date: '', alert_email: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Sort & filter
  const [filterStatus, setFilterStatus] = useState<Status>('all');
  const [sortKey, setSortKey] = useState<SortKey>('days_remaining');
  const [sortAsc, setSortAsc] = useState(true);

  async function loadDomains() {
    const res = await fetch('/api/domains');
    const data = await res.json();
    setDomains(data);
    setLoading(false);
  }

  useEffect(() => { loadDomains(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError('');
    const res = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: newDomain.trim().toLowerCase(),
        valid_from: validFrom,
        expiry_date: expiryDate,
        alert_email: alertEmail,
        notes: notes || undefined,
      }),
    });
    if (res.ok) {
      setNewDomain(''); setValidFrom(''); setExpiryDate(''); setAlertEmail(''); setNotes('');
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
      notes: d.notes ?? '',
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

  async function toggleRenewal(d: Domain) {
    await fetch(`/api/domains/${d.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renewal_requested: !d.renewal_requested }),
    });
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

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function exportCSV() {
    const headers = ['Domain', 'Valid From', 'Expiry Date', 'Days Left', 'Status', 'Renewal Requested', 'Alert Email', 'Notes', 'Last Checked'];
    const rows = domains.map(d => [
      d.domain,
      d.valid_from ?? '',
      d.expiry_date ?? '',
      d.days_remaining ?? '',
      getStatus(d.days_remaining),
      d.renewal_requested ? 'Yes' : 'No',
      d.alert_email ?? '',
      d.notes ?? '',
      d.last_checked ? new Date(d.last_checked).toLocaleString() : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'certwatch-export.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // Filter
  const filtered = domains.filter(d => filterStatus === 'all' || getStatus(d.days_remaining) === filterStatus);

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av: number | string, bv: number | string;
    if (sortKey === 'days_remaining') { av = a.days_remaining ?? 9999; bv = b.days_remaining ?? 9999; }
    else if (sortKey === 'expiry_date') { av = a.expiry_date ?? ''; bv = b.expiry_date ?? ''; }
    else { av = a.domain; bv = b.domain; }
    return sortAsc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
  });

  // Stats
  const stats = { critical: 0, warning: 0, safe: 0, expired: 0 };
  domains.forEach(d => { const s = getStatus(d.days_remaining); if (s in stats) stats[s as keyof typeof stats]++; });

  const lastChecked = domains.reduce((latest, d) => {
    if (!d.last_checked) return latest;
    return !latest || d.last_checked > latest ? d.last_checked : latest;
  }, null as string | null);

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ' ↕';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🔒 CertWatch</h1>
          <p className="text-gray-500 mt-1">SSL certificate expiry monitor</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Critical', count: stats.critical, color: 'bg-red-50 border-red-200 text-red-700', filter: 'critical' as Status },
            { label: 'Warning', count: stats.warning, color: 'bg-yellow-50 border-yellow-200 text-yellow-700', filter: 'warning' as Status },
            { label: 'Safe', count: stats.safe, color: 'bg-green-50 border-green-200 text-green-700', filter: 'safe' as Status },
            { label: 'Expired', count: stats.expired, color: 'bg-gray-100 border-gray-300 text-gray-700', filter: 'expired' as Status },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setFilterStatus(filterStatus === s.filter ? 'all' : s.filter)}
              className={`border rounded-xl p-4 text-left transition-all ${s.color} ${filterStatus === s.filter ? 'ring-2 ring-offset-1 ring-blue-400' : 'hover:opacity-80'}`}
            >
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Add Domain Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Add Domain</h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Domain <span className="text-red-500">*</span></label>
                <input type="text" value={newDomain} onChange={e => setNewDomain(e.target.value)}
                  placeholder="e.g. example.com" required disabled={adding}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Valid From <span className="text-red-500">*</span></label>
                <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                  required disabled={adding}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Expiry Date <span className="text-red-500">*</span></label>
                <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                  required disabled={adding}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Alert Email <span className="text-red-500">*</span></label>
                <input type="email" value={alertEmail} onChange={e => setAlertEmail(e.target.value)}
                  placeholder="notify@example.com" required disabled={adding}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Owned by infra team, Jira: INF-123" disabled={adding}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit"
                disabled={adding || !newDomain.trim() || !validFrom || !expiryDate || !alertEmail.trim()}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                {adding ? 'Adding...' : '+ Add Domain'}
              </button>
            </div>
          </form>
          {addError && <p className="text-red-500 text-sm mt-2">{addError}</p>}
        </div>

        {/* Dashboard */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">
                Tracked Domains
                {filterStatus !== 'all' && <span className="ml-2 text-xs font-normal text-blue-500">— filtered by {filterStatus}</span>}
              </h2>
              {lastChecked && <p className="text-xs text-gray-400 mt-0.5">Last checked: {formatDate(lastChecked)}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={exportCSV} disabled={domains.length === 0}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
                ⬇ Export CSV
              </button>
              <button onClick={handleCheckAll} disabled={checking || domains.length === 0}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
                {checking ? '⏳ Checking...' : '🔄 Check Now'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading...</div>
          ) : sorted.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              {domains.length === 0 ? 'No domains tracked yet. Add one above.' : 'No domains match the current filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => handleSort('domain')} className="hover:text-gray-800">Domain<SortIcon k="domain" /></button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valid From</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => handleSort('expiry_date')} className="hover:text-gray-800">Expiry Date<SortIcon k="expiry_date" /></button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => handleSort('days_remaining')} className="hover:text-gray-800">Days Left<SortIcon k="days_remaining" /></button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Renewal</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Alert Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Checked</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sorted.map(d => (
                    editId === d.id ? (
                      <tr key={d.id} className="bg-blue-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{d.domain}</td>
                        <td className="px-4 py-3">
                          <input type="date" value={editFields.valid_from} onChange={e => setEditFields(f => ({ ...f, valid_from: e.target.value }))}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="date" value={editFields.expiry_date} onChange={e => setEditFields(f => ({ ...f, expiry_date: e.target.value }))}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3">
                          <input type="email" value={editFields.alert_email} onChange={e => setEditFields(f => ({ ...f, alert_email: e.target.value }))}
                            placeholder="email" className="border border-gray-300 rounded px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="text" value={editFields.notes} onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                            placeholder="notes" className="border border-gray-300 rounded px-2 py-1 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-3 text-gray-400">—</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex gap-2">
                            <button onClick={() => handleSave(d.id)} disabled={saving}
                              className="text-blue-600 text-xs font-medium hover:underline disabled:opacity-50">
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => setEditId(null)} className="text-gray-400 text-xs hover:underline">Cancel</button>
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${d.check_error ? 'bg-orange-50' : ''}`}>
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900">{d.domain}</div>
                          {d.check_error && <div className="text-xs text-orange-500 mt-0.5">⚠ {d.check_error}</div>}
                        </td>
                        <td className="px-4 py-4 text-gray-600">{formatDate(d.valid_from)}</td>
                        <td className="px-4 py-4 text-gray-600">{formatDate(d.expiry_date)}</td>
                        <td className="px-4 py-4 text-gray-600">{d.days_remaining !== null ? `${d.days_remaining}d` : '—'}</td>
                        <td className="px-4 py-4"><StatusBadge days={d.days_remaining} /></td>
                        <td className="px-4 py-4">
                          <button onClick={() => toggleRenewal(d)}
                            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${d.renewal_requested ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                            {d.renewal_requested ? '✓ Requested' : 'Not yet'}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-gray-500 text-xs">{d.alert_email || '—'}</td>
                        <td className="px-4 py-4 text-gray-400 text-xs max-w-[150px] truncate" title={d.notes ?? ''}>{d.notes || '—'}</td>
                        <td className="px-4 py-4 text-gray-400 text-xs">{d.last_checked ? formatDate(d.last_checked) : '—'}</td>
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
