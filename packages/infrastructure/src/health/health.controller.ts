import { Controller, Get, HttpStatus, Inject, Res, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service';
import { LivenessResponseDto, QueueHealthResponseDto, ReadinessResponseDto } from './health.dto';

interface StatusResponse {
  status(statusCode: number): StatusResponse;
}

@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ operationId: 'getLiveness', summary: 'Get runtime liveness' })
  @ApiOkResponse({ type: LivenessResponseDto })
  getLiveness(): LivenessResponseDto {
    return this.health.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ operationId: 'getReadiness', summary: 'Get runtime dependency readiness' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({ type: ReadinessResponseDto })
  async getReadiness(
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<ReadinessResponseDto> {
    const result = await this.health.getReadiness();

    if (result.status === 'unavailable') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }

  @Get('queue')
  @ApiOperation({ operationId: 'getQueueHealth', summary: 'Get queue transport readiness' })
  @ApiOkResponse({ type: QueueHealthResponseDto })
  @ApiServiceUnavailableResponse({ type: QueueHealthResponseDto })
  async getQueueHealth(
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<QueueHealthResponseDto> {
    const result = await this.health.getQueueHealth();

    if (result.status === 'unavailable') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
