import express, { NextFunction, Request, Response } from 'express';
import { producerOnboardingSchema } from './onboarding-schema';
import { getSapLocation } from './sap-client';
import { validate } from './validation';
import { verifyProducer } from './verification';
import { VerificationResponse } from './types';

export const app = express();
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

app.post('/api/onboarding/verify', async (request: Request, response: Response) => {
  const parsed = producerOnboardingSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json(schemaFailureResponse(parsed.error.issues));
    return;
  }

  const result = await verifyProducer(parsed.data, validate(parsed.data));

  const statusCode =
    result.status === 'VALIDATION_FAILED' ? 400 :
    result.status === 'SOURCE_UNAVAILABLE' ? 503 :
    200;

  response.status(statusCode).json(result);
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

  if (!isBodyParserSyntaxError) {
    next(error);
    return;
  }

  response.status(400).json(malformedJsonResponse());
});
