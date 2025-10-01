import { Body, Controller, Get, Post, Query, BadRequestException } from '@nestjs/common';
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
    @Body() body: any,
  ) {
    const dados = body?.dados ?? body?.payload ?? body;
    if (!dados || !dados.tipo_arquivo || !dados.modalidade || !dados.fonte || !dados.uf) {
      throw new BadRequestException('Corpo inválido: envie { dados|payload: { tipo_arquivo, modalidade, fonte, uf } }');
    }
    return this.datasusService.downloadFromDatasus(dados);
  }
  
  @Post('fila/lista')
  async filaLista(
    @Body() body: any,
  ) {
    const dados = body?.dados ?? body?.payload ?? body;
    if (!dados || !dados.tipo_arquivo || !dados.modalidade || !dados.fonte || !dados.uf) {
      throw new BadRequestException('Corpo inválido: envie { dados|payload: { tipo_arquivo, modalidade, fonte, uf } }');
    }
    return this.datasusService.multReuestFtp(dados);
  }

  @Post('fila/download')
  async filaDownload(
    @Body() body: any,
  ) {
    const dados = body?.dados ?? body?.payload ?? body;
    if (!dados || !dados.tipo_arquivo || !dados.modalidade || !dados.fonte || !dados.uf) {
      throw new BadRequestException('Corpo inválido: envie { tipo_arquivo, modalidade, fonte, uf }');
    }
    const link = await this.datasusService.downloadFromDatasus(dados);
    return { link };
  }

  @Post('fila/download-mensal')
  async filaDownloadMensal(
    @Body() body: any,
  ) {
    const dados = body?.dados ?? body?.payload ?? body;
    if (!dados || !dados.tipo_arquivo || !dados.modalidade || !dados.fonte || !dados.uf) {
      throw new BadRequestException('Corpo inválido: envie { tipo_arquivo, modalidade, fonte, uf }');
    }
    const links = await this.datasusService.downloadLinksPorMes(dados);
    return { links };
  }
  
}
