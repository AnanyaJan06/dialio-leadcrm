import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSkeletonTheme, Skeleton } from './ui/AppSkeleton.jsx';
import InlineLoader from './ui/InlineLoader.jsx';
import { confirmAction } from '../utils/confirmDialog.js';
import { showCopiedNumberToast, showErrorToast, showSuccessToast } from '../utils/toast.js';

import { BACKEND_URL } from '../config/api.js';

const emptyForm = {
  name: '',
  phone: '',
  note: '',
  followUpDate: ''
};

const isDue = (followUp) => (
  !followUp.completed && new Date(followUp.followUpDate) <= new Date()
);

const readJsonResponse = async (res) => {
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Follow-ups API is not available yet. Please deploy or restart the backend with the new /api/followups route.');
  }
};

function FollowUpsSkeleton() {
  return (
    <AppSkeletonTheme>
      <div role="status" aria-label="Loading follow-ups">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Skeleton width={110} height={18} />
            <Skeleton width={150} height={12} className="mt-2 block" />
          </div>
          <Skeleton width={118} height={36} borderRadius={12} />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-3">
            <Skeleton width={92} height={16} />
          </div>
          <div className="divide-y divide-gray-800">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="px-4 py-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Skeleton width={140} height={16} />
                    <Skeleton width={112} height={12} className="mt-2 block" />
                    <Skeleton width={168} height={12} className="mt-2 block" />
                  </div>
                  <Skeleton width={54} height={24} borderRadius={999} />
                </div>
                <Skeleton width="86%" height={14} />
                <div className="mt-3 flex gap-2">
                  <Skeleton width={76} height={30} borderRadius={8} />
                  <Skeleton width={58} height={30} borderRadius={8} />
                  <Skeleton width={58} height={30} borderRadius={8} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppSkeletonTheme>
  );
}

function FollowUps({ onDueCountChange }) {
  const [followUps, setFollowUps] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }), []);

  const fetchFollowUps = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`${BACKEND_URL}/api/followups`, {
        headers: authHeaders
      });
      const data = await readJsonResponse(res);

      if (!res.ok) throw new Error(data.message || 'Failed to load follow-ups');
      setFollowUps(Array.isArray(data) ? data : []);
    } catch (error) {
      showErrorToast(error.message || 'Failed to load follow-ups');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  useEffect(() => {
    const dueCount = followUps.filter(isDue).length;
    onDueCountChange?.(dueCount);
  }, [followUps, onDueCountChange]);

  const sortedFollowUps = useMemo(() => [...followUps].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(a.followUpDate) - new Date(b.followUpDate);
  }), [followUps]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const createFollowUp = async (event) => {
    event.preventDefault();

    if (!form.name.trim() || !form.note.trim() || !form.followUpDate) {
      showErrorToast('Add a name, note, and follow-up date.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${BACKEND_URL}/api/followups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          note: form.note.trim(),
          followUpDate: new Date(form.followUpDate).toISOString()
        })
      });

      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.message || 'Failed to create follow-up');

      setForm(emptyForm);
      setShowForm(false);
      showSuccessToast('Follow-up saved');
      window.dispatchEvent(new Event('refreshFollowUps'));
      fetchFollowUps({ silent: true });
    } catch (error) {
      showErrorToast(error.message || 'Failed to create follow-up');
    } finally {
      setSaving(false);
    }
  };

  const updateCompleted = async (followUp, completed) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/followups/${followUp._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ completed })
      });

      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.message || 'Failed to update follow-up');

      setFollowUps((current) => current.map((item) => (
        item._id === followUp._id ? data.followUp : item
      )));
      showSuccessToast(completed ? 'Follow-up completed' : 'Follow-up reopened');
      window.dispatchEvent(new Event('refreshFollowUps'));
      window.dispatchEvent(new Event('refreshLeads'));
    } catch (error) {
      showErrorToast(error.message || 'Failed to update follow-up');
    }
  };

  const deleteFollowUp = async (followUp) => {
    const confirmed = await confirmAction({
      title: 'Delete follow-up?',
      text: 'This follow-up will be removed permanently.',
      confirmButtonText: 'Delete',
      icon: 'warning',
      confirmButtonColor: '#DC2626'
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/followups/${followUp._id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      const data = await readJsonResponse(res);

      if (!res.ok) throw new Error(data.message || 'Failed to delete follow-up');

      setFollowUps((current) => current.filter((item) => item._id !== followUp._id));
      showSuccessToast('Follow-up deleted');
      window.dispatchEvent(new Event('refreshFollowUps'));
      window.dispatchEvent(new Event('refreshLeads'));
    } catch (error) {
      showErrorToast(error.message || 'Failed to delete follow-up');
    }
  };

  const copyPhone = async (phone) => {
    if (!phone) return;

    try {
      await navigator.clipboard.writeText(phone);
      showCopiedNumberToast({
        phoneNumber: phone,
        onPaste: () => window.dispatchEvent(new CustomEvent('pasteNumberOnDialer', {
          detail: { phoneNumber: phone }
        }))
      });
    } catch {
      showErrorToast('Failed to copy phone number');
    }
  };

  const formatDate = (date) => new Date(date).toLocaleString([], {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <FollowUpsSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Follow Ups</h2>
          <p className="mt-0.5 text-xs text-gray-400">Track reminders and pending callbacks.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="rounded-xl bg-[#059669] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#047857]"
        >
          {showForm ? 'Close' : 'Save Follow-up'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createFollowUp} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-4 text-base font-semibold text-white">New Follow-up</h3>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs text-gray-400">Name</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669]"
                placeholder="Customer name"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-gray-400">Phone</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669]"
                placeholder="+1..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs text-gray-400">Date and Time</label>
              <input
                type="datetime-local"
                name="followUpDate"
                value={form.followUpDate}
                onChange={handleChange}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669]"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs text-gray-400">Note</label>
              <textarea
                name="note"
                value={form.note}
                onChange={handleChange}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669]"
                placeholder="What should be followed up?"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full rounded-xl bg-[#059669] py-3 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:opacity-60"
          >
            {saving ? <InlineLoader label="Saving..." /> : 'Save Follow-up'}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Follow-ups</h3>
        </div>

        {sortedFollowUps.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No follow-ups yet.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {sortedFollowUps.map((followUp) => {
              const due = isDue(followUp);

              return (
                <div key={followUp._id} className="px-4 py-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${followUp.completed ? 'text-gray-500 line-through' : 'text-white'}`}>
                        {followUp.name}
                      </p>
                      {followUp.phone && <p className="text-xs text-gray-400">{followUp.phone}</p>}
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(followUp.followUpDate)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                      followUp.completed
                        ? 'bg-gray-700 text-gray-300'
                        : due
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                    }`}>
                      {followUp.completed ? 'Done' : due ? 'Due' : formatDate(followUp.followUpDate)}
                    </span>
                  </div>

                  <p className="text-sm text-gray-300">{followUp.note}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {followUp.phone && (
                      <button
                        type="button"
                        onClick={() => copyPhone(followUp.phone)}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:bg-gray-700 hover:text-white"
                      >
                        Copy Phone
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => updateCompleted(followUp, !followUp.completed)}
                      className="rounded-lg border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500 hover:text-white"
                    >
                      {followUp.completed ? 'Reopen' : 'Complete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFollowUp(followUp)}
                      className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500 hover:text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default FollowUps;
