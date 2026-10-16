import { validatePortalData } from './portal-contract.mjs';

const config = globalThis.WHITE_LABEL_CONFIG || {};
export const PORTAL_API_PATH = config.portalPath || '/api/v1/house-member-portal';
export const PORTAL_API_BASE_URL = String(config.apiBaseUrl || '').replace(/\/$/, '');
export class PortalApiError extends Error {
  constructor(status) { super(status === 401 ? 'Authentication required' : status === 403 ? 'Access denied' : `Portal API request failed (${status})`); this.name = 'PortalApiError'; this.status = status; }
}
export async function getPortalData(range = '7d', { signal } = {}) {
  const response = await fetch(`${PORTAL_API_BASE_URL}${PORTAL_API_PATH}?range=${encodeURIComponent(range)}`, { method: 'GET', credentials: config.credentials || 'same-origin', headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new PortalApiError(response.status);
  return validatePortalData(await response.json());
}
