// Single place that knows where the backend lives.
// - Development: VITE_API_URL is empty -> relative "/api" (Vite proxies it to :4000)
// - Production : VITE_API_URL=https://api.yourdomain.com
const ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API_BASE = `${ORIGIN}/api`;

export async function apiFetch(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    ...options,
    headers: isForm
      ? { ...(options.headers || {}) }
      : { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Backend returns uploaded-file paths like "/uploads/audits/x.mp3".
// Turn them into a URL the browser can open (works for dev proxy and production).
export function fileUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${ORIGIN}${url}`;
}

// Convenience wrappers
export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) =>
    apiFetch(path, { method: 'PATCH', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
  upload: (path, formData) => apiFetch(path, { method: 'POST', body: formData }),
};
