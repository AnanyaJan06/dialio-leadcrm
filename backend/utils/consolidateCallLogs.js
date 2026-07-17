const STATUS_PRIORITY = {
  completed: 1,
  'answered-by-teammate': 2,
  missed: 3,
  rejected: 4,
  busy: 5,
  'no-answer': 6,
  failed: 7
};

const getUserName = (log) => log.userName || log.user?.name || 'Unknown User';

const getUserId = (log) => String(log.user?._id || log.user?.id || log.user || '');

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

export const consolidateAdminCallLogs = (logs = []) => {
  const standalone = [];
  const grouped = new Map();

  logs.forEach((log) => {
    if (!log.callSid || log.callType !== 'inbound') {
      standalone.push(log);
      return;
    }

    const group = grouped.get(log.callSid) || [];
    group.push(log);
    grouped.set(log.callSid, group);
  });

  const consolidated = [];

  grouped.forEach((group) => {
    if (group.length === 1) {
      consolidated.push(group[0]);
      return;
    }

    const sorted = [...group].sort((a, b) => {
      const aPriority = STATUS_PRIORITY[a.status] ?? 99;
      const bPriority = STATUS_PRIORITY[b.status] ?? 99;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return (b.duration || 0) - (a.duration || 0);
    });

    const primary = { ...sorted[0] };
    const others = sorted.slice(1);
    const completedInbound = group.find(
      (log) => log.callType === 'inbound' && log.status === 'completed'
    );

    if (completedInbound) {
      Object.assign(primary, completedInbound, {
        status: 'completed',
        duration: completedInbound.duration || primary.duration || 0,
        handledByName: getUserName(completedInbound),
        handledByUserId: getUserId(completedInbound)
      });
    } else if (primary.status === 'answered-by-teammate') {
      primary.handledByName = primary.answeredByName || getUserName(primary);
      primary.handledByUserId = String(primary.answeredBy?._id || primary.answeredBy || '');
    } else if (primary.status === 'missed') {
      primary.missedByUsers = uniqueValues(group.map(getUserName));
      primary.handledByName = '';
    } else {
      primary.handledByName = getUserName(primary);
    }

    const alsoNotifiedUsers = uniqueValues(
      others
        .filter((log) => log.status === 'answered-by-teammate')
        .map(getUserName)
    );

    if (alsoNotifiedUsers.length > 0) {
      primary.alsoNotifiedUsers = alsoNotifiedUsers;
    }

    primary.isConsolidated = true;
    primary.consolidatedCount = group.length;

    consolidated.push(primary);
  });

  return [...standalone, ...consolidated].sort(
    (a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)
  );
};