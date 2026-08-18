import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSkeletonTheme, Skeleton } from './ui/AppSkeleton.jsx';
import InlineLoader from './ui/InlineLoader.jsx';
import { confirmAction } from '../utils/confirmDialog.js';
import { showErrorToast, showSuccessToast } from '../utils/toast.js';
import { BACKEND_URL } from '../config/api.js';

const emptyForm = {
  make: '',
  model: '',
  year: '',
  partRequested: '',
  price: '',
};

const formatPrice = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

function PartsSkeleton() {
  return (
    <AppSkeletonTheme>
      <div className="space-y-2" role="status" aria-label="Loading parts">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-2xl border border-gray-700 bg-gray-900 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <Skeleton width={180} height={16} />
              <Skeleton width={140} height={12} className="mt-2 block" />
              <Skeleton width={88} height={12} className="mt-1 block" />
            </div>
            <Skeleton width={66} height={32} borderRadius={12} />
          </div>
        ))}
      </div>
    </AppSkeletonTheme>
  );
}

function Parts() {
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(true);
  const [deletingPartId, setDeletingPartId] = useState('');

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const fetchParts = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      const res = await fetch(`${BACKEND_URL}/api/parts`, {
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.message || 'Failed to load parts');
      setParts(Array.isArray(data) ? data : []);
    } catch (error) {
      showErrorToast(error.message || 'Failed to load parts');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const make = form.make.trim();
    const model = form.model.trim();
    const year = form.year.trim();
    const partRequested = form.partRequested.trim();
    const price = Number(form.price);

    if (!make || !model || !year || !partRequested) {
      showErrorToast('Make, model, year, and part requested are required');
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      showErrorToast('Enter a valid price');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${BACKEND_URL}/api/parts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ make, model, year, partRequested, price }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.message || 'Failed to add part');

      showSuccessToast('Part added');
      setForm(emptyForm);
      fetchParts({ silent: true });
    } catch (error) {
      showErrorToast(error.message || 'Failed to add part');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (part) => {
    const confirmed = await confirmAction({
      title: 'Delete part?',
      text: 'This part will be removed from the catalog.',
      confirmButtonText: 'Delete',
      icon: 'warning',
      confirmButtonColor: '#DC2626',
    });

    if (!confirmed) return;

    try {
      setDeletingPartId(part._id);
      const res = await fetch(`${BACKEND_URL}/api/parts/${part._id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.message || 'Failed to delete part');

      showSuccessToast('Part deleted');
      setParts((current) => current.filter((item) => item._id !== part._id));
    } catch (error) {
      showErrorToast(error.message || 'Failed to delete part');
    } finally {
      setDeletingPartId('');
    }
  };

  const filteredParts = parts.filter((part) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return [part.make, part.model, part.year, part.partRequested, part.price]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Parts</h2>
          <p className="mt-0.5 text-xs text-gray-400">Add and look up part quotes by vehicle.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((current) => !current)}
          className="rounded-xl bg-[#059669] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#047857] sm:text-sm"
        >
          {showAddForm ? 'Close Form' : '+ Add Part'}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <h3 className="mb-4 text-base font-semibold text-white">Add Part</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="make"
              value={form.make}
              onChange={handleChange}
              placeholder="Make *"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
              required
            />
            <input
              name="model"
              value={form.model}
              onChange={handleChange}
              placeholder="Model *"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
              required
            />
            <input
              name="year"
              value={form.year}
              onChange={handleChange}
              placeholder="Year *"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
              required
            />
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={handleChange}
              placeholder="Price *"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
              required
            />
            <input
              name="partRequested"
              value={form.partRequested}
              onChange={handleChange}
              placeholder="Part Requested *"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white sm:col-span-2"
              required
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#059669] py-3 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:opacity-70 sm:col-span-2"
            >
              {saving ? <InlineLoader label="Saving..." /> : 'Save Part'}
            </button>
          </form>
        </div>
      )}

      <input
        type="text"
        placeholder="Search by make, model, year, or part..."
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        className="mb-4 w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white focus:border-[#059669]"
      />

      {loading ? (
        <PartsSkeleton />
      ) : filteredParts.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">No parts found.</p>
      ) : (
        <div className="space-y-2">
          {filteredParts.map((part) => (
            <div
              key={part._id}
              className="flex flex-col gap-3 rounded-2xl border border-gray-700 bg-gray-900 p-4 transition hover:border-[#059669] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{part.partRequested}</p>
                <p className="truncate text-xs text-gray-400">
                  {[part.year, part.make, part.model].filter(Boolean).join(' ')}
                </p>
                <p className="mt-0.5 text-xs font-medium text-emerald-300">{formatPrice(part.price)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(part)}
                disabled={deletingPartId === part._id}
                className="rounded-xl bg-red-600/80 px-3 py-2 text-xs text-white transition hover:bg-red-700 disabled:opacity-70"
              >
                {deletingPartId === part._id ? <InlineLoader label="Deleting" size="xs" /> : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Parts;
