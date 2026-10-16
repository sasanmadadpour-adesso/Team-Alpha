import { randomUUID } from 'node:crypto';
import { ProducerOnboarding } from './types';
import { getSapLocation } from './sap-client';

const DEFAULT_SIDELY_URL = 'https://ruhend.sidely.dev/api/v1/producer-onboardings';
const DEFAULT_REGISTER_CONSTRUCT_URL = 'https://ruhend.sidely.dev/api/v1/registerConstruct';
const REQUEST_TIMEOUT_MS = 10_000;

export type SidelyDelivery = {
  attempted: boolean;
  delivered: boolean;
  status: 'DELIVERED' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED';
  http_status?: number;
  message: string;
};

type SidelyConstructParticipant = {
  role: 'Marktlokation Reststrom' | 'Haushaltsverbrauch' | 'Solaranlage' | 'Windkraftanlage';
  maloId: string;
  meloId: string;
  participates: boolean;
  generationFeedInMaloId: string | null;
  supplyStartUtc: string | null;
};

// Keep the Sidely contract independent from the internal SAP/building
// verification model. The latter may contain construct_type, units, and
// building MaLo fields that are not part of the established producer
// onboarding payload accepted by Sidely.
export async function toSidelyPayload(input: ProducerOnboarding): Promise<Record<string, unknown>> {
  let marketLocationMalo = input.market_location_malo ?? null;
  if (!marketLocationMalo && input.market_location_identifier) {
    const sapLocation = await getSapLocation(input.market_location_identifier);
    marketLocationMalo = sapLocation?.market_location_malo ?? null;
  }

  const {
    market_location_malo: _marketLocationMalo,
    building_market_location_malo: _buildingMarketLocationMalo,
    units: _units,
    ...sidelyPayload
  } = input;
  return {
    ...sidelyPayload,
    construct_type: input.construct_type ?? 'FEED_IN',
    market_location_malo: marketLocationMalo,
    preferred_delivery_start: input.preferred_delivery_start ?? input.contract_start_utc,
  };
}

function dateOnly(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

/** Maps the internal building model to Sidely's distinct registerConstruct contract. */
export function toSidelyConstructPayload(input: ProducerOnboarding): Record<string, unknown> {
  const buildingMalo = input.building_market_location_malo ?? input.market_location_malo;
  if (!buildingMalo) {
    throw new Error('A building MaLo is required for Sidely construct registration.');
  }

  const supplyStartUtc = dateOnly(input.preferred_delivery_start ?? input.contract_start_utc);
  const participants: SidelyConstructParticipant[] = [];
  const addParticipant = (participant: SidelyConstructParticipant) => {
    if (!participants.some((existing) => existing.meloId === participant.meloId)) {
      participants.push(participant);
    }
  };

  // The primary market location represents the residual-supply connection.
  if (input.market_location_identifier) {
    addParticipant({
      role: 'Marktlokation Reststrom',
      maloId: buildingMalo,
      meloId: input.market_location_identifier,
      participates: true,
      generationFeedInMaloId: null,
      supplyStartUtc,
    });
  }

  for (const unit of input.units ?? []) {
    const meloId = unit.kind === 'generator' ? unit.generator_melo : unit.melo;
    if (!meloId) continue;
    const isGenerator = unit.kind === 'generator';
    const role = isGenerator
      ? input.production_type === 'Wind' ? 'Windkraftanlage' : 'Solaranlage'
      : 'Haushaltsverbrauch';
    addParticipant({
      role,
      maloId: isGenerator ? unit.generator_malo ?? buildingMalo : buildingMalo,
      meloId,
      participates: true,
      generationFeedInMaloId: isGenerator ? unit.generator_malo ?? null : null,
      supplyStartUtc,
    });
  }

  if (participants.length === 0) {
    throw new Error('At least one participant is required for Sidely construct registration.');
  }

  return {
    construct: {
      buildingId: input.building_id,
      city: input.deliv_address_city,
      streetAddress: `${input.deliv_address_street} ${input.deliv_address_house_number}`,
      stichtag: supplyStartUtc,
      participants,
    },
  };
}

export async function deliverToSidely(input: ProducerOnboarding): Promise<SidelyDelivery> {
  const token = process.env.SIDELY_API_TOKEN?.trim();
  if (!token) {
    return {
      attempted: false,
      delivered: false,
      status: 'NOT_CONFIGURED',
      message: 'Sidely delivery is not configured on the backend.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const isBuilding = input.construct_type === 'BUILDING';
    const response = await fetch(
      isBuilding
        ? process.env.SIDELY_REGISTER_CONSTRUCT_URL ?? DEFAULT_REGISTER_CONSTRUCT_URL
        : process.env.SIDELY_API_URL ?? DEFAULT_SIDELY_URL,
      {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(isBuilding ? toSidelyConstructPayload(input) : await toSidelyPayload(input)),
      signal: controller.signal,
      },
    );

    if (response.ok) {
      return {
        attempted: true,
        delivered: true,
        status: 'DELIVERED',
        http_status: response.status,
        message: isBuilding
          ? 'The construct was registered with Sidely.'
          : 'The onboarding was delivered to Sidely.',
      };
    }

  const responseBody = await response.text();
    const detail = responseBody.trim();
    return {
      attempted: true,
      delivered: false,
      status: 'FAILED',
      http_status: response.status,
      message: detail
        ? `Sidely rejected the onboarding request (HTTP ${response.status}): ${detail.slice(0, 500)}`
        : `Sidely rejected the onboarding request (HTTP ${response.status}).`,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Sidely did not respond before the delivery timeout.'
      : 'Sidely could not be reached.';
    return { attempted: true, delivered: false, status: 'FAILED', message };
  } finally {
    clearTimeout(timeout);
  }
}
