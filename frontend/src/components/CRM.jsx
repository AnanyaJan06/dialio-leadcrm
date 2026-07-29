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

const canUsePhone = (phone) => String(phone || '').replace(/\D/g, '').length >= 7;

function PhoneIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.61a2 2 0 0 1-.45 2.11L8 9.72" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function FollowUpIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

const parseLeadNotes = (notes = '') => {
  return String(notes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(.+?) - ([^:]+):\s*(.*)$/);
      if (!match) {
        return {
          id: `${index}-${line}`,
          dateTime: '',
          user: 'Note',
          text: line,
        };
      }

      const [, dateTime, user, text] = match;
      return {
        id: `${index}-${dateTime}-${user}`,
        dateTime,
        user,
        text,
      };
    });
};

function NoteTimeline({ notes }) {
  const entries = parseLeadNotes(notes);

  if (!entries.length) {
    return <p className="rounded-xl border border-dashed border-gray-800 bg-gray-900 p-3 text-sm text-gray-500">No notes yet.</p>;
  }

  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-gray-800 bg-gray-900 thin-scrollbar">
      {entries.map((entry) => (
        <div key={entry.id} className="grid gap-3 border-b border-gray-800 p-3 last:border-b-0 sm:grid-cols-[150px_1fr]">
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-gray-300">{entry.user}</p>
            {entry.dateTime && <p className="leading-relaxed text-gray-500">{entry.dateTime}</p>}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

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
  const [completingFollowUpId, setCompletingFollowUpId] = useState(null);
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

  const completeFollowUp = async (leadId) => {
    try {
      setCompletingFollowUpId(leadId);
      const res = await fetch(`${BACKEND_URL}/api/leads/${leadId}/follow-up/complete`, {
        method: 'PATCH',
        headers: authHeaders,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to complete follow-up');

      setLeads((current) => current.map((lead) => (
        lead._id === leadId ? data.lead : lead
      )));
      setFollowUpLeadId(null);
      setFollowUpDrafts((current) => ({ ...current, [leadId]: {} }));
      showSuccessToast('Follow-up completed');
    } catch (error) {
      showErrorToast(error.message || 'Failed to complete follow-up');
    } finally {
      setCompletingFollowUpId(null);
    }
  };

  const handleCallLead = (phoneNumber) => {
    if (!canUsePhone(phoneNumber)) return;

    window.dispatchEvent(new CustomEvent('callContact', {
      detail: { phoneNumber },
    }));
  };

  const handleMessageLead = (phoneNumber) => {
    if (!canUsePhone(phoneNumber)) return;

    window.dispatchEvent(new CustomEvent('messageContact', {
      detail: { phoneNumber },
    }));
  };

  const selectedNoteLead = useMemo(
    () => leads.find((lead) => lead._id === noteLeadId),
    [leads, noteLeadId]
  );

  return (
    <div className="crm-page mx-auto flex h-full max-w-6xl flex-col gap-4">
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
              const hasUsablePhone = canUsePhone(lead.phone);

              return (
                <div key={lead._id} className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-white">{lead.name || 'Unnamed lead'}</h4>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">{lead.disposition || 'Quoted'}</span>
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
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition
                            ${noteLeadId === lead._id
                              ? 'border-gray-400 bg-gray-700 text-white'
                              : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600 hover:bg-gray-800 hover:text-white'}`}
                          title={noteLeadId === lead._id ? 'Close notes' : 'Open notes'}
                          aria-label={noteLeadId === lead._id ? 'Close notes' : 'Open notes'}
                        >
                          <NoteIcon />
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
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition
                            ${isFollowUpDue
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                              : followUpLeadId === lead._id
                                ? 'border-gray-400 bg-gray-700 text-white'
                                : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600 hover:bg-gray-800 hover:text-white'}`}
                          title={followUpLeadId === lead._id ? 'Hide reminder editor' : 'Schedule follow-up'}
                          aria-label={followUpLeadId === lead._id ? 'Hide reminder editor' : 'Schedule follow-up'}
                        >
                          <FollowUpIcon />
                        </button>
                        {isFollowUpDue && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">Follow-up due</span>}
                        {isFollowUpSoon && !isFollowUpDue && <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300">Reminder soon</span>}
                      </div>
                      <div className="mt-2 grid gap-1 text-sm text-gray-400 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-gray-500">Phone:</span>
                          <span className="min-w-0 truncate">{lead.phone || '-'}</span>
                        </div>
                        <p><span className="text-gray-500">Source:</span> {lead.source || 'manual'}</p>
                        <p><span className="text-gray-500">Assignee:</span> {lead.assignedTo?.name || 'Unassigned'}</p>
                        <p><span className="text-gray-500">Created:</span> {new Date(lead.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-400">
                        <p><span className="text-gray-500">Part requested:</span> {lead.partRequested || '-'}</p>
                        <p><span className="text-gray-500">Make / Model:</span> {lead.make || '-'} / {lead.model || '-'}</p>
                        <p><span className="text-gray-500">Follow-up:</span> {formatDateTime(lead.followUpAt)}{lead.followUpNote ? ` • ${lead.followUpNote}` : ''}</p>
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
                        onClick={() => handleCallLead(lead.phone)}
                        disabled={!hasUsablePhone}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-400 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
                        title={hasUsablePhone ? `Call ${lead.phone}` : 'No phone number'}
                        aria-label={hasUsablePhone ? `Call ${lead.phone}` : 'No phone number to call'}
                      >
                        <PhoneIcon />
                        Make Call
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMessageLead(lead.phone)}
                        disabled={!hasUsablePhone}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-200 transition hover:border-sky-400 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
                        title={hasUsablePhone ? `Open SMS for ${lead.phone}` : 'No phone number'}
                        aria-label={hasUsablePhone ? `Open SMS for ${lead.phone}` : 'No phone number to message'}
                      >
                        <MessageIcon />
                        Open SMS
                      </button>

                      {isFollowUpDue && (
                        <button
                          type="button"
                          onClick={() => completeFollowUp(lead._id)}
                          disabled={completingFollowUpId === lead._id}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-200 transition hover:border-amber-400 hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-70"
                          title="Mark follow-up completed"
                          aria-label="Mark follow-up completed"
                        >
                          <FollowUpIcon />
                          {completingFollowUpId === lead._id ? <InlineLoader label="Completing" /> : 'Complete Follow-up'}
                        </button>
                      )}
                    </div>
                  </div>

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
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveFollowUp(lead._id)}
                          disabled={submittingFollowUpId === lead._id}
                          className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-70"
                        >
                          {submittingFollowUpId === lead._id ? <InlineLoader label="Saving" /> : 'Save reminder'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFollowUpLeadId(null);
                            setFollowUpDrafts((current) => ({ ...current, [lead._id]: {} }));
                          }}
                          className="rounded-xl border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:border-gray-600 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedNoteLead && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-white">Notes</h3>
                <p className="truncate text-sm text-gray-400">{selectedNoteLead.name || 'Unnamed lead'}</p>
              </div>
              <button
                type="button"
                onClick={() => setNoteLeadId(null)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-400 transition hover:bg-gray-800 hover:text-white"
                title="Close notes"
                aria-label="Close notes"
              >
                X
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Current notes</p>
                <NoteTimeline notes={selectedNoteLead.notes} />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Add note</label>
                <textarea
                  value={noteDrafts[selectedNoteLead._id] || ''}
                  onChange={(event) => setNoteDrafts((current) => ({ ...current, [selectedNoteLead._id]: event.target.value }))}
                  placeholder="Add context or next step"
                  className="min-h-28 w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-800 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setNoteLeadId(null);
                  setNoteDrafts((current) => ({ ...current, [selectedNoteLead._id]: '' }));
                }}
                className="rounded-xl border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:border-gray-600 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => addLeadNote(selectedNoteLead._id)}
                disabled={submittingNoteId === selectedNoteLead._id}
                className="rounded-xl bg-[#059669] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:opacity-70"
              >
                {submittingNoteId === selectedNoteLead._id ? <InlineLoader label="Saving" /> : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CRM;
