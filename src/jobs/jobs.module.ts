import { forwardRef, Module } from '@nestjs/common';
import { JobService } from './job.service';
import { ProducerVerificationModule } from '../producer-verification/producer-verification.module';

@Module({ imports: [forwardRef(() => ProducerVerificationModule)], providers: [JobService], exports: [JobService] })
export class JobsModule {}
