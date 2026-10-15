import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decision, Prisma, VerificationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { payloadHash } from '../common/canonical-json';
import { Finding, classifyIdentifier, normalizeText } from '../common/types';
import { PrismaService } from '../persistence/prisma.service';
import { ValidationService } from '../validation/validation.service';
import { SAP_PROVIDER } from '../sap-integration/sap-integration.module';
import { AuthoritativeLocation, SapVerificationProvider } from '../sap-integration/contracts/sap-verification.provider';
import { JobService } from '../jobs/job.service';

@Injectable()
export class ProducerVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: ValidationService,
    private readonly config: ConfigService,
    @Inject(SAP_PROVIDER) private readonly sap: SapVerificationProvider,
    private readonly jobs: JobService,
  ) {}

  async create(input: unknown, idempotencyKey: string) {
    const hash = payloadHash(input);
    const existing = await this.prisma.verificationRequest.findUnique({ where: { idempotencyKey }, include: { findings: true, checks: true } });
    if (existing) {
      if (existing.payloadHash !== hash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key was already used with another payload.' });
      return { verification_id: existing.id, status: existing.status, received_at: existing.receivedAt };
    }
    const parsed = this.validation.parseAndValidate(input);
    if (!parsed.parsed) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'The request does not match the producer onboarding contract.', findings: parsed.findings });
    const normalizedResult = this.validation.normalize(parsed.parsed);
    const persisted = await this.prisma.verificationRequest.create({ data: {
      idempotencyKey, payloadHash: hash, schemaVersion: '1.0', rawPayload: input as Prisma.InputJsonValue,
      normalizedPayload: normalizedResult.normalized as unknown as Prisma.InputJsonValue,
      status: normalizedResult.findings.some((f) => f.severity === 'ERROR') ? VerificationStatus.VALIDATION_FAILED : VerificationStatus.RECEIVED,
      validationCompletedAt: new Date(),
      findings: normalizedResult.findings.length ? { create: normalizedResult.findings.map(this.findingData) } : undefined,
    } });
    if (normalizedResult.findings.some((f) => f.severity === 'ERROR')) return { verification_id: persisted.id, status: persisted.status, received_at: persisted.receivedAt };
    await this.prisma.verificationRequest.update({ where: { id: persisted.id }, data: { status: VerificationStatus.VERIFICATION_IN_PROGRESS } });
    await this.jobs.enqueue(persisted.id);
    return { verification_id: persisted.id, status: VerificationStatus.VERIFICATION_IN_PROGRESS, received_at: persisted.receivedAt };
  }

  async get(id: string) {
    const record = await this.prisma.verificationRequest.findUnique({ where: { id }, include: { findings: true, checks: true } });
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Verification request was not found.' });
    return { verification_id: record.id, status: record.status, decision: record.decision, schema_version: record.schemaVersion, received_at: record.receivedAt, validation: { status: record.findings.some((f) => f.severity === 'ERROR') ? 'FAILED' : record.findings.length ? 'PASSED_WITH_WARNINGS' : 'PASSED', findings: record.findings }, verification: { status: record.verificationCompletedAt ? 'COMPLETED' : 'PENDING', checks: record.checks } };
  }

  async retry(id: string) {
    const record = await this.prisma.verificationRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Verification request was not found.' });
    if (record.status !== VerificationStatus.SOURCE_UNAVAILABLE) throw new ConflictException({ code: 'NOT_RETRIABLE', message: 'Only source-unavailable requests can be retried.' });
    await this.prisma.verificationRequest.update({ where: { id }, data: { status: VerificationStatus.VERIFICATION_IN_PROGRESS, decision: null, verificationCompletedAt: null } });
    await this.jobs.enqueue(id);
    return { verification_id: id, status: VerificationStatus.VERIFICATION_IN_PROGRESS };
  }

  async process(id: string) {
    const request = await this.prisma.verificationRequest.findUnique({ where: { id } });
    if (!request) return;
    const payload = request.normalizedPayload as Record<string, unknown>;
    const identifier = String(payload.market_location_identifier ?? '');
    const effectiveAt = String(payload.preferred_delivery_start ?? payload.contract_start_utc);
    const correlationId = randomUUID();
    const startedAt = new Date();
    let result: AuthoritativeLocation;
    try {
      result = await this.sap.resolveIdentifier({ identifier, detectedType: classifyIdentifier(identifier), effectiveAt, correlationId });
      await this.prisma.integrationAttempt.create({ data: { verificationRequestId: id, provider: this.config.get('SAP_PROVIDER', 'mock'), operation: 'resolveIdentifier', attemptNumber: 1, correlationId, status: result.status, startedAt, completedAt: new Date(), requestMetadata: { identifierType: classifyIdentifier(identifier) }, responseMetadata: { sourceSystem: result.sourceSystem, result: result.status } } });
    } catch (error) {
      await this.prisma.integrationAttempt.create({ data: { verificationRequestId: id, provider: this.config.get('SAP_PROVIDER', 'mock'), operation: 'resolveIdentifier', attemptNumber: 1, correlationId, status: 'SOURCE_UNAVAILABLE', startedAt, completedAt: new Date(), errorCode: 'PROVIDER_ERROR', errorMessage: error instanceof Error ? error.message : 'Provider error', requestMetadata: { identifierType: classifyIdentifier(identifier) } } });
      await this.prisma.verificationRequest.update({ where: { id }, data: { status: VerificationStatus.SOURCE_UNAVAILABLE, decision: Decision.SOURCE_UNAVAILABLE } });
      return;
    }
    const checks = this.compare(payload, result, effectiveAt);
    await this.prisma.$transaction(async (tx) => {
      await tx.verificationCheck.deleteMany({ where: { verificationRequestId: id } });
      if (checks.length) await tx.verificationCheck.createMany({ data: checks.map((check) => ({ verificationRequestId: id, ...check })) });
      const decision = this.deriveDecision(result, checks);
      await tx.verificationRequest.update({ where: { id }, data: { status: decision as VerificationStatus, decision, verificationCompletedAt: new Date() } });
    });
  }

  private compare(payload: Record<string, unknown>, authoritative: AuthoritativeLocation, effectiveAt: string) {
    const checks: Array<{ ruleId: string; field: string; result: string; severity: string; submittedValue?: Prisma.InputJsonValue; authoritativeValue?: Prisma.InputJsonValue; sourceSystem?: string; sourceRecordId?: string; effectiveAt: Date; details?: Prisma.InputJsonValue }> = [];
    const add = (ruleId: string, field: string, result: string, severity: string, submittedValue?: unknown, authoritativeValue?: unknown, details?: Record<string, unknown>) => checks.push({ ruleId, field, result, severity, submittedValue: submittedValue as Prisma.InputJsonValue, authoritativeValue: authoritativeValue as Prisma.InputJsonValue, sourceSystem: authoritative.sourceSystem, sourceRecordId: authoritative.sourceRecordId, effectiveAt: new Date(effectiveAt), details: details as Prisma.InputJsonValue });
    add('SAP-LOCATION-001', 'market_location_identifier', authoritative.status, authoritative.status === 'FOUND' ? 'INFO' : authoritative.status === 'SOURCE_UNAVAILABLE' ? 'ERROR' : 'ERROR', payload.market_location_identifier, authoritative.identifier, authoritative.details);
    if (authoritative.status !== 'FOUND') return checks;
    add('SAP-ID-TYPE-001', 'market_location_identifier', classifyIdentifier(String(payload.market_location_identifier)) === authoritative.identifierType ? 'MATCH' : 'MISMATCH', 'ERROR', classifyIdentifier(String(payload.market_location_identifier)), authoritative.identifierType);
    add('SAP-NETWORK-001', 'market_location_identifier', authoritative.networkOperatorMatch ? 'MATCH' : 'MISMATCH', authoritative.networkOperatorMatch ? 'INFO' : 'ERROR', this.config.get('EXPECTED_NETWORK_OPERATOR_ID'), authoritative.networkOperatorMatch);
    if (authoritative.address) {
      const submitted = { street: normalizeText(String(payload.deliv_address_street)), houseNumber: normalizeText(String(payload.deliv_address_house_number)), postalCode: String(payload.deliv_address_zipcode), city: normalizeText(String(payload.deliv_address_city)) };
      for (const key of ['street', 'houseNumber', 'postalCode', 'city'] as const) add(`SAP-ADDRESS-${key.toUpperCase()}-001`, `deliv_address_${key}`, submitted[key].toLowerCase() === authoritative.address[key].toLowerCase() ? 'MATCH' : 'MISMATCH', ['houseNumber', 'postalCode'].includes(key) && submitted[key] !== authoritative.address[key] ? 'ERROR' : 'WARNING', submitted[key], authoritative.address[key]);
    }
    if (authoritative.plant) {
      const submittedTechnology = String(payload.production_type).toUpperCase();
      add('SAP-PLANT-TECHNOLOGY-001', 'production_type', submittedTechnology === authoritative.plant.technology ? 'MATCH' : 'MISMATCH', 'ERROR', submittedTechnology, authoritative.plant.technology);
      const submittedCapacity = Number(payload.plant_capacity_kw); const actual = authoritative.plant.capacityKw; const tolerance = Math.max(Number(this.config.get('CAPACITY_ABSOLUTE_TOLERANCE_KW', 0.1)), actual * Number(this.config.get('CAPACITY_RELATIVE_TOLERANCE_PERCENT', 1)) / 100);
      add('SAP-PLANT-CAPACITY-001', 'plant_capacity_kw', Math.abs(submittedCapacity - actual) <= tolerance ? 'MATCH' : 'MISMATCH', Math.abs(submittedCapacity - actual) <= tolerance ? 'INFO' : 'WARNING', submittedCapacity, actual, { tolerance });
    }
    add('SAP-BUILDING-001', 'building_id', String(payload.building_id) === authoritative.buildingReference ? 'MATCH' : 'MISMATCH', String(payload.building_id) === authoritative.buildingReference ? 'INFO' : 'ERROR', payload.building_id, authoritative.buildingReference);
    return checks;
  }

  private deriveDecision(result: AuthoritativeLocation, checks: Array<{ result: string; severity: string }>): Decision {
    if (result.status === 'SOURCE_UNAVAILABLE') return Decision.SOURCE_UNAVAILABLE;
    if (result.status === 'NOT_FOUND' || result.status === 'NOT_ACTIVE_AT_DATE' || result.status === 'MULTIPLE_MATCHES') return Decision.MANUAL_REVIEW;
    if (result.networkOperatorMatch === false || checks.some((c) => c.result === 'MISMATCH' && c.severity === 'ERROR')) return Decision.REJECTED;
    if (checks.some((c) => c.result === 'MISMATCH')) return Decision.MANUAL_REVIEW;
    return Decision.VERIFIED;
  }

  private findingData(finding: Finding): Prisma.ValidationFindingCreateWithoutRequestInput {
    return { ruleId: finding.ruleId, severity: finding.severity, field: finding.field, submittedValue: finding.submittedValue as Prisma.InputJsonValue, normalizedValue: finding.normalizedValue as Prisma.InputJsonValue, message: finding.message, details: finding.details as Prisma.InputJsonValue };
  }
}
