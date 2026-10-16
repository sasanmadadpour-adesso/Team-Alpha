const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file = path.resolve(__dirname, '../../.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();
const baseUrl = (process.env.RUHEND_API_BASE_URL || '').replace(/\/$/, '');
const token = process.env.RUHEND_API_TOKEN || '';

class RuhendApiError extends Error {
  constructor(message, status, cause) {
    super(message, { cause });
    this.name = 'RuhendApiError';
    this.status = status;
  }
}

async function request(pathname, query, accept) {
  if (!baseUrl || !token) throw new RuhendApiError('External house-member service is not configured.', 503);
  const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}?${params}`, {
      headers: { Accept: accept, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new RuhendApiError('External house-member service is unavailable.', error.name === 'TimeoutError' ? 504 : 502, error);
  }
  if (!response.ok) {
    throw new RuhendApiError(
      response.status === 401 || response.status === 403
        ? 'External house-member service rejected its configured API token.'
        : 'External house-member service returned an error.',
      response.status
    );
  }
  return response;
}

function extractHouseNumber(address) {
  return String(address || '').match(/\b(\d+[A-Za-z]?)\b/)?.[1]?.toUpperCase() || '';
}

let participantCache = null;
let participantCacheExpiresAt = 0;
async function participants() {
  if (participantCache && participantCacheExpiresAt > Date.now()) return participantCache;
  const response = await request('/api/v1/Participants', {}, 'application/json');
  let rows;
  try {
    rows = await response.json();
  } catch (error) {
    throw new RuhendApiError('External participant service returned invalid JSON.', 502, error);
  }
  if (!Array.isArray(rows)) throw new RuhendApiError('External participant service returned an invalid collection.', 502);
  participantCache = rows;
  participantCacheExpiresAt = Date.now() + 30_000;
  return rows;
}

async function validateHouseMember(malo, houseNumber) {
  const normalizedMalo = String(malo || '').trim();
  const normalizedHouseNumber = String(houseNumber || '').trim().toUpperCase();
  if (!normalizedMalo || !normalizedHouseNumber) return false;
  const matches = (await participants()).filter(row => (
    String(row.maloId || '').trim() === normalizedMalo &&
    row.participates === true &&
    String(row.role || '').toLowerCase() === 'haushaltsverbrauch' &&
    extractHouseNumber(row.streetAddress) === normalizedHouseNumber
  ));
  return matches.length === 1;
}

async function getPortalData(malo, range) {
  const response = await request('/api/v1/house-member-portal', { malo, range }, 'application/json');
  try {
    return await response.json();
  } catch (error) {
    throw new RuhendApiError('External house-member service returned invalid JSON.', 502, error);
  }
}

module.exports = { RuhendApiError, getPortalData, validateHouseMember, extractHouseNumber };
