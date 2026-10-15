import { z } from 'zod';

const nullableText = z.string().trim().min(1).nullable().optional();

export const producerSchema = z.object({
  first_name: z.string(), last_name: z.string(), email: z.string(), salutation: nullableText,
  is_business: z.boolean(), is_reverse_charge: z.boolean(),
  deliv_address_street: z.string(), deliv_address_house_number: z.string(),
  deliv_address_zipcode: z.string(), deliv_address_city: z.string(),
  subscription_reason: z.enum(['E01', 'E02', 'E03']),
  production_type: z.enum(['Solar', 'Wind', 'Gas', 'Hydro', 'Battery']),
  plant_capacity_kw: z.number(),
  plant_specifics: z.object({ latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional() }).nullable().optional(),
  market_location_identifier: nullableText, tranche: nullableText, preferred_delivery_start: nullableText,
  saas_customer_id: nullableText, saas_contract_id: nullableText, product_name: nullableText,
  consumer_saas_contract_id: nullableText, control_resource: z.unknown().nullable().optional(), technical_resources: z.unknown().nullable().optional(),
  contract_start_utc: z.string(), contract_end_utc: z.string(), building_id: z.string(),
}).strict();

export type ProducerInput = z.infer<typeof producerSchema>;
