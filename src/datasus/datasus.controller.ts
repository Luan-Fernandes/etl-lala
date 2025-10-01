import { Body, Controller, Get, Post, Query, BadRequestException } from '@nestjs/common';
import { DatasusService } from './datasus.service';
@Controller('datasus')
export class DatasusController {
  constructor(private readonly datasusService: DatasusService) {}
}
