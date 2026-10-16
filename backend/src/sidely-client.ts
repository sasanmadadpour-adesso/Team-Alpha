import { randomUUID } from 'node:crypto';
import { ProducerOnboarding } from './types';

const DEFAULT_SIDELY_URL = 'https://ruhend.sidely.dev/api/v1/producer-onboardings';
const REQUEST_TIMEOUT_MS = 10_000;

export type SidelyDelivery = {
  attempted: boolean;
  delivered: boolean;
  status: 'DELIVERED' | 'FAILED' | 'NOT_CONFIGURED' | 'SKIPPED';
  http_status?: number;
  message: string;
};

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
    const response = await fetch(process.env.SIDELY_API_URL ?? DEFAULT_SIDELY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        attempted: true,
        delivered: true,
        status: 'DELIVERED',
        http_status: response.status,
        message: 'The onboarding was delivered to Sidely.',
      };
    }

    return {
      attempted: true,
      delivered: false,
      status: 'FAILED',
      http_status: response.status,
      message: `Sidely rejected the onboarding request (HTTP ${response.status}).`,
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
