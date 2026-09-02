import { getAssignedNumberHistoryContext } from './numberHistoryAccess.js';
import Lead from '../model/Lead.js';
import { buildPhonePatterns } from './phoneMatch.js';

export const buildCallAccessQuery = async (user) => {
  if (user.role === 'admin') return {};

  const { assignedNumbers, cutoff } = await getAssignedNumberHistoryContext(user);

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
      { answeredBy: user.id },
      ...(assignedLeadIds.length > 0 ? [{ lead: { $in: assignedLeadIds } }] : []),
      ...(assignedLeadPhones.length > 0 ? [{ phoneNumber: { $in: assignedLeadPhones } }] : []),
      ...(assignedNumbers.length > 0
        ? [{
            localNumber: { $in: assignedNumbers },
            startedAt: { $gte: cutoff }
          }]
        : [])
    ]
  };
};
