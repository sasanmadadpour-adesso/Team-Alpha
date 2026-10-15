import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SAP_PROVIDER: z.enum(['mock', 'odata']).default('mock'),
  SAP_BASE_URL: z.string().optional(),
  SAP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  SAP_RETRY_COUNT: z.coerce.number().int().nonnegative().default(2),
  CAPACITY_ABSOLUTE_TOLERANCE_KW: z.coerce.number().nonnegative().default(0.1),
  CAPACITY_RELATIVE_TOLERANCE_PERCENT: z.coerce.number().nonnegative().default(1),
  EXPECTED_NETWORK_OPERATOR_ID: z.string().default('VNB-DEMO'),
  SWAGGER_ENABLED: z.string().default('true').transform((v) => v === 'true'),
  AUTH_ENABLED: z.string().default('false').transform((v) => v === 'true'),
  JOB_DATABASE_URL: z.string().optional(),
});

export function configuration(env: NodeJS.ProcessEnv = process.env) {
  return schema.parse(env);
}

export type AppConfig = ReturnType<typeof configuration>;
