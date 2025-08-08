export const API_BASE = import.meta.env.VITE_API_BASE || "";
export const api = (p: string) => `${API_BASE}${p}`;
