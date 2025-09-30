import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { DatasusService } from './datasus.service';
import { SiasusArquivoDto } from './siasus-arquivo.type';

@Controller('datasus')
export class DatasusController {
  constructor(private readonly datasusService: DatasusService) {}

  @Post('competence')
  getCompetence(@Body('competence') competence: string) {
    return this.datasusService.getCompetence(competence);
  }

  @Post('arquivo')
  getArquivo(
    @Body('payload')
    payload: SiasusArquivoDto
  ) {
    return this.datasusService.requestFtp(payload);
  }

  @Post('arquivo/multiplo')
  getArquivoMultiplo(
    @Body('payload')
    payload: SiasusArquivoDto
  ) {
    return this.datasusService.downloadFromDatasus(payload);
  }
  
}
