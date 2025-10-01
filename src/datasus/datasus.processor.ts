import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { DatasusService } from './datasus.service';
import { SiasusArquivoDto, SiasusArquivoResponse } from './siasus-arquivo.type';

@Processor('datasus')
export class DatasusProcessor {
  constructor(private readonly datasusService: DatasusService) {}

  @Process('ftpByMonth')
  async handleFtpByMonth(job: Job<{ dados: Omit<SiasusArquivoDto, 'ano' | 'mes'>; competence: { mes: string; ano: string } }>): Promise<SiasusArquivoResponse[]> {
    const { dados, competence } = job.data;
    const payload: SiasusArquivoDto = {
      ...dados,
      ano: [competence.ano],
      mes: [competence.mes],
    } as SiasusArquivoDto;
    const resp = await this.datasusService.requestFtp(payload);
    return Array.isArray(resp) ? resp : [resp];
  }

  @Process('download')
  async handleDownload(job: Job<{ items: SiasusArquivoResponse[] }>): Promise<string> {
    const { items } = job.data;
    const link = await this.datasusService.downloadFromItems(items);
    return link;
  }
}
