import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { PersistenceModule } from './persistence/persistence.module';
import { ProducerVerificationModule } from './producer-verification/producer-verification.module';
import { SapIntegrationModule } from './sap-integration/sap-integration.module';
import { ValidationModule } from './validation/validation.module';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: (env) => configuration(env) }), PersistenceModule, ValidationModule, SapIntegrationModule, ProducerVerificationModule, JobsModule, HealthModule] })
export class AppModule {}
