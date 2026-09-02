import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Car,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  PackageX,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X
} from 'lucide-react';
import { AppSkeletonTheme, Skeleton } from './ui/AppSkeleton.jsx';
import InlineLoader from './ui/InlineLoader.jsx';
import { confirmAction } from '../utils/confirmDialog.js';
import { showErrorToast, showSuccessToast } from '../utils/toast.js';
import { BACKEND_URL } from '../config/api.js';

const emptyForm = {
  externalId: '',
  title: '',
  part: '',
  make: '',
  model: '',
  year: '',
  trim: '',
  price: '',
  currency: 'USD',
  availability: 'in stock',
  condition: '',
  productType: '',
};

const formatPrice = (value, currency = 'USD') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function PartsTableSkeleton() {
  return (
    <AppSkeletonTheme>
      <div className="w-full space-y-3" role="status" aria-label="Loading stock table">
        {/* Metric cards skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-gray-800 bg-[#11151F] p-4">
              <Skeleton width={80} height={14} />
              <Skeleton width={110} height={24} className="mt-2 block" />
            </div>
          ))}
        </div>

        {/* Search & filter skeleton */}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-800 bg-[#11151F] p-3">
          <Skeleton width="40%" height={38} borderRadius={12} />
          <Skeleton width="20%" height={38} borderRadius={12} />
          <Skeleton width="20%" height={38} borderRadius={12} />
        </div>

        {/* Table skeleton */}
        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#11151F]">
          <div className="border-b border-gray-800 bg-gray-800/40 p-4">
            <Skeleton height={20} />
          </div>
          <div className="divide-y divide-gray-800/60 p-2">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4 py-3.5 px-2">
                <Skeleton width={44} height={44} borderRadius={10} />
                <Skeleton width={130} height={16} />
                <Skeleton width={85} height={16} />
                <Skeleton width={75} height={16} />
                <Skeleton width={45} height={16} />
                <Skeleton width={70} height={16} />
                <Skeleton width={85} height={22} borderRadius={999} />
                <Skeleton width={60} height={28} borderRadius={8} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppSkeletonTheme>
  );
}

function Parts() {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingPartId, setDeletingPartId] = useState('');

  // Google Sheet Sync State
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [sheetSyncModalOpen, setSheetSyncModalOpen] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [syncConfig, setSyncConfig] = useState({ isConfigured: false, maskedUrl: '' });
  const [syncStats, setSyncStats] = useState(null);

  // Modal State for Add / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState(null); // null = Add mode, object = Edit mode
  const [form, setForm] = useState(emptyForm);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all'); // 'all' | 'in stock' | 'out of stock'
  const [makeFilter, setMakeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
    hasMore: false,
  });

  // Catalog Summary Metrics
  const [catalogMetrics, setCatalogMetrics] = useState({
    totalCount: 0,
    inStockCount: 0,
    outOfStockCount: 0,
    inStockRate: 0,
    availableMakes: [],
  });

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }), []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchSyncConfig = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/parts/sync-config`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setSyncConfig(data);
      }
    } catch (err) {
      console.error('Failed to fetch sheet sync config:', err);
    }
  }, [authHeaders]);

  const fetchParts = useCallback(async ({
    silent = false,
    overridePage,
    overrideLimit,
    overrideSearch,
    overrideAvail,
    overrideMake,
    overrideSort,
  } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const p = overridePage !== undefined ? overridePage : page;
      const l = overrideLimit !== undefined ? overrideLimit : limit;
      const s = overrideSearch !== undefined ? overrideSearch : debouncedSearch;
      const a = overrideAvail !== undefined ? overrideAvail : availabilityFilter;
      const m = overrideMake !== undefined ? overrideMake : makeFilter;
      const so = overrideSort !== undefined ? overrideSort : sortBy;

      const params = new URLSearchParams({
        page: String(p),
        limit: String(l),
        availability: a,
        make: m,
        sort: so,
      });
      if (s) params.set('search', s);

      const res = await fetch(`${BACKEND_URL}/api/parts?${params.toString()}`, {
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.message || 'Failed to load stock parts');

      if (Array.isArray(data)) {
        setParts(data);
        setPagination({
          total: data.length,
          page: 1,
          limit: data.length,
          totalPages: 1,
          hasMore: false,
        });
      } else {
        setParts(Array.isArray(data.parts) ? data.parts : []);
        if (data.pagination) setPagination(data.pagination);
        if (data.metrics) setCatalogMetrics(data.metrics);
      }
    } catch (error) {
      showErrorToast(error.message || 'Failed to load stock parts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders, page, limit, debouncedSearch, availabilityFilter, makeFilter, sortBy]);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  useEffect(() => {
    fetchSyncConfig();
  }, [fetchSyncConfig]);

  const handleSyncSheet = async (overrideUrl) => {
    const urlToUse = overrideUrl !== undefined ? overrideUrl : sheetUrlInput.trim();

    try {
      setSyncingSheet(true);
      setSyncStats(null);

      const res = await fetch(`${BACKEND_URL}/api/parts/sync-sheet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(urlToUse ? { sheetUrl: urlToUse } : {}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to sync Google Sheet');

      showSuccessToast(data.message || 'Parts successfully synced from Google Sheet');
      setSyncStats(data.stats);
      fetchSyncConfig();
      fetchParts({ silent: true, overridePage: 1 });
    } catch (error) {
      showErrorToast(error.message || 'Failed to sync Google Sheet');
    } finally {
      setSyncingSheet(false);
    }
  };

  // Unique vehicle makes list for filtering
  const availableMakes = useMemo(() => {
    if (catalogMetrics.availableMakes && catalogMetrics.availableMakes.length > 0) {
      return catalogMetrics.availableMakes;
    }
    const set = new Set();
    parts.forEach((p) => {
      if (p.make && p.make.trim()) set.add(p.make.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalogMetrics.availableMakes, parts]);

  // Page Numbers generator for pagination
  const pageNumbers = useMemo(() => {
    const total = pagination.totalPages || 1;
    const current = pagination.page || 1;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
  }, [pagination.page, pagination.totalPages]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === page) return;
    setPage(newPage);
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPage(1);
  };

  const handleAvailabilityChange = (newAvail) => {
    setAvailabilityFilter(newAvail);
    setPage(1);
  };

  const handleMakeChange = (newMake) => {
    setMakeFilter(newMake);
    setPage(1);
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setAvailabilityFilter('all');
    setMakeFilter('all');
    setSortBy('newest');
    setPage(1);
  };

  // Open Modal for Add
  const handleOpenAddModal = () => {
    setEditingPart(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (part) => {
    setEditingPart(part);
    setForm({
      externalId: part.externalId || '',
      title: part.title || '',
      part: part.part || '',
      make: part.make || '',
      model: part.model || '',
      year: part.year || '',
      trim: part.trim || '',
      price: part.price ?? '',
      currency: part.currency || 'USD',
      availability: part.availability || 'in stock',
      condition: part.condition || '',
      productType: part.productType || '',
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingPart(null);
    setForm(emptyForm);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();

    const externalId = form.externalId.trim();
    const title = form.title.trim();
    const partName = form.part.trim();
    const make = form.make.trim();
    const model = form.model.trim();
    const year = form.year.trim();
    const trim = form.trim.trim();
    const price = Number(form.price);
    const currency = (form.currency || 'USD').trim().toUpperCase();
    const condition = form.condition.trim();
    const productType = form.productType.trim();

    if (!make || !model || !year || !partName) {
      showErrorToast('Make, model, year, and part are required');
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      showErrorToast('Please enter a valid price');
      return;
    }

    try {
      setSaving(true);
      const isEditing = Boolean(editingPart && editingPart._id);
      const url = isEditing
        ? `${BACKEND_URL}/api/parts/${editingPart._id}`
        : `${BACKEND_URL}/api/parts`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          externalId,
          title,
          part: partName,
          make,
          model,
          year,
          trim,
          price,
          currency,
          availability: form.availability,
          condition,
          productType,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.message || (isEditing ? 'Failed to update part' : 'Failed to add part'));

      showSuccessToast(isEditing ? 'Part updated successfully' : 'Part added to inventory');
      handleCloseModal();
      fetchParts({ silent: true });
    } catch (error) {
      showErrorToast(error.message || 'Failed to save part');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (part) => {
    const partSummary = `${part.year || ''} ${part.make || ''} ${part.model || ''} ${part.trim || ''} - ${part.part || 'Part'}`.trim();
    const confirmed = await confirmAction({
      title: 'Delete part from stock?',
      text: `Are you sure you want to remove "${partSummary}" from stock?`,
      confirmButtonText: 'Delete Part',
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

      showSuccessToast('Part deleted from stock');
      setParts((current) => current.filter((item) => item._id !== part._id));
    } catch (error) {
      showErrorToast(error.message || 'Failed to delete part');
    } finally {
      setDeletingPartId('');
    }
  };

  const hasActiveFilters = Boolean(searchTerm.trim() || availabilityFilter !== 'all' || makeFilter !== 'all' || sortBy !== 'newest');

  return (
    <div
      className="w-full space-y-4 select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
    >
      {/* Top Header Section */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Parts & Stock Inventory</h2>
              <p className="text-xs text-gray-400">Live catalog with multi-photo stock items, fitment specs, and live pricing.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fetchParts({ silent: true })}
            disabled={refreshing || loading}
            title="Refresh stock list"
            className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800/80 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-700 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setSheetSyncModalOpen(true)}
            disabled={syncingSheet || loading}
            title={syncConfig.isConfigured ? 'Sync parts from Google Sheet' : 'Connect Google Sheet'}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 shadow-sm transition hover:bg-emerald-500/20 hover:text-white disabled:opacity-50"
          >
            <FileSpreadsheet className={`h-3.5 w-3.5 ${syncingSheet ? 'animate-pulse text-emerald-400' : 'text-emerald-400'}`} />
            <span>{syncingSheet ? 'Syncing...' : 'Sync Sheet'}</span>
            {syncConfig.isConfigured && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Google Sheet Connected" />
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#059669] to-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:from-[#047857] hover:to-emerald-700 sm:text-sm"
          >
            <Plus className="h-4 w-4" />
            <span>+ Add Part</span>
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total Stock */}
        <div className="rounded-2xl border border-gray-800 bg-[#11151F] p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium uppercase tracking-wider">Total Catalog</span>
            <div className="rounded-lg bg-gray-800/90 p-1.5 text-gray-300">
              <Tag className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {(catalogMetrics.totalCount || pagination.total || 0).toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-gray-400">parts</span>
          </p>
        </div>

        {/* In Stock */}
        <div className="rounded-2xl border border-emerald-500/20 bg-[#11151F] p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-medium uppercase tracking-wider">In Stock</span>
            <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400 ring-1 ring-emerald-500/20">
              <PackageCheck className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <p className="text-xl font-bold tracking-tight text-emerald-400 sm:text-2xl">
              {(catalogMetrics.inStockCount || 0).toLocaleString()}
            </p>
            <span className="text-xs font-medium text-emerald-400/80">
              ({catalogMetrics.inStockRate || 100}%)
            </span>
          </div>
        </div>

        {/* Out of Stock */}
        <div className="rounded-2xl border border-rose-500/20 bg-[#11151F] p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-xs font-medium uppercase tracking-wider">Out of Stock</span>
            <div className="rounded-lg bg-rose-500/10 p-1.5 text-rose-400 ring-1 ring-rose-500/20">
              <PackageX className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-rose-400 sm:text-2xl">
            {(catalogMetrics.outOfStockCount || 0).toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-gray-400">parts</span>
          </p>
        </div>

        {/* Available Makes / Brands */}
        <div className="rounded-2xl border border-cyan-500/20 bg-[#11151F] p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="text-xs font-medium uppercase tracking-wider">Vehicle Makes</span>
            <div className="rounded-lg bg-cyan-500/10 p-1.5 text-cyan-400 ring-1 ring-cyan-500/20">
              <Car className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-cyan-300 sm:text-2xl">
            {availableMakes.length}
            <span className="ml-1.5 text-xs font-normal text-gray-400">brands indexed</span>
          </p>
        </div>
      </div>

      {/* Search, Filter & Control Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-[#11151F] p-3.5 md:flex-row md:items-center md:justify-between">
        {/* Search bar */}
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search make, model, year, part name, SKU, price across 55k+ parts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-900/90 py-2.5 pl-10 pr-9 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setDebouncedSearch('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Availability Filter */}
          <div className="flex items-center gap-1">
            <select
              value={availabilityFilter}
              onChange={(e) => handleAvailabilityChange(e.target.value)}
              className="rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-xs font-medium text-gray-200 transition focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Availability</option>
              <option value="in stock">In Stock Only</option>
              <option value="out of stock">Out of Stock Only</option>
            </select>
          </div>

          {/* Make Filter */}
          {availableMakes.length > 0 && (
            <select
              value={makeFilter}
              onChange={(e) => handleMakeChange(e.target.value)}
              className="max-w-[140px] truncate rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-xs font-medium text-gray-200 transition focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Makes ({availableMakes.length})</option>
              {availableMakes.map((make) => (
                <option key={make} value={make}>{make}</option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <div className="flex items-center">
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-xs font-medium text-gray-200 transition focus:border-emerald-500 focus:outline-none"
            >
              <option value="newest">Sort: Newest Added</option>
              <option value="oldest">Sort: Oldest Added</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="year-desc">Year: Newest</option>
              <option value="make-asc">Make: A to Z</option>
            </select>
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1 rounded-xl bg-gray-800 px-3 py-2.5 text-xs font-medium text-gray-400 transition hover:bg-gray-700 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Stock Table */}
      {loading ? (
        <PartsTableSkeleton />
      ) : parts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-800 bg-[#11151F] py-16 px-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/80 text-gray-400 ring-1 ring-gray-700">
            <Boxes className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-white">No parts match your criteria</h3>
          <p className="mt-1 max-w-sm text-xs text-gray-400">
            {hasActiveFilters
              ? 'Try changing or clearing your search filters to find what you are looking for.'
              : 'Your stock inventory is empty. Add your first vehicle part with photos to get started.'}
          </p>
          <div className="mt-5 flex gap-2">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2 text-xs font-medium text-white transition hover:bg-gray-700"
              >
                Clear Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="flex items-center gap-1.5 rounded-xl bg-[#059669] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#047857]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add First Part
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#11151F] shadow-xl">
          {/* Table summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 bg-gray-800/30 px-4 py-2.5 text-xs text-gray-400">
            <span>
              Showing <strong className="text-white">{pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}</strong> -{' '}
              <strong className="text-white">{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> of{' '}
              <strong className="text-white">{pagination.total.toLocaleString()}</strong> stock parts
            </span>
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                  Filtered ({pagination.total.toLocaleString()} matches)
                </span>
              )}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[11px] text-gray-500">Rows:</span>
                <select
                  value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value={20}>20</option>
                  <option value={25}>25</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          {/* Structured Responsive Table */}
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <th scope="col" className="px-4 py-3.5">Part Description</th>
                  <th scope="col" className="px-3 py-3.5">Make</th>
                  <th scope="col" className="px-3 py-3.5">Model</th>
                  <th scope="col" className="px-3 py-3.5">Year</th>
                  <th scope="col" className="px-3 py-3.5">Price</th>
                  <th scope="col" className="px-3 py-3.5">Availability</th>
                  <th scope="col" className="py-3.5 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody
                className="divide-y divide-gray-800/60 font-medium select-none"
                onContextMenu={(e) => e.preventDefault()}
              >
                {parts.map((part, index) => {
                  const isInStock = (part.availability || 'in stock').toLowerCase() === 'in stock';
                  const isDeleting = deletingPartId === part._id;

                  return (
                    <tr
                      key={part._id || index}
                      className="group transition-colors hover:bg-gray-800/40"
                    >
                      {/* Part Description / Title */}
                      <td className="max-w-[260px] px-4 py-3.5">
                        <div className="font-semibold text-white truncate" title={part.title || part.part}>
                          {part.part || 'Unnamed Part'}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {part.externalId && (
                            <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded">
                              {part.externalId}
                            </span>
                          )}
                          {part.condition && <span className="capitalize">{part.condition}</span>}
                          {part.trim && <span>• {part.trim}</span>}
                        </div>
                      </td>

                      {/* Make */}
                      <td className="whitespace-nowrap px-3 py-3.5 text-gray-300">
                        {part.make || '—'}
                      </td>

                      {/* Model */}
                      <td className="whitespace-nowrap px-3 py-3.5 text-gray-300">
                        {part.model || '—'}
                      </td>

                      {/* Year */}
                      <td className="whitespace-nowrap px-3 py-3.5 font-mono text-gray-300">
                        {part.year || '—'}
                      </td>

                      {/* Price */}
                      <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-white">
                        {formatPrice(part.price, part.currency)}
                      </td>

                      {/* Availability */}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isInStock
                              ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isInStock ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          {isInStock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap py-3.5 pl-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(part)}
                            title="Edit part & photos"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-emerald-300"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDelete(part)}
                            disabled={isDeleting}
                            title="Delete part"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-950/40 hover:text-red-400 disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <InlineLoader size="xs" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-800 bg-[#161B26] px-4 py-3 sm:flex-row text-xs text-gray-400">
            <div>
              Page <strong className="text-white">{pagination.page}</strong> of{' '}
              <strong className="text-white">{pagination.totalPages || 1}</strong>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1 || loading}
                  className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/80 px-2.5 py-1.5 text-xs text-gray-300 transition hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {pageNumbers.map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-gray-500">...</span>
                    ) : (
                      <button
                        key={`page-${p}`}
                        type="button"
                        onClick={() => handlePageChange(p)}
                        className={`h-7 min-w-[28px] px-1.5 rounded-lg text-xs font-medium transition ${
                          page === p
                            ? 'bg-emerald-600 text-white font-bold shadow-sm shadow-emerald-600/30'
                            : 'border border-gray-800 bg-gray-800/70 text-gray-300 hover:bg-gray-700 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= pagination.totalPages || loading}
                  className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/80 px-2.5 py-1.5 text-xs text-gray-300 transition hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Part Modal Dialog (Supports up to 4 Photos) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm modal-backdrop"
          onClick={handleCloseModal}
        >
          <div
            className="w-full max-w-xl max-h-[92vh] overflow-y-auto thin-scrollbar rounded-2xl border border-gray-700 bg-[#161B28] shadow-2xl modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-800 bg-[#1C2333]/95 px-5 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                  {editingPart ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {editingPart ? 'Edit Stock Part' : 'Add Part to Stock'}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {editingPart
                      ? 'Update specifications, vehicle fitment, and pricing'
                      : 'Fill in vehicle specs, part details, and price'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={saving}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-800 hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4 p-5">
              {/* Sheet Catalog Fields */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Sheet ID
                  </label>
                  <input
                    name="externalId"
                    value={form.externalId}
                    onChange={handleFormChange}
                    placeholder="e.g. AUTO000001"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Part <span className="text-rose-400">*</span>
                  </label>
                  <input
                    name="part"
                    value={form.part}
                    onChange={handleFormChange}
                    placeholder="e.g. Engine"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Condition
                  </label>
                  <input
                    name="condition"
                    value={form.condition}
                    onChange={handleFormChange}
                    placeholder="e.g. used"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                  Title
                </label>
                <input
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="e.g. Engine - 1960 - Saab - 93 (1960 Down) - Direct"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-4 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                />
              </div>

              {/* Vehicle Fitment: Make, Model, Year, Trim */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Make <span className="text-rose-400">*</span>
                  </label>
                  <input
                    name="make"
                    value={form.make}
                    onChange={handleFormChange}
                    placeholder="e.g. Toyota"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Model <span className="text-rose-400">*</span>
                  </label>
                  <input
                    name="model"
                    value={form.model}
                    onChange={handleFormChange}
                    placeholder="e.g. Camry"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Year <span className="text-rose-400">*</span>
                  </label>
                  <input
                    name="year"
                    value={form.year}
                    onChange={handleFormChange}
                    placeholder="e.g. 2021"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Trim
                  </label>
                  <input
                    name="trim"
                    value={form.trim}
                    onChange={handleFormChange}
                    placeholder="e.g. 6-226"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Price & Stock Availability */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Price ($ USD) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">
                      $
                    </span>
                    <input
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={handleFormChange}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-gray-700 bg-gray-900/90 py-2.5 pl-7 pr-3 text-sm font-semibold text-emerald-400 placeholder-gray-500 transition focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Currency
                  </label>
                  <input
                    name="currency"
                    value={form.currency}
                    onChange={handleFormChange}
                    placeholder="USD"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm font-semibold uppercase text-white placeholder-gray-500 transition focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Stock Availability <span className="text-rose-400">*</span>
                  </label>
                  <select
                    name="availability"
                    value={form.availability}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm font-medium text-white transition focus:border-emerald-500"
                  >
                    <option value="in stock">In Stock (Available)</option>
                    <option value="out of stock">Out of Stock</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                    Product Type
                  </label>
                  <input
                    name="productType"
                    value={form.productType}
                    onChange={handleFormChange}
                    placeholder="Auto Parts & Accessories"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="mt-6 flex items-center justify-end gap-2.5 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-xs font-semibold text-gray-300 transition hover:bg-gray-700 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#059669] to-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:from-[#047857] hover:to-emerald-700 disabled:opacity-70"
                >
                  {saving ? (
                    <InlineLoader label={editingPart ? 'Updating...' : 'Saving...'} />
                  ) : (
                    <span>{editingPart ? 'Update Part' : 'Save to Inventory'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Google Sheets Sync Modal */}
      {sheetSyncModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => !syncingSheet && setSheetSyncModalOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-800 bg-[#161B26] shadow-2xl shadow-black/80 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-800 bg-[#1C2333]/90 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Sync from Google Sheet</h3>
                  <p className="text-xs text-gray-400">Import and update parts stock directly from your spreadsheet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !syncingSheet && setSheetSyncModalOpen(false)}
                disabled={syncingSheet}
                className="rounded-xl p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 p-6">
              {syncConfig.isConfigured ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-200">✅ .env Configured URL Active</span>
                    <span className="font-mono text-[11px] text-emerald-400/80">{syncConfig.maskedUrl}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-300/80">
                    Click <strong>Sync Now</strong> to fetch the latest stock from your backend .env spreadsheet, or enter a custom link below to override.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-700/80 bg-gray-800/50 p-3.5 text-xs text-gray-300">
                  <p className="font-semibold text-white">How to connect your Google Sheet:</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] text-gray-400">
                    <li>Open your Google Sheet with your parts catalog.</li>
                    <li>Click <strong>File</strong> → <strong>Share</strong> → <strong>Publish to web</strong>.</li>
                    <li>Select <strong>Comma-separated values (.csv)</strong> and click <strong>Publish</strong>.</li>
                    <li>Paste that link below (or save in <code className="text-emerald-400">backend/.env</code> as <code className="text-emerald-400">GOOGLE_SHEETS_PARTS_URL</code>).</li>
                  </ol>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">
                  {syncConfig.isConfigured ? 'Custom / Override Google Sheet URL (Optional)' : 'Google Sheet Published CSV URL'}
                </label>
                <input
                  type="url"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder={
                    syncConfig.isConfigured
                      ? 'Leave blank to use .env URL, or paste new link...'
                      : 'https://docs.google.com/spreadsheets/d/.../pub?output=csv'
                  }
                  className="w-full rounded-xl border border-gray-700 bg-gray-900/90 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Supported Columns Guide */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                <span className="text-[11px] font-semibold text-gray-400">Required & Supported Columns:</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Part', 'Make', 'Model', 'Year', 'Price', 'Availability', 'Trim', 'Condition', 'ID / SKU'].map((col) => (
                    <span
                      key={col}
                      className="rounded-md bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-300 border border-gray-700/60"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {/* Previous Sync Stats if available */}
              {syncStats && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3 text-xs">
                  <p className="font-semibold text-emerald-400">Last Sync Summary:</p>
                  <div className="mt-1 grid grid-cols-4 gap-2 text-center text-[11px]">
                    <div className="rounded-lg bg-gray-800/80 p-1.5">
                      <span className="text-gray-400 block text-[10px]">Total</span>
                      <span className="font-bold text-white">{syncStats.totalRows}</span>
                    </div>
                    <div className="rounded-lg bg-emerald-500/20 p-1.5">
                      <span className="text-emerald-400 block text-[10px]">Added</span>
                      <span className="font-bold text-emerald-300">+{syncStats.imported}</span>
                    </div>
                    <div className="rounded-lg bg-teal-500/20 p-1.5">
                      <span className="text-teal-400 block text-[10px]">Updated</span>
                      <span className="font-bold text-teal-300">{syncStats.updated}</span>
                    </div>
                    <div className="rounded-lg bg-gray-800/80 p-1.5">
                      <span className="text-gray-400 block text-[10px]">Skipped</span>
                      <span className="font-bold text-gray-400">{syncStats.skipped}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-gray-800 bg-[#1C2333]/90 px-6 py-3.5">
              <button
                type="button"
                onClick={() => setSheetSyncModalOpen(false)}
                disabled={syncingSheet}
                className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-700 hover:text-white disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleSyncSheet()}
                disabled={syncingSheet || (!syncConfig.isConfigured && !sheetUrlInput.trim())}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
              >
                {syncingSheet ? (
                  <>
                    <InlineLoader size={14} color="#ffffff" />
                    <span>Syncing Catalog...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Sync Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Parts;
