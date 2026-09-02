import { getAssignedNumbersForUser } from './twilioNumbers.js';
import { getNumberHistoryCutoff } from './numberHistoryAccess.js';
import Lead from '../model/Lead.js';
import { buildPhonePatterns } from './phoneMatch.js';

export const buildMessageAccessQuery = async (user) => {
  if (user.role === 'admin') return {};

  const assignedNumbers = await getAssignedNumbersForUser(user.id);
  const recipientNumbers = [...new Set([
    ...assignedNumbers,
    user.assignedPhoneNumber
  ].filter(Boolean))];

  // Fetch leads assigned to this user
  const assignedLeads = await Lead.find({ assignedTo: user.id })
    .select('_id phone')
    .lean();

  const assignedLeadIds = assignedLeads.map((l) => l._id);
  const assignedLeadPhones = assignedLeads
    .map((l) => l.phone)
    .filter(Boolean)
    .flatMap((phone) => buildPhonePatterns(phone));

  return {
    $or: [
      { user: user.id },
      ...(assignedLeadIds.length > 0 ? [{ lead: { $in: assignedLeadIds } }] : []),
      ...(assignedLeadPhones.length > 0
        ? [
            { phoneNumber: { $in: assignedLeadPhones } },
            { from: { $in: assignedLeadPhones } },
            { to: { $in: assignedLeadPhones } }
          ]
        : []),
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
