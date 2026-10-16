import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { producerOnboardingSchema } from './onboarding-schema';
import { getSapLocation } from './sap-client';
import { validate } from './validation';
import { verifyProducer } from './verification';
import { VerificationResponse } from './types';
import { deliverToSidely } from './sidely-client';

export const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Idempotency-Key'] }));
app.use(express.json());

function schemaFailureResponse(issues: Array<{ path: PropertyKey[]; message: string }>): VerificationResponse {
  return {
    status: 'VALIDATION_FAILED',
    valid: false,
    verified: false,
    message: 'The request does not match the producer onboarding contract.',
    validation: {
      passed: false,
      checks: issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        result: 'INVALID',
        message: issue.message,
      })),
    },
    verification: { performed: false, source: null, checks: [] },
    onboarding_action: 'CORRECT_DATA',
  };
}

function malformedJsonResponse(): VerificationResponse {
  return {
    status: 'VALIDATION_FAILED',
    valid: false,
    verified: false,
    message: 'The request body is not valid JSON.',
    validation: {
      passed: false,
      checks: [
        {
          field: 'request',
          result: 'INVALID',
          message: 'The request body is not valid JSON.',
        },
      ],
    },
    verification: { performed: false, source: null, checks: [] },
    onboarding_action: 'CORRECT_DATA',
  };
}

app.get('/health/live', (_request, response) => response.status(200).json({ status: 'ok' }));

app.post('/api/onboarding/verify', async (request: Request, response: Response) => {
  try {
    const parsed = producerOnboardingSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json(schemaFailureResponse(parsed.error.issues));
      return;
    }

    const result = await verifyProducer(parsed.data, validate(parsed.data));

    // Only a complete SAP verification is eligible for external submission.
    // Locally accepted but unverified applications remain local and are not
    // forwarded to Sidely.
    if (result.status === 'VERIFIED') {
      result.sidely_delivery = await deliverToSidely(parsed.data);
    }

    const statusCode =
      result.status === 'VALIDATION_FAILED' ? 400 :
      result.status === 'SOURCE_UNAVAILABLE' ? 503 :
      200;

    response.status(statusCode).json(result);
  } catch (error) {
    console.error('Verification request failed:', error);
    if (!response.headersSent) response.status(500).json({ status: 'SERVER_ERROR', message: 'Die Validierungs-API konnte die Anfrage nicht verarbeiten.' });
  }
});

app.get('/api/mock-sap/locations/:identifier', async (request: Request, response: Response) => {
  try {
    const identifier = String(request.params.identifier);
    const location = await getSapLocation(identifier);

    if (!location) {
      response.status(404).json({ message: 'Mock SAP location not found.' });
      return;
    }

    response.status(200).json({ source: 'MOCK_SAP_DEMONSTRATION', ...location });
  } catch {
    response.status(503).json({ message: 'The mock SAP source is currently unavailable.' });
  }
});

// Handles malformed JSON bodies thrown by express.json() before any route
// runs, so the API always returns the same structured response shape
// instead of Express's default HTML/stack-trace error page.
app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  const isBodyParserSyntaxError =
    error instanceof SyntaxError && 'status' in error && (error as { status?: number }).status === 400;

  if (isBodyParserSyntaxError) {
    response.status(400).json(malformedJsonResponse());
    return;
  }
  if (!response.headersSent) {
    response.status(500).json({ status: 'SERVER_ERROR', message: 'Die Validierungs-API ist unerwartet fehlgeschlagen.' });
    return;
  }
  next(error);
});
