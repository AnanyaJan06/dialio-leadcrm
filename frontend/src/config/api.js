const configuredApiUrl = import.meta.env.VITE_API_URL?.split(',')[0]?.trim();

export const BACKEND_URL = configuredApiUrl || 'http://localhost:5000';
