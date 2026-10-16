import { afterEach, describe, expect, it } from 'vitest';
import { accessCodeRequired, accessCodeValid, createLimiter, signSession, verifySession } from '../srv/auth.js';

describe('demo access layer', () => {
  afterEach(() => { delete process.env.RUHEND_ACCESS_CODE; });

  it('a signed session verifies, a tampered or expired one does not', () => {
    const { token } = signSession('m.weber', 1_000);
    expect(verifySession(token, 2_000)?.name).toBe('M. Weber');
    expect(verifySession(`${token.slice(0, -3)}abc`, 2_000)).toBeUndefined();
    expect(verifySession(token, 1_000 + 13 * 3_600_000)).toBeUndefined();
    expect(verifySession('s1.nobody.9999999999999.AAAA')).toBeUndefined();
  });

  it('without RUHEND_ACCESS_CODE signing in is open; with it only the exact code works', () => {
    expect(accessCodeRequired()).toBe(false);
    expect(accessCodeValid(undefined)).toBe(true);
    process.env.RUHEND_ACCESS_CODE = 'open-sesame';
    expect(accessCodeRequired()).toBe(true);
    expect(accessCodeValid('open-sesame')).toBe(true);
    expect(accessCodeValid('open-sesame ')).toBe(false);
    expect(accessCodeValid('')).toBe(false);
    expect(accessCodeValid(undefined)).toBe(false);
  });

  it('the limiter blocks after max failures within the window, per address, and recovers', () => {
    const l = createLimiter(3, 1000);
    for (let i = 0; i < 3; i++) l.fail('1.2.3.4', 100 + i);
    expect(l.blocked('1.2.3.4', 200)).toBe(true);
    expect(l.blocked('5.6.7.8', 200)).toBe(false);
    expect(l.blocked('1.2.3.4', 1200)).toBe(false);
    l.fail('1.2.3.4', 1300); l.reset('1.2.3.4');
    expect(l.blocked('1.2.3.4', 1301)).toBe(false);
  });
});
