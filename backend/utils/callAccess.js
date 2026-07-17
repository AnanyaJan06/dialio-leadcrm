import { getAssignedNumberHistoryContext } from './numberHistoryAccess.js';

export const buildCallAccessQuery = async (user) => {
  if (user.role === 'admin') return {};

  const { assignedNumbers, cutoff } = await getAssignedNumberHistoryContext(user);

  return {
    $or: [
      { user: user.id },
      ...(assignedNumbers.length > 0
        ? [{
            localNumber: { $in: assignedNumbers },
            startedAt: { $gte: cutoff }
          }]
        : [])
    ]
  };
};
