import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  Camera,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Download,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Link as LinkIcon,
  PackageCheck,
  PackageX,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Tag,
  Trash2,
  UploadCloud,
  Wrench,
  X,
  ZoomIn
} from 'lucide-react';
import { AppSkeletonTheme, Skeleton } from './ui/AppSkeleton.jsx';
import InlineLoader from './ui/InlineLoader.jsx';
import { confirmAction } from '../utils/confirmDialog.js';
import { showErrorToast, showSuccessToast } from '../utils/toast.js';
import { BACKEND_URL } from '../config/api.js';

const MAX_PHOTOS = 4;

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
  imageUrl: '',
  imageUrls: [],
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

const resolveImageUrl = (url) => {
  if (!url) return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:')
  ) {
    return url;
  }
  return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
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
  const [uploadingCount, setUploadingCount] = useState(0);
  const [deletingPartId, setDeletingPartId] = useState('');
  const [copiedId, setCopiedId] = useState('');

  // Modal State for Add / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState(null); // null = Add mode, object = Edit mode
  const [form, setForm] = useState(emptyForm);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Lightbox Preview Gallery Modal
  const [previewPart, setPreviewPart] = useState(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all'); // 'all' | 'in stock' | 'out of stock'
  const [makeFilter, setMakeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const fileInputRef = useRef(null);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  }), []);

  const fetchParts = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const res = await fetch(`${BACKEND_URL}/api/parts`, {
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.message || 'Failed to load stock parts');
      setParts(Array.isArray(data) ? data : []);
    } catch (error) {
      showErrorToast(error.message || 'Failed to load stock parts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchParts();
  }, [fetchParts]);

  // Unique vehicle makes list for filtering
  const availableMakes = useMemo(() => {
    const set = new Set();
    parts.forEach((p) => {
      if (p.make && p.make.trim()) {
        set.add(p.make.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [parts]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalCount = parts.length;
    let inStockCount = 0;
    let outOfStockCount = 0;
    let inStockValuation = 0;
    let withPhotoCount = 0;

    parts.forEach((p) => {
      const isAvailable = (p.availability || '').toLowerCase() === 'in stock';
      if (isAvailable) {
        inStockCount += 1;
        const val = Number(p.price);
        if (Number.isFinite(val) && val > 0) {
          inStockValuation += val;
        }
      } else {
        outOfStockCount += 1;
      }

      if (p.imageUrl || (p.imageUrls && p.imageUrls.length > 0)) {
        withPhotoCount += 1;
      }
    });

    const inStockRate = totalCount > 0 ? Math.round((inStockCount / totalCount) * 100) : 0;

    return {
      totalCount,
      inStockCount,
      outOfStockCount,
      inStockValuation,
      inStockRate,
      withPhotoCount,
    };
  }, [parts]);

  // Filtered & Sorted Parts
  const filteredAndSortedParts = useMemo(() => {
    return parts
      .filter((part) => {
        // Search query
        const query = searchTerm.trim().toLowerCase();
        if (query) {
          const matchesSearch = [
            part.externalId,
            part.title,
            part.part,
            part.make,
            part.model,
            part.year,
            part.trim,
            part.price,
            part.currency,
            part.availability,
            part.condition,
            part.productType,
          ].some((val) => String(val || '').toLowerCase().includes(query));

          if (!matchesSearch) return false;
        }

        // Availability filter
        if (availabilityFilter !== 'all') {
          const normAvail = String(part.availability || 'in stock').trim().toLowerCase();
          if (normAvail !== availabilityFilter) return false;
        }

        // Make filter
        if (makeFilter !== 'all') {
          if (String(part.make || '').trim().toLowerCase() !== makeFilter.toLowerCase()) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }
        if (sortBy === 'oldest') {
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        if (sortBy === 'price-asc') {
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        }
        if (sortBy === 'price-desc') {
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        }
        if (sortBy === 'year-desc') {
          return String(b.year || '').localeCompare(String(a.year || ''), undefined, { numeric: true });
        }
        if (sortBy === 'make-asc') {
          return String(a.make || '').localeCompare(String(b.make || ''));
        }
        return 0;
      });
  }, [parts, searchTerm, availabilityFilter, makeFilter, sortBy]);

  // Open Modal for Add
  const handleOpenAddModal = () => {
    setEditingPart(null);
    setForm(emptyForm);
    setShowUrlInput(false);
    setCustomImageUrl('');
    setModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (part) => {
    setEditingPart(part);
    const existingImages = Array.isArray(part.imageUrls) && part.imageUrls.length > 0
      ? part.imageUrls.filter(Boolean)
      : (part.imageUrl ? [part.imageUrl] : []);

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
      imageUrl: existingImages[0] || '',
      imageUrls: existingImages,
    });
    setShowUrlInput(false);
    setCustomImageUrl('');
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving || uploadingCount > 0) return;
    setModalOpen(false);
    setEditingPart(null);
    setForm(emptyForm);
    setShowUrlInput(false);
    setCustomImageUrl('');
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  // Upload Single Image Helper
  const uploadSingleImage = async (file) => {
    const res = await fetch(`${BACKEND_URL}/api/parts/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        ...authHeaders,
      },
      body: file,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Failed to upload image');
    return data.imageUrl;
  };

  // Multi-image upload handler (up to 4 photos)
  const handleImageFilesSelect = async (filesList) => {
    if (!filesList || filesList.length === 0) return;

    const currentImages = form.imageUrls || [];
    const availableSlots = MAX_PHOTOS - currentImages.length;

    if (availableSlots <= 0) {
      showErrorToast(`Maximum of ${MAX_PHOTOS} photos already uploaded.`);
      return;
    }

    const filesArray = Array.from(filesList).filter((file) => {
      if (!file.type.startsWith('image/')) {
        showErrorToast(`Skipped "${file.name}": not a valid image format.`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        showErrorToast(`Skipped "${file.name}": exceeds 10MB limit.`);
        return false;
      }
      return true;
    });

    if (filesArray.length === 0) return;

    const filesToUpload = filesArray.slice(0, availableSlots);
    if (filesArray.length > availableSlots) {
      showErrorToast(`Only ${availableSlots} more photo(s) allowed. Uploading first ${availableSlots}.`);
    }

    try {
      setUploadingCount(filesToUpload.length);
      const uploadPromises = filesToUpload.map((file) => uploadSingleImage(file));
      const uploadedUrls = await Promise.all(uploadPromises);

      setForm((current) => {
        const nextList = [...(current.imageUrls || []), ...uploadedUrls].slice(0, MAX_PHOTOS);
        return {
          ...current,
          imageUrl: nextList[0] || '',
          imageUrls: nextList,
        };
      });

      showSuccessToast(
        uploadedUrls.length === 1
          ? 'Photo uploaded successfully'
          : `${uploadedUrls.length} photos uploaded successfully`
      );
    } catch (error) {
      showErrorToast(error.message || 'Failed to upload one or more photos');
    } finally {
      setUploadingCount(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (event) => {
    handleImageFilesSelect(event.target.files);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files) {
      handleImageFilesSelect(event.dataTransfer.files);
    }
  };

  const handleRemovePhoto = (indexToRemove) => {
    setForm((current) => {
      const nextList = (current.imageUrls || []).filter((_, idx) => idx !== indexToRemove);
      return {
        ...current,
        imageUrl: nextList[0] || '',
        imageUrls: nextList,
      };
    });
  };

  const handleSetPrimaryPhoto = (indexToPrimary) => {
    setForm((current) => {
      const list = [...(current.imageUrls || [])];
      const [item] = list.splice(indexToPrimary, 1);
      const nextList = [item, ...list];
      return {
        ...current,
        imageUrl: nextList[0] || '',
        imageUrls: nextList,
      };
    });
    showSuccessToast('Cover photo updated');
  };

  const handleAddCustomImageUrl = () => {
    const trimmed = customImageUrl.trim();
    if (!trimmed) {
      showErrorToast('Please enter a valid image URL');
      return;
    }

    if ((form.imageUrls || []).length >= MAX_PHOTOS) {
      showErrorToast(`Maximum of ${MAX_PHOTOS} photos reached.`);
      return;
    }

    setForm((current) => {
      const nextList = [...(current.imageUrls || []), trimmed].slice(0, MAX_PHOTOS);
      return {
        ...current,
        imageUrl: nextList[0] || '',
        imageUrls: nextList,
      };
    });

    setCustomImageUrl('');
    setShowUrlInput(false);
    showSuccessToast('Image URL attached');
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

      const finalImages = (form.imageUrls || []).slice(0, MAX_PHOTOS);
      const finalPrimary = finalImages[0] || form.imageUrl || '';

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
          imageUrl: finalPrimary,
          imageUrls: finalImages,
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

  const handleCopyPartInfo = (part) => {
    const text = `${part.externalId ? `${part.externalId} | ` : ''}${part.year || ''} ${part.make || ''} ${part.model || ''} ${part.trim || ''} - ${part.part || ''} | ${formatPrice(part.price, part.currency)} (${part.availability || 'In Stock'})`.trim();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(part._id);
      showSuccessToast('Part details copied to clipboard');
      setTimeout(() => setCopiedId(''), 2000);
    }
  };

  const handleOpenLightbox = (part, initialIndex = 0) => {
    setPreviewPart(part);
    setActivePhotoIndex(initialIndex);
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!previewPart) return;

    const gallery = (previewPart.imageUrls && previewPart.imageUrls.length > 0)
      ? previewPart.imageUrls
      : (previewPart.imageUrl ? [previewPart.imageUrl] : []);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPreviewPart(null);
      } else if (e.key === 'ArrowRight' && gallery.length > 1) {
        setActivePhotoIndex((curr) => (curr + 1) % gallery.length);
      } else if (e.key === 'ArrowLeft' && gallery.length > 1) {
        setActivePhotoIndex((curr) => (curr - 1 + gallery.length) % gallery.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPart]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredAndSortedParts.length === 0) {
      showErrorToast('No parts to export');
      return;
    }

    const headers = ['ID', 'Title', 'Part', 'Year', 'Make', 'Model', 'Trim', 'Price', 'Currency', 'Availability', 'Condition', 'Product Type', 'Photos Count', 'Image URLs', 'Date Added'];
    const rows = filteredAndSortedParts.map((p) => {
      const photos = (p.imageUrls && p.imageUrls.length > 0)
        ? p.imageUrls.join(' | ')
        : (p.imageUrl || '');
      const count = (p.imageUrls && p.imageUrls.length > 0)
        ? p.imageUrls.length
        : (p.imageUrl ? 1 : 0);
      const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

      return [
        escapeCell(p.externalId),
        escapeCell(p.title),
        escapeCell(p.part),
        escapeCell(p.year),
        escapeCell(p.make),
        escapeCell(p.model),
        escapeCell(p.trim),
        escapeCell(Number(p.price || 0).toFixed(2)),
        escapeCell(p.currency || 'USD'),
        escapeCell(p.availability || 'in stock'),
        escapeCell(p.condition),
        escapeCell(p.productType),
        escapeCell(count),
        escapeCell(photos),
        escapeCell(p.createdAt ? new Date(p.createdAt).toISOString() : ''),
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `parts-stock-inventory-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccessToast('Inventory CSV exported');
  };

  const hasActiveFilters = Boolean(searchTerm.trim() || availabilityFilter !== 'all' || makeFilter !== 'all' || sortBy !== 'newest');

  const handleResetFilters = () => {
    setSearchTerm('');
    setAvailabilityFilter('all');
    setMakeFilter('all');
    setSortBy('newest');
  };

  // Preview part gallery list
  const previewGallery = useMemo(() => {
    if (!previewPart) return [];
    if (Array.isArray(previewPart.imageUrls) && previewPart.imageUrls.length > 0) {
      return previewPart.imageUrls;
    }
    return previewPart.imageUrl ? [previewPart.imageUrl] : [];
  }, [previewPart]);

  return (
    <div className="w-full space-y-4">
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
            onClick={handleExportCSV}
            title="Export filtered parts to CSV"
            className="flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800/80 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-700 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
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
            <span className="text-xs font-medium uppercase tracking-wider">Total Stock</span>
            <div className="rounded-lg bg-gray-800/90 p-1.5 text-gray-300">
              <Tag className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {metrics.totalCount}
            <span className="ml-1.5 text-xs font-normal text-gray-400">items</span>
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
              {metrics.inStockCount}
            </p>
            <span className="text-xs font-medium text-emerald-400/80">
              ({metrics.inStockRate}%)
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
            {metrics.outOfStockCount}
            <span className="ml-1.5 text-xs font-normal text-gray-400">items</span>
          </p>
        </div>

        {/* Total In-Stock Valuation */}
        <div className="rounded-2xl border border-cyan-500/20 bg-[#11151F] p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="text-xs font-medium uppercase tracking-wider">Stock Valuation</span>
            <div className="rounded-lg bg-cyan-500/10 p-1.5 text-cyan-400 ring-1 ring-cyan-500/20">
              <DollarSign className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1.5 truncate text-lg font-bold tracking-tight text-cyan-300 sm:text-xl" title={formatPrice(metrics.inStockValuation)}>
            {formatPrice(metrics.inStockValuation)}
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
            placeholder="Search make, model, year, part name, price..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-900/90 py-2.5 pl-10 pr-9 text-sm text-white placeholder-gray-500 transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
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
              onChange={(e) => setAvailabilityFilter(e.target.value)}
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
              onChange={(e) => setMakeFilter(e.target.value)}
              className="max-w-[140px] truncate rounded-xl border border-gray-700 bg-gray-900/90 px-3 py-2.5 text-xs font-medium text-gray-200 transition focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Makes</option>
              {availableMakes.map((make) => (
                <option key={make} value={make}>{make}</option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <div className="flex items-center">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
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
      ) : filteredAndSortedParts.length === 0 ? (
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
          <div className="flex items-center justify-between border-b border-gray-800/80 bg-gray-800/30 px-4 py-2.5 text-xs text-gray-400">
            <span>
              Showing <strong className="text-white">{filteredAndSortedParts.length}</strong> of{' '}
              <strong className="text-white">{parts.length}</strong> stock parts
            </span>
            {hasActiveFilters && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                Filtered view
              </span>
            )}
          </div>

          {/* Structured Responsive Table */}
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <th scope="col" className="py-3.5 pl-4 pr-2 w-16">Photo</th>
                  <th scope="col" className="px-3 py-3.5">Part Description</th>
                  <th scope="col" className="px-3 py-3.5">Make</th>
                  <th scope="col" className="px-3 py-3.5">Model</th>
                  <th scope="col" className="px-3 py-3.5">Year</th>
                  <th scope="col" className="px-3 py-3.5">Price</th>
                  <th scope="col" className="px-3 py-3.5">Availability</th>
                  <th scope="col" className="py-3.5 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-medium">
                {filteredAndSortedParts.map((part, index) => {
                  const isInStock = (part.availability || 'in stock').toLowerCase() === 'in stock';
                  const isDeleting = deletingPartId === part._id;
                  const isCopied = copiedId === part._id;

                  const partImages = Array.isArray(part.imageUrls) && part.imageUrls.length > 0
                    ? part.imageUrls.filter(Boolean)
                    : (part.imageUrl ? [part.imageUrl] : []);
                  const primaryImageUrl = resolveImageUrl(partImages[0]);
                  const photosCount = partImages.length;

                  return (
                    <tr
                      key={part._id || index}
                      className="group transition-colors hover:bg-gray-800/40"
                    >
                      {/* Photo Thumbnail + Counter */}
                      <td className="py-3 pl-4 pr-2">
                        {primaryImageUrl ? (
                          <button
                            type="button"
                            onClick={() => handleOpenLightbox(part, 0)}
                            title={`Click to view ${photosCount} photo(s)`}
                            className="group/img relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-700/80 bg-gray-900 transition-all hover:border-emerald-500 hover:ring-2 hover:ring-emerald-500/30"
                          >
                            <img
                              src={primaryImageUrl}
                              alt={part.part || 'Part'}
                              className="h-full w-full object-cover transition duration-200 group-hover/img:scale-110"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) {
                                  e.target.nextSibling.style.display = 'flex';
                                }
                              }}
                            />
                            <div className="hidden h-full w-full items-center justify-center bg-gray-800 text-gray-400">
                              <ImageIcon className="h-4 w-4" />
                            </div>

                            {/* Multi-photo badge */}
                            {photosCount > 1 && (
                              <div className="absolute top-0.5 right-0.5 rounded-md bg-black/80 px-1 py-0.2 text-[9px] font-bold text-white shadow backdrop-blur-xs">
                                +{photosCount - 1}
                              </div>
                            )}

                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/img:opacity-100">
                              <ZoomIn className="h-4 w-4 text-white" />
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(part)}
                            title="No photos - Click to add up to 4 photos"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-800/40 text-gray-500 transition hover:border-emerald-500 hover:bg-gray-800 hover:text-emerald-400"
                          >
                            <Camera className="h-4 w-4" />
                          </button>
                        )}
                      </td>

                      {/* Part Requested / Title */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-gray-300 ring-1 ring-gray-700/60 group-hover:bg-emerald-500/10 group-hover:text-emerald-400 group-hover:ring-emerald-500/30 transition-colors">
                            <Wrench className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white group-hover:text-emerald-300 transition-colors">
                              {part.part || 'Unnamed Part'}
                            </p>
                            <div className="flex max-w-xs flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
                              {part.externalId && <span className="font-mono text-cyan-300">{part.externalId}</span>}
                              {part.title && <span className="truncate" title={part.title}>{part.title}</span>}
                              {part.trim && <span>Trim: {part.trim}</span>}
                              {part.condition && <span>{part.condition}</span>}
                              {photosCount > 0 && <span>{photosCount} photo{photosCount > 1 ? 's' : ''}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Make */}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/70 bg-gray-800/80 px-2.5 py-1 text-xs font-semibold text-gray-200">
                          <Car className="h-3 w-3 text-gray-400" />
                          {part.make}
                        </span>
                      </td>

                      {/* Model */}
                      <td className="whitespace-nowrap px-3 py-3.5 text-xs font-medium text-gray-300">
                        {part.model}
                      </td>

                      {/* Year */}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <span className="inline-flex items-center rounded-md border border-gray-700/60 bg-gray-800/50 px-2 py-0.5 text-xs font-bold text-gray-300">
                          {part.year}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <span className="font-mono text-sm font-bold text-emerald-400">
                          {formatPrice(part.price, part.currency)}
                        </span>
                      </td>

                      {/* Availability */}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        {isInStock ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            In Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            Out of Stock
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap py-3.5 pl-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copy Info Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyPartInfo(part)}
                            title="Copy part summary"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                          >
                            {isCopied ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>

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
                      ? 'Update specifications, vehicle fitment, pricing, and up to 4 photos'
                      : 'Fill in vehicle specs, part details, up to 4 photos, and price'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={saving || uploadingCount > 0}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4 p-5">
              {/* Part Photos Section (Up to 4 Photos) */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-300">
                      Part Photos ({form.imageUrls?.length || 0}/{MAX_PHOTOS})
                    </label>
                    <span className="text-[11px] text-gray-500">(First photo is cover)</span>
                  </div>
                  {(form.imageUrls?.length || 0) < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => setShowUrlInput((v) => !v)}
                      className="text-xs font-medium text-emerald-400 hover:underline"
                    >
                      {showUrlInput ? 'Upload file' : '+ Attach Image URL'}
                    </button>
                  )}
                </div>

                {/* Photo Gallery Grid (4 slots) */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {(form.imageUrls || []).map((imgUrl, idx) => (
                    <div
                      key={idx}
                      className="group relative flex h-24 flex-col justify-between overflow-hidden rounded-xl border border-gray-700 bg-gray-900/90 p-1 transition hover:border-gray-600"
                    >
                      <img
                        src={resolveImageUrl(imgUrl)}
                        alt={`Photo ${idx + 1}`}
                        className="h-full w-full rounded-lg object-cover"
                      />

                      {/* Cover Badge or Set as Cover */}
                      <div className="absolute top-1.5 left-1.5">
                        {idx === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow backdrop-blur-xs">
                            <Star className="h-2.5 w-2.5 fill-current" />
                            Cover
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryPhoto(idx)}
                            title="Make this the cover photo"
                            className="rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-gray-300 opacity-0 shadow transition hover:bg-emerald-600 hover:text-white group-hover:opacity-100"
                          >
                            Set Cover
                          </button>
                        )}
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        title="Remove photo"
                        className="absolute top-1.5 right-1.5 rounded-lg bg-black/70 p-1 text-rose-300 opacity-0 shadow transition hover:bg-rose-600 hover:text-white group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Add / Upload Photo Tile */}
                  {(form.imageUrls?.length || 0) < MAX_PHOTOS && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => uploadingCount === 0 && fileInputRef.current?.click()}
                      className={`flex h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-2 text-center transition-all ${
                        dragOver
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-gray-700 bg-gray-900/40 hover:border-emerald-500/70 hover:bg-gray-900/80'
                      }`}
                    >
                      {uploadingCount > 0 ? (
                        <div className="flex flex-col items-center gap-1">
                          <InlineLoader size="xs" />
                          <span className="text-[10px] text-gray-400">Uploading...</span>
                        </div>
                      ) : (
                        <>
                          <ImagePlus className="h-5 w-5 text-gray-400 group-hover:text-emerald-400" />
                          <span className="mt-1 text-[11px] font-semibold text-gray-300">
                            + Add Photo
                          </span>
                          <span className="text-[9px] text-gray-500">
                            {(form.imageUrls?.length || 0)}/{MAX_PHOTOS}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Optional URL Input */}
                {showUrlInput && (form.imageUrls?.length || 0) < MAX_PHOTOS && (
                  <div className="mt-2 flex gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        placeholder="https://example.com/part-photo.jpg"
                        value={customImageUrl}
                        onChange={(e) => setCustomImageUrl(e.target.value)}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900/90 py-2 pl-9 pr-3 text-xs text-white placeholder-gray-500 focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomImageUrl}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Attach
                    </button>
                  </div>
                )}

                {/* Hidden Multi-file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>

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
                  disabled={saving || uploadingCount > 0}
                  className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-xs font-semibold text-gray-300 transition hover:bg-gray-700 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingCount > 0}
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

      {/* Interactive Multi-Photo Lightbox Gallery Modal */}
      {previewPart && previewGallery.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md modal-backdrop"
          onClick={() => setPreviewPart(null)}
        >
          <div
            className="relative flex flex-col max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-gray-700 bg-[#161B28] shadow-2xl modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="flex items-center justify-between border-b border-gray-800 bg-[#1C2333]/90 px-5 py-3.5">
              <div>
                <h4 className="text-sm font-bold text-white">
                  {[previewPart.year, previewPart.make, previewPart.model, previewPart.trim, '-', previewPart.part].filter(Boolean).join(' ')}
                </h4>
                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-emerald-400">{formatPrice(previewPart.price, previewPart.currency)}</span>
                  <span className="text-gray-500">-</span>
                  <span className={previewPart.availability === 'out of stock' ? 'text-rose-400' : 'text-emerald-300'}>
                    {previewPart.availability === 'out of stock' ? 'Out of Stock' : 'In Stock'}
                  </span>
                  <span className="text-gray-500">-</span>
                  <span className="text-gray-400">Photo {activePhotoIndex + 1} of {previewGallery.length}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPart(null)}
                className="rounded-xl p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lightbox Main Image View with Prev/Next Navigation */}
            <div className="relative flex min-h-[300px] max-h-[58vh] items-center justify-center bg-black/70 p-4">
              <img
                src={resolveImageUrl(previewGallery[activePhotoIndex])}
                alt={`${previewPart.part || ''} - Photo ${activePhotoIndex + 1}`}
                className="max-h-[54vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
              />

              {/* Prev Button */}
              {previewGallery.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePhotoIndex((curr) => (curr - 1 + previewGallery.length) % previewGallery.length);
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white shadow-lg backdrop-blur-sm transition hover:bg-emerald-600"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              {/* Next Button */}
              {previewGallery.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePhotoIndex((curr) => (curr + 1) % previewGallery.length);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white shadow-lg backdrop-blur-sm transition hover:bg-emerald-600"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>

            {/* Thumbnail Strip (if multiple photos) */}
            {previewGallery.length > 1 && (
              <div className="flex items-center justify-center gap-2 border-t border-gray-800/80 bg-gray-900/90 py-2.5 px-4">
                {previewGallery.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePhotoIndex(idx)}
                    className={`h-12 w-12 overflow-hidden rounded-lg border-2 transition-all ${
                      activePhotoIndex === idx
                        ? 'border-emerald-500 ring-2 ring-emerald-500/40 scale-105'
                        : 'border-gray-700 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={resolveImageUrl(url)}
                      alt={`Thumbnail ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Lightbox Footer */}
            <div className="flex items-center justify-between border-t border-gray-800 bg-[#1C2333]/90 px-5 py-3 text-xs text-gray-400">
              <span>Added {formatDate(previewPart.createdAt)}</span>
              <button
                type="button"
                onClick={() => {
                  const partToEdit = previewPart;
                  setPreviewPart(null);
                  handleOpenEditModal(partToEdit);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Part & Photos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Parts;
