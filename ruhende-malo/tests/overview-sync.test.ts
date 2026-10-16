import { describe, expect, it, vi } from 'vitest';
import { overviewApiAuthorized, pushOverviewSnapshot, toOverviewConstruct } from '../srv/overview-sync.js';

describe('Construct Overview integration feed', () => {
  it('maps every construct member role to the existing Overview contract', () => {
    const common = { sourceId: 'row-1', buildingId: 'B-MUL-01', city: 'Mülheim', streetAddress: 'Main 1', participates: true };
    const household = toOverviewConstruct({ ...common, role: 'Haushaltsverbrauch', maloId: '111', meloId: 'DE-HH' }, { constructId: 'B-MUL-01', stage: 'SWITCHED' }, { maloId: '111', businessState: 'RUHEND' });
    const counter = toOverviewConstruct({ ...common, sourceId: 'row-2', role: 'Marktlokation Reststrom', maloId: '222', meloId: 'DE-RS' });
    const producer = toOverviewConstruct({ ...common, sourceId: 'row-3', role: 'Solaranlage', maloId: '333', generationFeedInMaloId: '444', meloId: 'DE-PV' });

    expect(household).toMatchObject({ ID: 'ruhende-111-cm93LTE', primaryMaLo: '111', nodeType: 'HOUSEHOLD', roleCode: 'HOUSEHOLD', participationCriticality: 3, businessState: 'RUHEND' });
    expect(counter).toMatchObject({ primaryMaLo: '222', nodeType: 'COUNTER', roleCode: 'RESIDUAL_SUPPLY' });
    expect(producer).toMatchObject({ primaryMaLo: '444', importMaLo: '333', exportMaLo: '444', nodeType: 'PRODUCER', roleCode: 'GENERATION' });
    expect([household, counter, producer].every((row) => row && !/[\s'()%]/.test(row.ID))).toBe(true);
  });

  it('supports an optional API key in either accepted header', () => {
    expect(overviewApiAuthorized({}, '')).toBe(true);
    expect(overviewApiAuthorized({ 'x-api-key': 'secret' }, 'secret')).toBe(true);
    expect(overviewApiAuthorized({ authorization: 'Bearer secret' }, 'secret')).toBe(true);
    expect(overviewApiAuthorized({ authorization: 'Bearer wrong' }, 'secret')).toBe(false);
  });

  it('pushes the same snapshot envelope accepted by the Overview webhook', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 202 } as Response));
    const snapshot = [toOverviewConstruct({ sourceId: 'row-1', buildingId: 'B-1', role: 'Haushaltsverbrauch', maloId: '111', participates: true })!];
    await pushOverviewSnapshot({ url: 'http://overview/api/webhooks/registered', apiKey: 'secret', snapshot, fetchImpl: fetchImpl as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, request] = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0];
    expect(request?.headers).toMatchObject({ 'x-api-key': 'secret', authorization: 'Bearer secret' });
    expect(JSON.parse(String(request?.body))).toEqual({ value: snapshot });
  });
});
