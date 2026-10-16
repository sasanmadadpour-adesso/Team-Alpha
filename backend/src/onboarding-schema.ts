import { z } from 'zod';

// Required text must not be empty or whitespace-only.
const requiredText = z.string().trim().min(1);

// Optional text is trimmed; blank values normalize to null.
const optionalText = z.string().trim().min(1).nullable().optional();

export const producerOnboardingSchema = z
  .object({
    first_name: requiredText,
    last_name: requiredText,
    email: requiredText,
    salutation: optionalText,

    is_business: z.boolean(),
    is_reverse_charge: z.boolean(),

    deliv_address_street: requiredText,
    deliv_address_house_number: requiredText,
    deliv_address_zipcode: requiredText,
    deliv_address_city: requiredText,

    subscription_reason: z.enum(['E01', 'E02', 'E03']),
    construct_type: z.enum(['FEED_IN', 'BUILDING']).default('FEED_IN'),
    production_type: z.enum(['Keine', 'Solar', 'Wind', 'Gas', 'Hydro', 'Battery']),
    plant_capacity_kw: z.number(),

    plant_specifics: z
      .object({
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),

    market_location_identifier: optionalText,
    tranche: optionalText,
    preferred_delivery_start: optionalText,

    saas_customer_id: optionalText,
    saas_contract_id: optionalText,
    product_name: optionalText,
    consumer_saas_contract_id: optionalText,

    control_resource: z.unknown().nullable().optional(),
    technical_resources: z.unknown().nullable().optional(),

    contract_start_utc: requiredText,
    contract_end_utc: requiredText,
    building_id: requiredText,
  })
  .strict();

export type ProducerInput = z.infer<typeof producerOnboardingSchema>;
