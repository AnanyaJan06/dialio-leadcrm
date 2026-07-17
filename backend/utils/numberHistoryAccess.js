import { getAssignedNumbersForUser } from './twilioNumbers.js';

const defaultHistoryDays = 14;

export const getNumberHistoryDays = () => {
  const value = Number(process.env.NUMBER_HISTORY_DAYS);
  return Number.isFinite(value) && value > 0 ? value : defaultHistoryDays;
};

export const getNumberHistoryCutoff = () => {
  const days = getNumberHistoryDays();
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

export const getAssignedNumberHistoryContext = async (user) => {
  if (!user?.id || user.role === 'admin') {
    return {
      assignedNumbers: [],
      cutoff: null
    };
  }

  const assignedNumbers = await getAssignedNumbersForUser(user.id);

  return {
    assignedNumbers,
    cutoff: getNumberHistoryCutoff()
  };
};
