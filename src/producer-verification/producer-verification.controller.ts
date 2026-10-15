import { Body, Controller, Headers, Param, Post, Get, BadRequestException } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProducerVerificationService } from './producer-verification.service';

@ApiTags('producer-verifications')
@Controller('api/v1/producer-verifications')
export class ProducerVerificationController {
  constructor(private readonly service: ProducerVerificationService) {}
  @Post()
  @ApiOperation({ summary: 'Receive and verify a producer onboarding request' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    if (!key?.trim()) throw new BadRequestException({ code: 'MISSING_IDEMPOTENCY_KEY', message: 'Idempotency-Key is required.' });
    return this.service.create(body, key.trim());
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Post(':id/retry') retry(@Param('id') id: string) { return this.service.retry(id); }
}
