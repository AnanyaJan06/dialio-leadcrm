import { useCallback, useEffect, useState } from 'react';
import { AppSkeletonTheme, Skeleton } from './ui/AppSkeleton.jsx';
import InlineLoader from './ui/InlineLoader.jsx';
import { showErrorToast, showSuccessToast } from '../utils/toast.js';
import { BACKEND_URL } from '../config/api.js';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  zip: '',
  partRequested: '',
  make: '',
  model: '',
  year: '',
  yearMakeModel: '',
  disposition: 'Quoted',
  notes: '',
  source: 'manual',
  followUpAt: '',
  followUpNote: '',
};

function CRMPageSkeleton() {
  return (
    <AppSkeletonTheme>
      <div className="space-y-4" role="status" aria-label="Loading leads">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <Skeleton width={120} height={16} />
          <Skeleton width="70%" height={12} className="mt-2 block" />
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} height={40} className="mt-2 block" />
          ))}
        </div>
      </div>
    </AppSkeletonTheme>
  );
}

function CRM() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [searchTerm, setSearchTerm] = useState('');

  const authHeaders = {
    Authorization: `Bearer ${localStorage.getItem('token')}`
  };

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/leads`, {
        headers: authHeaders,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to load leads');
      setLeads(Array.isArray(data) ? data : []);
    } catch (error) {
      showErrorToast(error.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      showErrorToast('Name, email, and phone are required');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${BACKEND_URL}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create lead');

      setForm(emptyForm);
      setShowCreateForm(false);
      showSuccessToast('Lead created successfully');
      fetchLeads();
    } catch (error) {
      showErrorToast(error.message || 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  };

  const filteredLeads = leads.filter((lead) => {
    const term = searchTerm.toLowerCase();
    return (
      String(lead.name || '').toLowerCase().includes(term)
      || String(lead.phone || '').toLowerCase().includes(term)
      || String(lead.email || '').toLowerCase().includes(term)
      || String(lead.partRequested || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">CRM Leads</h2>
          <p className="text-sm text-gray-400">Review leads and add new opportunities.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((current) => !current)}
          className="inline-flex items-center justify-center rounded-xl bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#047857]"
        >
          {showCreateForm ? 'Close Form' : 'Create Lead'}
        </button>
      </div>

      {showCreateForm && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Create Lead</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" required />
            <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" required />
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" required />
            <input name="zip" value={form.zip} onChange={handleChange} placeholder="ZIP" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <input name="partRequested" value={form.partRequested} onChange={handleChange} placeholder="Part Requested" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <input name="make" value={form.make} onChange={handleChange} placeholder="Make" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <input name="model" value={form.model} onChange={handleChange} placeholder="Model" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <input name="year" value={form.year} onChange={handleChange} placeholder="Year" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <input name="yearMakeModel" value={form.yearMakeModel} onChange={handleChange} placeholder="Year / Make / Model" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <select name="disposition" value={form.disposition} onChange={handleChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white">
              <option value="Quoted">Quoted</option>
              <option value="No Response">No Response</option>
              <option value="Wrong Number">Wrong Number</option>
              <option value="Not Interested">Not Interested</option>
              <option value="Price too high">Price too high</option>
              <option value="Part not available">Part not available</option>
              <option value="Ordered">Ordered</option>
              <option value="Already ordered">Already ordered</option>
            </select>
            <select name="source" value={form.source} onChange={handleChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white">
              <option value="manual">Manual</option>
              <option value="website">Website</option>
              <option value="facebook">Facebook</option>
              <option value="other">Other</option>
            </select>
            <input name="followUpAt" type="datetime-local" value={form.followUpAt} onChange={handleChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <input name="followUpNote" value={form.followUpNote} onChange={handleChange} placeholder="Follow-Up Note" className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes" className="min-h-24 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white md:col-span-2" />
            <button type="submit" disabled={saving} className="rounded-xl bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:opacity-70 md:col-span-2">
              {saving ? <InlineLoader label="Saving" /> : 'Save Lead'}
            </button>
          </form>
        </div>
      )}

      <div className="min-h-0 flex-1 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-white">Lead List</h3>
          <input
            type="text"
            placeholder="Search leads"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white sm:w-64"
          />
        </div>

        {loading ? (
          <CRMPageSkeleton />
        ) : filteredLeads.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No leads found.</p>
        ) : (
          <div className="overflow-auto thin-scrollbar">
            <div className="mb-2 hidden min-w-[980px] grid-cols-[1.2fr_1fr_1.3fr_0.9fr_0.6fr_0.9fr_0.7fr_0.8fr] gap-3 rounded-xl border border-gray-800 bg-gray-950 px-4 py-2 text-[11px] font-semibold uppercase text-gray-500 lg:grid">
              <span>Name</span>
              <span>Phone</span>
              <span>Part Requested</span>
              <span>Make</span>
              <span>Year</span>
              <span>Model</span>
              <span>ZIP</span>
              <span>Status</span>
            </div>
            {filteredLeads.map((lead) => (
              <div
                key={lead._id}
                className="mb-2 grid min-w-[980px] grid-cols-[1.2fr_1fr_1.3fr_0.9fr_0.6fr_0.9fr_0.7fr_0.8fr] items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm transition hover:border-gray-700 hover:bg-gray-900"
              >
                <span className="truncate font-semibold text-white">{lead.name || 'Unnamed lead'}</span>
                <span className="truncate text-gray-300">{lead.phone || '-'}</span>
                <span className="truncate text-gray-300">{lead.partRequested || '-'}</span>
                <span className="truncate text-gray-300">{lead.make || '-'}</span>
                <span className="truncate text-gray-300">{lead.year || '-'}</span>
                <span className="truncate text-gray-300">{lead.model || '-'}</span>
                <span className="truncate text-gray-300">{lead.zip || '-'}</span>
                <span className="w-fit rounded-full bg-emerald-600/20 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                    {lead.disposition || 'Quoted'}
                  </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CRM;
