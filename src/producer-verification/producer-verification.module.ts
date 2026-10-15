import { forwardRef, Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { SapIntegrationModule } from '../sap-integration/sap-integration.module';
import { ValidationModule } from '../validation/validation.module';
import { ProducerVerificationController } from './producer-verification.controller';
import { ProducerVerificationService } from './producer-verification.service';

@Module({ imports: [ValidationModule, SapIntegrationModule, forwardRef(() => JobsModule)], controllers: [ProducerVerificationController], providers: [ProducerVerificationService], exports: [ProducerVerificationService] })
export class ProducerVerificationModule {}
