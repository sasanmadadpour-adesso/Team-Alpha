import { validatePortalData } from './portal-contract.mjs';

const config = globalThis.WHITE_LABEL_CONFIG || {};
export const PORTAL_API_PATH = config.portalPath || '/api/v1/house-member-portal';
export const PORTAL_API_BASE_URL = String(config.apiBaseUrl || '').replace(/\/$/, '');
export const VALIDATE_MEMBER_PATH = config.validateMemberPath || '/api/v1/validate-house-member';
const AUTHORIZATION = config.token ? { Authorization: `Bearer ${config.token}` } : {};
export class PortalApiError extends Error {
  constructor(status) { super(status === 401 ? 'Authentication required' : status === 403 ? 'Access denied' : `Portal API request failed (${status})`); this.name = 'PortalApiError'; this.status = status; }
}
export async function validateHouseMember(malo, houseNumber, { signal } = {}) {
  if (!malo || !houseNumber) throw new PortalApiError(400);
  const query = new URLSearchParams({ malo: String(malo), houseNumber: String(houseNumber) });
  const response = await fetch(`${PORTAL_API_BASE_URL}${VALIDATE_MEMBER_PATH}?${query}`, {
    method: 'GET', headers: { Accept: 'text/plain', ...AUTHORIZATION }, signal
  });
  if (!response.ok) throw new PortalApiError(response.status);
  return (await response.text()).trim() === 'true';
}
export async function getPortalData(malo, range = '7d', { signal } = {}) {
  if (!malo) throw new PortalApiError(400);
  const query = new URLSearchParams({ malo: String(malo), range });
  const response = await fetch(`${PORTAL_API_BASE_URL}${PORTAL_API_PATH}?${query}`, { method: 'GET', headers: { Accept: 'application/json', ...AUTHORIZATION }, signal });
  if (!response.ok) throw new PortalApiError(response.status);
  return validatePortalData(await response.json());
}
