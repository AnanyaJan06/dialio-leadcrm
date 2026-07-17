import { getAssignedNumbersForUser } from './twilioNumbers.js';
import { getNumberHistoryCutoff } from './numberHistoryAccess.js';

export const buildMessageAccessQuery = async (user) => {
  if (user.role === 'admin') return {};

  const assignedNumbers = await getAssignedNumbersForUser(user.id);
  const recipientNumbers = [...new Set([
    ...assignedNumbers,
    user.assignedPhoneNumber
  ].filter(Boolean))];

  return {
    $or: [
      { user: user.id },
      ...(recipientNumbers.length > 0
        ? [{
            createdAt: { $gte: getNumberHistoryCutoff() },
            $or: [
              { direction: 'inbound', to: { $in: recipientNumbers } },
              { direction: 'outbound', from: { $in: recipientNumbers } }
            ]
          }]
        : [])
    ]
  };
};
