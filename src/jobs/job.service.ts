import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ConfigService } from '@nestjs/config';
import { ProducerVerificationService } from '../producer-verification/producer-verification.service';

@Injectable()
export class JobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobService.name);
  private boss?: PgBoss;
  constructor(private readonly config: ConfigService, @Inject(forwardRef(() => ProducerVerificationService)) private readonly verification: ProducerVerificationService) {}
  async onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.boss = new PgBoss({ db: this.config.get('JOB_DATABASE_URL') ?? this.config.getOrThrow('DATABASE_URL') });
    await this.boss.start();
    await this.boss.createQueue('producer-verification');
    await this.boss.work<{ verificationId: string }>('producer-verification', async ([job]) => { await this.verification.process(job.data.verificationId); });
  }
  async enqueue(verificationId: string) {
    if (!this.boss) return this.verification.process(verificationId);
    await this.boss.send('producer-verification', { verificationId }, { singletonKey: verificationId });
  }
  async onModuleDestroy() { if (this.boss) await this.boss.stop(); this.logger.debug('Job service stopped'); }
}
