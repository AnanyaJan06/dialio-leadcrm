import { useCallback, useMemo, useState, useEffect } from 'react';
import { AppSkeletonTheme, Skeleton } from './ui/AppSkeleton.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { buildPagedUrl, PAGE_SIZE, parsePagedResponse } from '../utils/pagination.js';
import { showCopiedNumberToast, showErrorToast } from '../utils/toast.js';

import { BACKEND_URL } from '../config/api.js';

const callFilters = [
  { key: 'all', label: 'All' },
  { key: 'missed', label: 'Missed' },
  { key: 'inbound', label: 'Inbound' },
  { key: 'outbound', label: 'Outbound' }
];

const sortOptions = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' }
];

const callStyles = {
  outbound: {
    label: 'Outbound',
    iconClass: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    statusClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
  },
  inbound: {
    label: 'Inbound',
    iconClass: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
    statusClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
  },
  missed: {
    label: 'Missed',
    iconClass: 'bg-red-500/10 text-red-300 ring-red-500/20',
    statusClass: 'bg-red-500/10 text-red-300 border-red-500/20'
  },
  'answered-by-teammate': {
    label: 'Handled by teammate',
    iconClass: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    statusClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    statusTextClass: 'font-semibold text-emerald-400'
  },
  rejected: {
    label: 'Rejected',
    iconClass: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
    statusClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20'
  },
  failed: {
    label: 'Failed',
    iconClass: 'bg-rose-500/10 text-rose-300 ring-rose-500/20',
    statusClass: 'bg-rose-500/10 text-rose-300 border-rose-500/20'
  },
  default: {
    label: 'Call',
    iconClass: 'bg-gray-500/10 text-gray-300 ring-gray-500/20',
    statusClass: 'bg-gray-500/10 text-gray-300 border-gray-500/20'
  }
};

const speakerBadgeStyles = {
  agent: 'text-emerald-300',
  client: 'text-sky-300'
};

function DirectionIcon({ type }) {
  const common = {
    className: 'w-4 h-4',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  };

  if (type === 'outbound') {
    return (
      <svg {...common}>
        <path d="M7 17L17 7" />
        <path d="M8 7h9v9" />
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.61a2 2 0 0 1-.45 2.11L8 9.72" />
      </svg>
    );
  }

  if (type === 'missed' || type === 'rejected' || type === 'failed' || type === 'answered-by-teammate') {
    return (
      <svg {...common}>
        <path d="M16 2v6h6" />
        <path d="M22 2l-6 6" />
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.61a2 2 0 0 1-.45 2.11L8 9.72" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M17 7L7 17" />
      <path d="M7 8v9h9" />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.61a2 2 0 0 1-.45 2.11L8 9.72" />
    </svg>
  );
}

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

function CopyIcon() {
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
      <path d="M9 16l2 2 4-4" />
    </svg>
  );
}

function TranscriptIcon() {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
    </svg>
  );
}

function CallHistorySkeleton() {
  const rows = Array.from({ length: 7 }, (_, index) => index);

  return (
    <AppSkeletonTheme>
      <div role="status" aria-label="Loading call history">
      <div className="sticky top-0 z-10 bg-[#161B26]/95 px-2 py-2 backdrop-blur border-b border-gray-800">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#0F141F] p-1">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height={32} borderRadius={8} />
          ))}
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Skeleton height={36} borderRadius={8} />
          <Skeleton height={36} borderRadius={8} />
          <Skeleton width={64} height={36} borderRadius={8} className="hidden sm:block" />
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {rows.map((row) => (
          <div key={row} className="px-3 py-3.5 sm:px-4">
            <div className="flex items-start gap-3">
              <Skeleton width={36} height={36} borderRadius={12} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <Skeleton width={144} height={16} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Skeleton width={56} height={12} />
                  <Skeleton width={64} height={12} />
                  <Skeleton width={40} height={12} />
                  <Skeleton width={96} height={12} />
                </div>
              </div>
            </div>
            <Skeleton width={80} height={12} className="ml-auto mt-2 block" />
          </div>
        ))}
      </div>
      </div>
    </AppSkeletonTheme>
  );
}

const getCallDate = (log) => log.startedAt || log.createdAt;

