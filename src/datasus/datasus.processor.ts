import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { DatasusService, DbcArquivoProcessado } from './datasus.service';
import * as fs from 'fs';
import { SiasusArquivoDto, SiasusArquivoResponse } from './datasus-arquivo.type';

@Processor('datasus')
export class DatasusProcessor {
  constructor(private readonly datasusService: DatasusService) {}

  @Process({ name: 'ftpByMonth', concurrency: 1 })
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

  @Process({ name: 'download', concurrency: 1 })
  async handleDownload(job: Job<{ items: SiasusArquivoResponse[] }>): Promise<string> {
    const { items } = job.data;
    const link = await this.datasusService.downloadFromItems(items);
    return link;
  }

  @Process({ name: 'downloadAndSend', concurrency: 1 })
  async handleDownloadAndSend(job: Job<{ link: string; endpointUrl: string; index: number; total: number }>): Promise<any> {
    const { link, endpointUrl, index, total } = job.data;
    
    console.log(`[${index}/${total}] Processando: ${link}`);
    
    const zipBuffer = await this.datasusService.downloadZipFromUrl(link);
    
    const nomeArquivo = `datasus-${index}.zip`;
    const resultado = await this.datasusService.enviarZipParaEndpoint(zipBuffer, endpointUrl, nomeArquivo);
    
    console.log(`[${index}/${total}] Concluído`);
    
    return resultado;
  }

  @Process({ name: 'sendDbc', concurrency: 1 })
  async handleSendDbc(job: Job<{ dbcBase64: string; nomeArquivo: string; endpointUrl: string; index: number; zipOrigem: string; fonte: string }>): Promise<DbcArquivoProcessado> {
    const { dbcBase64, nomeArquivo, endpointUrl, index, zipOrigem, fonte } = job.data;
    
    console.log(`[DBC ${index}] Processando: ${nomeArquivo} (fonte: ${fonte}) de ${zipOrigem}`);
    
    // Converter base64 de volta para Buffer
    const dbcBuffer = Buffer.from(dbcBase64, 'base64');
    
    const metadados = await this.datasusService.enviarDbcParaEndpoint(
      dbcBuffer,
      endpointUrl,
      nomeArquivo,
      fonte
    );
    
    console.log(`[DBC ${index}] ✅ ${nomeArquivo}: ${metadados.registros_inseridos.toLocaleString('pt-BR')} registros inseridos na tabela ${metadados.tabela_nome}`);
    
    return metadados;
  }

  /**
   * ⚡ OTIMIZADO: Lê o arquivo do disco ao invés de receber base64 (economiza memória)
   */
  @Process({ name: 'sendDbcFromDisk', concurrency: 1 })
  async handleSendDbcFromDisk(job: Job<{ caminhoArquivo: string; nomeArquivo: string; endpointUrl: string; index: number; zipOrigem: string; fonte: string }>): Promise<DbcArquivoProcessado> {
    const { caminhoArquivo, nomeArquivo, endpointUrl, index, zipOrigem, fonte } = job.data;
    
    // Log de memória antes
    const memBefore = process.memoryUsage();
    console.log(`[DBC ${index}] 📥 Processando: ${nomeArquivo} (${(fs.statSync(caminhoArquivo).size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`   📊 Mem ANTES: RSS=${(memBefore.rss / 1024 / 1024).toFixed(0)}MB | Heap=${(memBefore.heapUsed / 1024 / 1024).toFixed(0)}MB`);
    
    try {
      // Ler arquivo do disco (economiza memória vs base64)
      const dbcBuffer = fs.readFileSync(caminhoArquivo);
      console.log(`   💾 Arquivo lido do disco (${(dbcBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
      
      // Enviar para a API Python
      const metadados = await this.datasusService.enviarDbcParaEndpoint(
        dbcBuffer,
        endpointUrl,
        nomeArquivo,
        fonte
      );
      
      console.log(`[DBC ${index}] ✅ ${nomeArquivo}: ${metadados.registros_inseridos.toLocaleString('pt-BR')} registros → ${metadados.tabela_nome}`);
      
      // ⚡ DELETAR arquivo do disco após processamento
      this.datasusService.deletarArquivo(caminhoArquivo);
      
      // Log de memória depois
      const memAfter = process.memoryUsage();
      console.log(`   📊 Mem DEPOIS: RSS=${(memAfter.rss / 1024 / 1024).toFixed(0)}MB | Heap=${(memAfter.heapUsed / 1024 / 1024).toFixed(0)}MB`);
      
      // Forçar garbage collection se disponível
      if (global.gc) {
        global.gc();
        const memGC = process.memoryUsage();
        console.log(`   🗑️  Mem PÓS-GC: RSS=${(memGC.rss / 1024 / 1024).toFixed(0)}MB | Heap=${(memGC.heapUsed / 1024 / 1024).toFixed(0)}MB`);
      }
      
      return metadados;
      
    } catch (error) {
      console.error(`[DBC ${index}] ❌ Erro: ${error.message}`);
      // Em caso de erro, também deletar o arquivo
      this.datasusService.deletarArquivo(caminhoArquivo);
      throw error;
    }
  }
  @Process({ name: 'downloadLinksPorMes', concurrency: 1 })
  async handleDownloadLinksPorMes(job: Job<{ dados: Omit<SiasusArquivoDto, 'ano' | 'mes'> }>): Promise<string[]> {
    const { dados } = job.data;
    const links = await this.datasusService.downloadLinksPorMes(dados);
    return links;
  }
}
