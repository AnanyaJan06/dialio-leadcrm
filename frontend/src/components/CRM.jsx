import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSkeletonTheme, Skeleton } from './ui/AppSkeleton.jsx';
import InlineLoader from './ui/InlineLoader.jsx';
import { showErrorToast, showSuccessToast } from '../utils/toast.js';
import { BACKEND_URL } from '../config/api.js';

const LEAD_DISPOSITIONS = [
  'Quoted',
  'No Response',
  'Wrong Number',
  'Not Interested',
  'Price too high',
  'Part not available',
  'Ordered',
  'Already ordered',
];

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

const emptyFilters = {
  status: '',
  assignee: '',
  source: '',
  fromDate: '',
  toDate: '',
  search: '',
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

const formatDateTime = (value) => {
  if (!value) return 'Not scheduled';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';

  return date.toLocaleString();
};

function CRM() {
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [updatingLeadId, setUpdatingLeadId] = useState(null);
  const [noteLeadId, setNoteLeadId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [followUpLeadId, setFollowUpLeadId] = useState(null);
  const [followUpDrafts, setFollowUpDrafts] = useState({});
  const [submittingNoteId, setSubmittingNoteId] = useState(null);
  const [submittingFollowUpId, setSubmittingFollowUpId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const fetchLeads = useCallback(async (filtersToApply = appliedFilters) => {
    try {
      const params = new URLSearchParams();
      if (filtersToApply.status) params.set('status', filtersToApply.status);
      if (filtersToApply.assignee) params.set('assignee', filtersToApply.assignee);
      if (filtersToApply.source) params.set('source', filtersToApply.source);
      if (filtersToApply.fromDate) params.set('fromDate', filtersToApply.fromDate);
      if (filtersToApply.toDate) params.set('toDate', filtersToApply.toDate);
      if (filtersToApply.search) params.set('search', filtersToApply.search);

      const res = await fetch(`${BACKEND_URL}/api/leads${params.toString() ? `?${params.toString()}` : ''}`, {
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
  }, [appliedFilters, authHeaders]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/users`, {
        headers: authHeaders,
      });
      const data = await res.json();

      if (res.ok) {
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load users', error);
    }
  }, [authHeaders]);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data);
      }
    } catch (error) {
      console.error('Failed to load current user', error);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchLeads(appliedFilters);
    fetchUsers();
    fetchCurrentUser();
  }, [appliedFilters, fetchCurrentUser, fetchLeads, fetchUsers]);

  useEffect(() => {
    const handleRefreshLeads = () => {
      fetchLeads(appliedFilters);
    };

    window.addEventListener('refreshLeads', handleRefreshLeads);
    return () => window.removeEventListener('refreshLeads', handleRefreshLeads);
  }, [appliedFilters, fetchLeads]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleApplyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
  };

  const handleResetFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
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
      showSuccessToast(currentUser?.role === 'admin' ? 'Lead created and assigned to the next active agent' : 'Lead created successfully');
      fetchLeads(appliedFilters);
    } catch (error) {
      showErrorToast(error.message || 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  };

  const updateLeadDisposition = async (leadId, disposition) => {
    try {
      setUpdatingLeadId(leadId);
      const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/disposition`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ disposition }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to update lead status');

      setLeads((current) => current.map((lead) => (
        lead._id === leadId ? data.lead : lead
      )));
      showSuccessToast('Lead status updated');
    } catch (error) {
      showErrorToast(error.message || 'Failed to update lead status');
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const addLeadNote = async (leadId) => {
    const note = (noteDrafts[leadId] || '').trim();
    if (!note) {
      showErrorToast('Please enter a note before saving');
      return;
    }

    try {
      setSubmittingNoteId(leadId);
      const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to save note');

      setLeads((current) => current.map((lead) => (
        lead._id === leadId ? data.lead : lead
      )));
      setNoteDrafts((current) => ({ ...current, [leadId]: '' }));
      setNoteLeadId(null);
      showSuccessToast('Note added');
    } catch (error) {
      showErrorToast(error.message || 'Failed to save note');
    } finally {
      setSubmittingNoteId(null);
    }
  };

  const saveFollowUp = async (leadId) => {
    const draft = followUpDrafts[leadId] || {};
    if (!draft.followUpAt) {
      showErrorToast('Please choose a reminder date');
      return;
    }

    try {
      setSubmittingFollowUpId(leadId);
      const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/follow-up`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          followUpAt: draft.followUpAt,
          followUpNote: draft.followUpNote || '',
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to save follow-up');

      setLeads((current) => current.map((lead) => (
        lead._id === leadId ? data.lead : lead
      )));
      setFollowUpDrafts((current) => ({ ...current, [leadId]: {} }));
      setFollowUpLeadId(null);
      showSuccessToast('Follow-up scheduled');
    } catch (error) {
      showErrorToast(error.message || 'Failed to save follow-up');
    } finally {
      setSubmittingFollowUpId(null);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">CRM Leads</h2>
          <p className="text-sm text-gray-400">Review leads, assign follow-ups, and keep notes in one place.</p>
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
            <input type="datetime-local" name="followUpAt" value={form.followUpAt} onChange={handleChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
            <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes" className="min-h-24 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white md:col-span-2" />
            <textarea name="followUpNote" value={form.followUpNote} onChange={handleChange} placeholder="Follow-up note" className="min-h-20 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white md:col-span-2" />
            <button type="submit" disabled={saving} className="rounded-xl bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:opacity-70 md:col-span-2">
              {saving ? <InlineLoader label="Saving" /> : 'Save Lead'}
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            {currentUser?.role === 'admin' ? 'Admin-created leads are assigned to the next active agent in a round-robin rotation.' : 'Your leads stay assigned to you.'}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <form onSubmit={handleApplyFilters} className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <input
            type="text"
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Search leads"
            className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white"
          />
          <select name="status" value={filters.status} onChange={handleFilterChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white">
            <option value="">All statuses</option>
            {LEAD_DISPOSITIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select name="assignee" value={filters.assignee} onChange={handleFilterChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white">
            <option value="">All assignees</option>
            {users.map((user) => <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>)}
          </select>
          <select name="source" value={filters.source} onChange={handleFilterChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white">
            <option value="">All sources</option>
            <option value="manual">Manual</option>
            <option value="website">Website</option>
            <option value="facebook">Facebook</option>
            <option value="other">Other</option>
          </select>
          <input type="date" name="fromDate" value={filters.fromDate} onChange={handleFilterChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
          <input type="date" name="toDate" value={filters.toDate} onChange={handleFilterChange} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white" />
          <div className="flex gap-2 md:col-span-3 xl:col-span-6">
            <button type="submit" className="rounded-xl bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#047857]">Apply Filters</button>
            <button type="button" onClick={handleResetFilters} className="rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-gray-600 hover:text-white">Reset</button>
          </div>
        </form>
      </div>

      <div className="min-h-0 flex-1 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        {loading ? (
          <CRMPageSkeleton />
        ) : leads.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No leads found.</p>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => {
              const isFollowUpDue = lead.followUpAt && new Date(lead.followUpAt) <= new Date();
              const isFollowUpSoon = lead.followUpAt && new Date(lead.followUpAt) <= new Date(Date.now() + 24 * 60 * 60 * 1000);

              return (
                <div key={lead._id} className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-white">{lead.name || 'Unnamed lead'}</h4>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">{lead.disposition || 'Quoted'}</span>
                        {isFollowUpDue && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">Follow-up due</span>}
                        {isFollowUpSoon && !isFollowUpDue && <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300">Reminder soon</span>}
                      </div>
                      <div className="mt-2 grid gap-1 text-sm text-gray-400 sm:grid-cols-2 xl:grid-cols-4">
                        <p><span className="text-gray-500">Phone:</span> {lead.phone || '-'}</p>
                        <p><span className="text-gray-500">Source:</span> {lead.source || 'manual'}</p>
                        <p><span className="text-gray-500">Assignee:</span> {lead.assignedTo?.name || 'Unassigned'}</p>
                        <p><span className="text-gray-500">Created:</span> {new Date(lead.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-400">
                        <p><span className="text-gray-500">Part requested:</span> {lead.partRequested || '-'}</p>
                        <p><span className="text-gray-500">Make / Model:</span> {lead.make || '-'} / {lead.model || '-'}</p>
                        <p><span className="text-gray-500">Follow-up:</span> {formatDateTime(lead.followUpAt)}{lead.followUpNote ? ` • ${lead.followUpNote}` : ''}</p>
                        {lead.notes && <p><span className="text-gray-500">Notes:</span> {lead.notes}</p>}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 lg:w-72">
                      <select
                        aria-label={`Status for ${lead.name || 'lead'}`}
                        value={lead.disposition || 'Quoted'}
                        disabled={updatingLeadId === lead._id}
                        onChange={(event) => updateLeadDisposition(lead._id, event.target.value)}
                        className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm font-medium text-emerald-300 outline-none disabled:cursor-wait disabled:opacity-60"
                      >
                        {LEAD_DISPOSITIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          if (noteLeadId === lead._id) {
                            setNoteLeadId(null);
                            return;
                          }
                          setNoteLeadId(lead._id);
                          setFollowUpLeadId(null);
                        }}
                        className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-600"
                      >
                        {noteLeadId === lead._id ? 'Hide note editor' : 'Add note'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (followUpLeadId === lead._id) {
                            setFollowUpLeadId(null);
                            return;
                          }
                          setFollowUpLeadId(lead._id);
                          setNoteLeadId(null);
                          setFollowUpDrafts((current) => ({
                            ...current,
                            [lead._id]: {
                              followUpAt: lead.followUpAt ? new Date(lead.followUpAt).toISOString().slice(0, 16) : '',
                              followUpNote: lead.followUpNote || '',
                            },
                          }));
                        }}
                        className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-200 transition hover:border-sky-400"
                      >
                        {followUpLeadId === lead._id ? 'Hide reminder editor' : 'Schedule follow-up'}
                      </button>
                    </div>
                  </div>

                  {noteLeadId === lead._id && (
                    <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900 p-3">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Add note</label>
                      <textarea
                        value={noteDrafts[lead._id] || ''}
                        onChange={(event) => setNoteDrafts((current) => ({ ...current, [lead._id]: event.target.value }))}
                        placeholder="Add context or next step"
                        className="min-h-24 w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white"
                      />
                      <button
                        type="button"
                        onClick={() => addLeadNote(lead._id)}
                        disabled={submittingNoteId === lead._id}
                        className="mt-2 rounded-xl bg-[#059669] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:opacity-70"
                      >
                        {submittingNoteId === lead._id ? <InlineLoader label="Saving" /> : 'Save note'}
                      </button>
                    </div>
                  )}

                  {followUpLeadId === lead._id && (
                    <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900 p-3">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Follow-up reminder</label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          type="datetime-local"
                          value={followUpDrafts[lead._id]?.followUpAt || ''}
                          onChange={(event) => setFollowUpDrafts((current) => ({
                            ...current,
                            [lead._id]: {
                              ...(current[lead._id] || {}),
                              followUpAt: event.target.value,
                            },
                          }))}
                          className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white"
                        />
                        <textarea
                          value={followUpDrafts[lead._id]?.followUpNote || ''}
                          onChange={(event) => setFollowUpDrafts((current) => ({
                            ...current,
                            [lead._id]: {
                              ...(current[lead._id] || {}),
                              followUpNote: event.target.value,
                            },
                          }))}
                          placeholder="Reminder note"
                          className="min-h-20 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => saveFollowUp(lead._id)}
                        disabled={submittingFollowUpId === lead._id}
                        className="mt-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-70"
                      >
                        {submittingFollowUpId === lead._id ? <InlineLoader label="Saving" /> : 'Save reminder'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default CRM;