const getCallTime = (log) => {
  const time = new Date(getCallDate(log)).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const getDateInputValue = (date) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function CallHistory() {
  const [logs, setLogs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [followUpDraft, setFollowUpDraft] = useState(null);
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [followUpNotice, setFollowUpNotice] = useState({ text: '', type: '' });
  const [expandedTranscriptId, setExpandedTranscriptId] = useState('');

  const fetchCallLogs = useCallback(async ({ reset = false, before = null } = {}) => {
    try {
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const res = await fetch(buildPagedUrl(`${BACKEND_URL}/api/calls/logs`, {
        limit: PAGE_SIZE,
        before
      }), {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!res.ok) throw new Error('Failed to load call history');

      const page = parsePagedResponse(await res.json());

      setLogs((current) => (reset ? page.items : [...current, ...page.items]));
      setHasMore(page.hasMore);
      setNextBefore(page.nextBefore);
    } catch (err) {
      if (reset) setError(err.message);
    } finally {
      if (reset) setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMoreLogs = useCallback(() => {
    if (!hasMore || loading || loadingMore || !nextBefore) return;
    fetchCallLogs({ before: nextBefore });
  }, [fetchCallLogs, hasMore, loading, loadingMore, nextBefore]);

  useEffect(() => {
    fetchCallLogs({ reset: true });
  }, [fetchCallLogs]);

  useEffect(() => {
    const handler = () => fetchCallLogs({ reset: true });
    window.addEventListener('refreshCallHistory', handler);
    return () => window.removeEventListener('refreshCallHistory', handler);
  }, [fetchCallLogs]);

  const formatPhoneNumber = (phone) => {
    if (!phone) return 'Unknown';

    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = cleaned.slice(1);
    }

    if (cleaned.length === 10) {
      return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const canCallNumber = (phone) => {
    if (!phone) return false;
    return phone.replace(/\D/g, '').length >= 7;
  };

  const getLocalNumberLabel = (log) => {
    if (!log.localNumber) return '';
    return log.callType === 'outbound'
      ? `From ${formatPhoneNumber(log.localNumber)}`
      : `To ${formatPhoneNumber(log.localNumber)}`;
  };

  const handleMakeCall = (phoneNumber) => {
    if (!canCallNumber(phoneNumber)) return;

    window.dispatchEvent(new CustomEvent('callContact', {
      detail: { phoneNumber }
    }));
  };

  const handleMessage = (phoneNumber) => {
    if (!canCallNumber(phoneNumber)) return;
    window.dispatchEvent(new CustomEvent('messageContact', {
      detail: { phoneNumber }
    }));
    window.dispatchEvent(new CustomEvent('openConversation', {
      detail: { phoneNumber }
    }));
  };

  const handleCopyNumber = async (phoneNumber) => {
    if (!phoneNumber) return;

    try {
      await navigator.clipboard.writeText(phoneNumber);
      showCopiedNumberToast({
        phoneNumber: formatPhoneNumber(phoneNumber),
        onPaste: () => window.dispatchEvent(new CustomEvent('pasteNumberOnDialer', {
          detail: { phoneNumber }
        }))
      });
    } catch (err) {
      console.error('Failed to copy phone number:', err);
      showErrorToast('Failed to copy phone number');
    }
  };

  const getDefaultFollowUpDate = () => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
    return value.toISOString().slice(0, 16);
  };

  const handleOpenFollowUp = (log) => {
    if (!canCallNumber(log.phoneNumber)) return;

    setFollowUpNotice({ text: '', type: '' });
    setFollowUpDraft({
      name: formatPhoneNumber(log.phoneNumber),
      phone: log.phoneNumber,
      note: `Follow up about ${getCallMeta(log).directionLabel.toLowerCase()} call from ${formatDateTime(getCallDate(log))}.`,
      followUpDate: getDefaultFollowUpDate()
    });
  };

  const handleFollowUpChange = (event) => {
    const { name, value } = event.target;
    setFollowUpDraft((current) => ({
      ...current,
      [name]: value
    }));
  };

  const closeFollowUpModal = () => {
    if (savingFollowUp) return;
    setFollowUpDraft(null);
    setFollowUpNotice({ text: '', type: '' });
  };

  const saveFollowUp = async (event) => {
    event.preventDefault();
    if (!followUpDraft) return;

    if (!followUpDraft.name.trim() || !followUpDraft.note.trim() || !followUpDraft.followUpDate) {
      setFollowUpNotice({ text: 'Add a name, note, and follow-up date.', type: 'error' });
      return;
    }

    try {
      setSavingFollowUp(true);
      setFollowUpNotice({ text: '', type: '' });

      const res = await fetch(`${BACKEND_URL}/api/followups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: followUpDraft.name.trim(),
          phone: followUpDraft.phone.trim(),
          note: followUpDraft.note.trim(),
          followUpDate: new Date(followUpDraft.followUpDate).toISOString()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create follow-up');

      setFollowUpNotice({ text: 'Follow-up saved.', type: 'success' });
      window.dispatchEvent(new Event('refreshFollowUps'));
      window.setTimeout(() => {
        setFollowUpDraft(null);
        setFollowUpNotice({ text: '', type: '' });
      }, 700);
    } catch (err) {
      setFollowUpNotice({ text: err.message, type: 'error' });
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleOpenConversation = (phoneNumber) => {
    window.dispatchEvent(new CustomEvent('openConversation', {
      detail: { phoneNumber }
    }));
  };

  const formatDuration = (seconds) => {
    const secs = Number(seconds) || 0;
    if (secs === 0) return '0s';

    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatDateTime = (date) => {
    const value = new Date(date);
    return `${value.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })} at ${value.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  };

  const getCallMeta = (log) => {
    const status = log.status?.toLowerCase();
    const callType = log.callType?.toLowerCase();
    const visualType = ['missed', 'rejected', 'failed', 'answered-by-teammate'].includes(status)
      ? status
      : callType || 'default';
    const answeredByName = log.answeredByName
      || (typeof log.answeredBy === 'object' ? log.answeredBy?.name : '')
      || '';

    const style = callStyles[visualType] || callStyles.default;
    const handledByName = log.handledByName || answeredByName;

    return {
      ...style,
      visualType,
      statusLabel: status === 'answered-by-teammate' && handledByName
        ? `Answered by ${handledByName}`
        : log.isConsolidated && status === 'completed' && callType === 'inbound' && handledByName
          ? `Answered by ${handledByName}`
          : (status || 'unknown').replace(/-/g, ' '),
      statusTextClass: (
        status === 'answered-by-teammate'
        || (log.isConsolidated && status === 'completed' && callType === 'inbound' && handledByName)
      )
        ? (style.statusTextClass || 'font-semibold text-emerald-400')
        : (style.statusTextClass || ''),
      directionLabel: callStyles[callType]?.label || callStyles.default.label
    };
  };

  
  const getUserName = (log) => {
    if (log.handledByName) return log.handledByName;
    if (log.userName) return log.userName;
    if (typeof log.user === 'object' && log.user?.name) return log.user.name;
    return 'Unknown User';
  };

  const getAlsoNotifiedLabel = (log) => {
    if (!Array.isArray(log.alsoNotifiedUsers) || log.alsoNotifiedUsers.length === 0) return '';
    return `Also rung: ${log.alsoNotifiedUsers.join(', ')}`;
  };

  const getMissedByLabel = (log) => {
    if (!Array.isArray(log.missedByUsers) || log.missedByUsers.length <= 1) return '';
    return `Missed by: ${log.missedByUsers.join(', ')}`;
  };

  const getTranscriptSpeaker = (segment, log) => {
    const track = String(segment.track || '').toLowerCase();
    const callType = String(log.callType || '').toLowerCase();

    if (track.includes('agent') || track.includes('user')) {
      return {
        label: 'Agent',
        className: speakerBadgeStyles.agent
      };
    }

    if (track.includes('customer') || track.includes('client') || track.includes('caller')) {
      return {
        label: 'Client',
        className: speakerBadgeStyles.client
      };
    }

    const isUserTrack = callType === 'outbound'
      ? track.includes('inbound')
      : track.includes('outbound');

    return {
      label: isUserTrack ? 'Agent' : 'Client',
      className: isUserTrack ? speakerBadgeStyles.agent : speakerBadgeStyles.client
    };
  };

  const getSortedTranscriptSegments = (log) => [...(log.transcriptionSegments || [])]
    .filter((segment) => String(segment.text || '').trim())
    .sort((a, b) => (a.sequenceId || 0) - (b.sequenceId || 0));


  const visibleLogs = useMemo(() => {
    return logs
      .filter((log) => {
        const status = log.status?.toLowerCase();
        const callType = log.callType?.toLowerCase();
        const matchesType = activeFilter === 'all'
          ? true
          : activeFilter === 'missed'
            ? status === 'missed'
            : callType === activeFilter;
        const matchesDate = selectedDate
          ? getDateInputValue(getCallDate(log)) === selectedDate
          : true;

        return matchesType && matchesDate;
      })
      .sort((a, b) => {
        const newestFirst = getCallTime(b) - getCallTime(a);
        return sortOrder === 'newest' ? newestFirst : -newestFirst;
      });
  }, [activeFilter, logs, selectedDate, sortOrder]);

  const activeFilterLabel = callFilters.find((filter) => filter.key === activeFilter)?.label || 'All';

  return (
    <div className="flex-1 overflow-auto thin-scrollbar">
      {loading && <CallHistorySkeleton />}
      {error && <p className="text-sm text-red-400 text-center py-10">{error}</p>}

      {!loading && !error && logs.length > 0 && (
        <div className="sticky top-0 z-10 bg-[#161B26]/95 px-2 py-2 backdrop-blur border-b border-gray-800">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#0F141F] p-1">
            {callFilters.map((filter) => {
              const isActive = activeFilter === filter.key;

              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#059669] text-white shadow-sm'
                      : 'text-gray-400 hover:bg-[#1F2533] hover:text-white'
                  }`}
                  aria-pressed={isActive}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="sr-only" htmlFor="call-sort-order">Sort calls</label>
            <select
              id="call-sort-order"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="h-9 rounded-lg border border-gray-700 bg-[#0F141F] px-3 text-xs font-medium text-white transition-colors hover:border-gray-600 focus:border-[#059669]"
            >
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  Sort: {option.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="call-date-filter">Filter calls by date</label>
            <input
              id="call-date-filter"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="call-history-date-input h-9 rounded-lg border border-gray-700 bg-[#0F141F] px-3 text-xs font-medium text-white transition-colors hover:border-gray-600 focus:border-[#059669]"
            />

            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="h-9 rounded-lg border border-gray-700 px-3 text-xs font-semibold text-gray-300 transition-colors hover:bg-[#1F2533] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">
          No calls yet. Start making calls!
        </div>
      )}

      {!loading && !error && logs.length > 0 && visibleLogs.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">
          No {activeFilterLabel.toLowerCase()} calls found{selectedDate ? ' for this date' : ''}.
        </div>
      )}

      <div className="divide-y divide-gray-800">
        {visibleLogs.map((log) => {
          const meta = getCallMeta(log);
          const logId = log._id || log.callSid;
          const transcriptText = String(log.transcriptionText || '').trim();
          const transcriptSegments = getSortedTranscriptSegments(log);
          const transcriptionStatus = log.transcriptionStatus || 'not-started';
          const showTranscript = expandedTranscriptId === logId;
          const localNumberLabel = getLocalNumberLabel(log);

          return (
            <div
              key={logId}
              className="group relative px-3 py-3.5 transition-colors hover:bg-[#1F2533] sm:px-4"
            >
              <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => handleMakeCall(log.phoneNumber)}
                  disabled={!canCallNumber(log.phoneNumber)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-[#0F141F]/95 text-emerald-300 shadow-sm transition-colors hover:bg-emerald-500 hover:text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600"
                  title={`Call ${formatPhoneNumber(log.phoneNumber)}`}
                  aria-label={`Call ${formatPhoneNumber(log.phoneNumber)}`}
                >
                  <PhoneIcon />
                </button>
                <button
                  type="button"
                  onClick={() => handleMessage(log.phoneNumber)}
                  disabled={!canCallNumber(log.phoneNumber)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-[#0F141F]/95 text-emerald-300 shadow-sm transition-colors hover:bg-[#059669] hover:text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600"
                  title={`Message ${formatPhoneNumber(log.phoneNumber)}`}
                  aria-label={`Message ${formatPhoneNumber(log.phoneNumber)}`}
                >
                  <MessageIcon />
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenFollowUp(log)}
                  disabled={!canCallNumber(log.phoneNumber)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/20 bg-[#0F141F]/95 text-violet-300 shadow-sm transition-colors hover:bg-violet-500 hover:text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600"
                  title={`Add follow-up for ${formatPhoneNumber(log.phoneNumber)}`}
                  aria-label={`Add follow-up for ${formatPhoneNumber(log.phoneNumber)}`}
                >
                  <FollowUpIcon />
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyNumber(log.phoneNumber)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-600 bg-[#0F141F]/95 text-gray-300 shadow-sm transition-colors hover:bg-gray-700 hover:text-white"
                  title="Copy number"
                  aria-label={`Copy ${formatPhoneNumber(log.phoneNumber)}`}
                >
                  <CopyIcon />
                </button>
              </div>

              <div className="flex items-start gap-3 pr-0 sm:pr-32">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ring-1 shrink-0 ${meta.iconClass}`}>
                  <DirectionIcon type={meta.visualType} />
                </div>

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleOpenConversation(log.phoneNumber)}
                    className="block max-w-full truncate text-left text-sm font-semibold text-white transition hover:text-emerald-300"
                    title="Open conversation"
                  >
                    {formatPhoneNumber(log.phoneNumber)}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400">
                    <span>{meta.directionLabel}</span>
                    <span className="text-gray-600">|</span>
                    <span className={`capitalize ${meta.statusTextClass}`.trim()}>{meta.statusLabel}</span>
                    <span className="text-gray-600">|</span>
                    <span>{formatDuration(log.duration)}</span>
                    <span className="text-gray-600">|</span>
                    <span>{formatDateTime(getCallDate(log))}</span>
                    {localNumberLabel && (
                      <>
                        <span className="text-gray-600">|</span>
                        <span>{localNumberLabel}</span>
                      </>
                    )}
                    {getAlsoNotifiedLabel(log) && (
                      <>
                        <span className="text-gray-600">|</span>
                        <span className="text-gray-500">{getAlsoNotifiedLabel(log)}</span>
                      </>
                    )}
                    {getMissedByLabel(log) && (
                      <>
                        <span className="text-gray-600">|</span>
                        <span className="text-gray-500">{getMissedByLabel(log)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <p className="mt-1 text-right text-xs font-medium text-emerald-300">
                {getUserName(log)}
              </p>

              {(transcriptText || transcriptionStatus !== 'not-started') && (
                <div className="mt-3 pl-12">
                  <button
                    type="button"
                    onClick={() => setExpandedTranscriptId(showTranscript ? '' : logId)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:bg-gray-800 hover:text-white"
                  >
                    <TranscriptIcon />
                    {transcriptText ? 'Transcript' : `Transcript ${transcriptionStatus}`}
                  </button>

                  {showTranscript && (
                    <div className="mt-2 rounded-lg border border-gray-800 bg-[#0F141F] p-3 text-sm leading-6 text-gray-300">
                      {transcriptSegments.length > 0 ? (
                        <div className="space-y-2.5">
                          {transcriptSegments.map((segment, index) => {
                            const speaker = getTranscriptSpeaker(segment, log);

                            return (
                              <div
                                key={`${segment.sequenceId || index}-${segment.track || 'track'}`}
                                className="grid grid-cols-[54px_1fr] gap-3"
                              >
                                <span className={`pt-0.5 text-[11px] font-semibold uppercase tracking-wide ${speaker.className}`}>
                                  {speaker.label}
                                </span>
                                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-200">
                                  {segment.text}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        transcriptText || 'Transcript is not available yet.'
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && !error && hasMore && (
        <div className="px-4 py-4 text-center">
          <button
            type="button"
            onClick={loadMoreLogs}
            disabled={loadingMore}
            className="rounded-xl border border-gray-700 bg-[#0F141F] px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-gray-600 hover:bg-[#1F2533] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? 'Loading...' : 'Load more calls'}
          </button>
        </div>
      )}

      {followUpDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <form onSubmit={saveFollowUp} className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Add Follow-up</h3>
                <p className="mt-1 text-xs text-gray-400">{formatPhoneNumber(followUpDraft.phone)}</p>
              </div>
              <button
                type="button"
                onClick={closeFollowUpModal}
                className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-300 transition hover:bg-gray-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Name</label>
                <input
                  name="name"
                  value={followUpDraft.name}
                  onChange={handleFollowUpChange}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Date and Time</label>
                <input
                  type="datetime-local"
                  name="followUpDate"
                  value={followUpDraft.followUpDate}
                  onChange={handleFollowUpChange}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Note</label>
                <textarea
                  name="note"
                  value={followUpDraft.note}
                  onChange={handleFollowUpChange}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {followUpNotice.text && (
              <div className={`mt-4 rounded-xl px-3 py-2 text-xs text-white ${
                followUpNotice.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
              }`}>
                {followUpNotice.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingFollowUp}
              className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {savingFollowUp ? <LoadingSpinner label="Saving..." size="sm" tone="white" inline /> : 'Save Follow-up'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default CallHistory;
