import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as AdmZip from 'adm-zip';
import * as path from 'path';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as os from 'os';
import { FonteType, SiasusArquivoDto, SiasusArquivoResponse, SiasusArquivoType, UFType } from './datasus-arquivo.type';
import { ObjectDados } from './datasus-object-processor';

// Interface para resposta da API /processar (insere no PostgreSQL)
export interface DbcProcessarResponse {
    sucesso: boolean;
    mensagem: string;
    arquivo: {
        nome: string;
        arquivo_origem: string;
        fonte: string;
    };
    metadados: {
        tipo_arquivo: string;
        estado: string;
        competencia: string;
    };
    tabela: {
        nome: string;
        criada_agora: boolean;
        total_registros: number;
        total_colunas: number;
        competencias_existentes: string[];
    };
    processamento: {
        registros_lidos: number;
        registros_inseridos: number;
    };
}

export interface DbcProcessarErrorResponse {
    sucesso: false;
    mensagem: string;
    erro?: string;
    tipo_erro?: string;
    detalhes?: string;
}

// Interface para metadados do processamento (usado internamente)
export interface DbcArquivoProcessado {
    arquivo_original: string;
    fonte: string;
    tabela_nome: string;
    total_registros: number;
    total_colunas: number;
    tipo_arquivo: string;
    estado: string;
    competencia: string;
    registros_inseridos: number;
}

@Injectable()
export class DatasusService {
    constructor(
        private readonly httpService: HttpService,
        @InjectQueue('datasus') private readonly datasusQueue: Queue,
    ) {
        if (typeof (this.datasusQueue as any).setMaxListeners === 'function') {
            (this.datasusQueue as any).setMaxListeners(0);
        }
    }
    private readonly logger = new Logger(DatasusService.name);
    getCompetence(): Array<{ mes: string, ano: string }> {

        const mes = (new Date().getMonth() + 1).toString().padStart(2, '0') as unknown as number;
        const ano = new Date().getFullYear()

        if (isNaN(mes) || isNaN(ano) || mes < 1 || mes > 12) {
            throw new Error('Competência inválida');
        }

        const competencias: Array<{ mes: string, ano: string }> = [];

        let data = new Date(ano, mes - 1);

        for (let i = 0; i < 12; i++) {
            const mesAtual = (data.getMonth() + 1).toString().padStart(2, '0');
            const anoAtual = data.getFullYear().toString();
            competencias.push({
                mes: mesAtual,
                ano: anoAtual,
            });
            data.setMonth(data.getMonth() - 1);
        }
        this.logger.log(`Competências geradas: ${competencias.map(c => `${c.mes}-${c.ano}`).join(', ')}`);
        return [{ mes: "01", ano: "2025" }, { mes:"02", ano: "2025"}];
    }
    async requestFtp(payload: SiasusArquivoDto): Promise<SiasusArquivoResponse | SiasusArquivoResponse[]> {

        if (!payload.ano || !payload.mes) {
            throw new Error('Competência inválida');
        }

        const form = new URLSearchParams();

        for (const v of payload.tipo_arquivo) form.append('tipo_arquivo[]', v);
        for (const v of payload.modalidade) form.append('modalidade[]', v);
        for (const v of payload.fonte) form.append('fonte[]', v);
        for (const v of payload.ano) form.append('ano[]', v);
        for (const v of payload.mes) form.append('mes[]', v);
        for (const v of payload.uf) form.append('uf[]', v);

        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://datasus.saude.gov.br',
            'Referer': 'https://datasus.saude.gov.br/transferencia-de-arquivos',
        };

        try {
            this.logger.log(`POST ftp.php - payload: tipo_arquivo=${payload.tipo_arquivo.join(',')}, modalidade=${payload.modalidade.join(',')}, fonte=${payload.fonte.join(',')}, ano=${payload.ano.join(',')}, mes=${payload.mes.join(',')}, uf=${payload.uf.join(',')}`);
            const { data } = await firstValueFrom(
                this.httpService.post(
                    'https://datasus.saude.gov.br/wp-content/ftp.php',
                    form.toString(),
                    { headers },
                ),
            );
            data.length ? this.logger.log(`ftp.php OK - itens retornados: ${data.length}`) : this.logger.warn(`ftp.php OK - itens retornados: ${data.length}`);
            return data;
        } catch (e: any) {
            const status = e?.response?.status;
            const resp = e?.response?.data;
            const msg = typeof resp === 'string' ? resp : JSON.stringify(resp);
            throw new Error(`Erro DataSUS ftp.php (${status ?? 'sem status'}): ${msg}`);
        }
    }

    async multReuestFtp(dados: Omit<SiasusArquivoDto, 'ano' | 'mes'>): Promise<SiasusArquivoResponse[]> {
        const competencias = this.getCompetence();

        this.logger.log(`Enfileirando FTP por mês para ${competencias.length} competências...`);
        const jobs = await Promise.all(
            competencias.map((c) => this.datasusQueue.add('ftpByMonth', { dados, competence: c }))
        );

        const resultsArrays = await Promise.all(jobs.map((j, idx) => j.finished().then(r => { this.logger.log(`FTP concluído para competência ${competencias[idx].mes}-${competencias[idx].ano} - itens: ${Array.isArray(r) ? r.length : 0}`); return r as SiasusArquivoResponse[]; })));
        const results: SiasusArquivoResponse[] = [];
        for (const arr of resultsArrays) {
            if (Array.isArray(arr)) {
                for (const item of arr) {
                    if (item) results.push(item);
                }
            }
        }
        this.logger.log(`Total de itens agregados: ${results.length}`);
        return results;
    }

    async downloadFromItems(items: SiasusArquivoResponse[]): Promise<string> {
        const form = new URLSearchParams();
        items.forEach((item, index) => {
            const arquivo = item?.arquivo?.toString().trim();
            const endereco = item?.endereco?.toString().trim();
            if (!arquivo || !endereco) return;
            form.append(`dados[${index}][arquivo]`, arquivo);
            form.append(`dados[${index}][link]`, endereco);
        });
        this.logger.log(`download.php - montando form com ${items.length} itens`);

        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://datasus.saude.gov.br',
            'Referer': 'https://datasus.saude.gov.br/transferencia-de-arquivos/',
        };

        try {
            const { data } = await firstValueFrom(
                this.httpService.post(
                    'https://datasus.saude.gov.br/wp-content/download.php',
                    form.toString(),
                    { headers },
                ),
            );
            if (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) {
                        const first = (parsed as unknown[]).find((v) => typeof v === 'string');
                        if (typeof first === 'string') { this.logger.log(`Link extraído (json-string): ${first}`); return first; }
                    }
                } catch {
                    this.logger.log(`Link extraído (string): ${data}`);
                    return data;
                }
            }
            if (data && typeof (data as any).link === 'string') {
                const link = (data as any).link as string;
                this.logger.log(`Link extraído (obj.link): ${link}`);
                return link;
            }
            const asText = typeof data === 'string' ? data : JSON.stringify(data);
            const match = asText.match(/https?:[^"\s\]]+\.zip/);
            if (match && match[0]) { this.logger.log(`Link extraído (regex): ${match[0]}`); return match[0]; }
            throw new Error('Resposta de download.php não contém link.');
        } catch (e: any) {
            const status = e?.response?.status;
            const resp = e?.response?.data;
            const msg = typeof resp === 'string' ? resp : JSON.stringify(resp);
            throw new Error(`Erro DataSUS download.php (${status ?? 'sem status'}): ${msg}`);
        }
    }

    async downloadFromDatasus(dados: Omit<SiasusArquivoDto, 'ano' | 'mes'>): Promise<string> {
        const arquivos = await this.multReuestFtp(dados);
        const job = await this.datasusQueue.add('download', { items: arquivos });
        const link = await job.finished() as string;
        return link;
    }

    async downloadLinksPorMes(dados: Omit<SiasusArquivoDto, 'ano' | 'mes'>): Promise<string[]> {
        const competencias = this.getCompetence();
        const links: string[] = [];

        for (const c of competencias) {
            this.logger.log(`Processando competência ${c.mes}-${c.ano}...`);
            const ftpJob = await this.datasusQueue.add('ftpByMonth', { dados, competence: c });
            const items = await ftpJob.finished() as SiasusArquivoResponse[];
            if (!items || items.length === 0) continue;
            const link = await this.downloadFromItems(items);
            if (link) { links.push(link); this.logger.log(`Link capturado (${c.mes}-${c.ano}): ${link}`)
            }
        }

        return links;
    }

    async downloadLinksPorMesPadrao(): Promise<{ links: string[]; fonte: string }> {
        const dados: Omit<SiasusArquivoDto, 'ano' | 'mes'> = {
            tipo_arquivo: [SiasusArquivoType.PA], // ⚡ Reduzido para teste - depois adicione mais tipos
            modalidade: ["1"],
            fonte: [FonteType.SIASUS],
            uf: [UFType.PE],
        }
        const links = await this.downloadLinksPorMes(dados);
        this.logger.log(`Total de links obtidos: ${links.length}`);
        return { links, fonte: dados.fonte[0] };
    }

    async downloadZipFromUrl(url: string): Promise<Buffer> {
        if (!url || !url.startsWith('http')) {
            throw new Error(`URL inválida: ${url}`);
        }

        this.logger.log(`Baixando ZIP de ${url}...`);

        const { data } = await firstValueFrom(
            this.httpService.get(url, { 
                responseType: 'arraybuffer',
                maxContentLength: 500 * 1024 * 1024, // 500 MB max
                timeout: 300000, // 5 minutos
            }),
        );

        const zipBuffer = Buffer.from(data);
        const tamanhoMB = (zipBuffer.length / 1024 / 1024).toFixed(2);
        this.logger.log(`Download concluído: ${tamanhoMB} MB`);
        
        // ⚡ Log de memória para debug
        const memUsage = process.memoryUsage();
        this.logger.log(`   📊 Memória: RSS=${(memUsage.rss / 1024 / 1024).toFixed(0)}MB | Heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`);
        
        return zipBuffer;
    }

    async enviarZipParaEndpoint<T = any>(zipBuffer: Buffer, endpointUrl: string, nomeArquivo: string = 'arquivo.zip'): Promise<T> {
        this.logger.log(`Enviando ZIP (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB) para ${endpointUrl}...`);
        
        const form = new FormData();
        form.append('file', zipBuffer, {
            filename: nomeArquivo,
            contentType: 'application/zip',
        });

        try {
            const { data } = await firstValueFrom(
                this.httpService.post<T>(endpointUrl, form, {
                    headers: {
                        ...form.getHeaders(),
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                })
            );

            this.logger.log(`ZIP enviado com sucesso. Resposta recebida do endpoint.`);
            return data;
        } catch (error: any) {
            const status = error?.response?.status;
            const msg = error?.response?.data || error?.message || 'Erro desconhecido';
            this.logger.error(`Erro ao enviar ZIP: ${JSON.stringify(msg)}`);
            throw new Error(`Falha ao enviar ZIP para ${endpointUrl} (${status ?? 'sem status'}): ${JSON.stringify(msg)}`);
        }
    }

    async enviarDbcParaEndpoint(dbcBuffer: Buffer, endpointUrl: string, nomeArquivo: string, fonte: string): Promise<DbcArquivoProcessado> {
        const tamanhoDbcMB = (dbcBuffer.length / 1024 / 1024).toFixed(2);
        this.logger.log(`📤 Enviando arquivo .dbc: ${nomeArquivo} (${tamanhoDbcMB} MB) para ${endpointUrl}...`);
        
        const form = new FormData();
        
        // Campo 'arquivo' - arquivo .dbc binário (obrigatório)
        form.append('arquivo', dbcBuffer, {
            filename: nomeArquivo,
            contentType: 'application/octet-stream',
        });

        // Campo 'fonte' - fonte dos dados DATASUS (obrigatório)
        form.append('fonte', fonte);
        
        // Campo 'arquivo_origem' - nome do arquivo sem extensão (opcional)
        const nomeBase = nomeArquivo.replace(/\.[^/.]+$/, '');
        form.append('arquivo_origem', nomeBase);

        try {
            const maxSize = 900 * 1024 * 1024; // 900 MB para envio de arquivos
            
            // Envia requisição POST para /processar
            const { data } = await firstValueFrom(
                this.httpService.post<DbcProcessarResponse>(endpointUrl, form, {
                    headers: {
                        ...form.getHeaders(),
                    },
                    maxBodyLength: maxSize,
                    timeout: 1800000, // 30 minutos
                })
            );

            // Valida resposta
            if (!data.sucesso) {
                throw new Error(data.mensagem || 'Erro desconhecido no processamento');
            }
            
            // Log de sucesso
            this.logger.log(`✅ ${nomeArquivo} processado com sucesso!`);
            this.logger.log(`   📊 Tabela: ${data.tabela.nome}`);
            this.logger.log(`   📝 Registros inseridos: ${data.processamento.registros_inseridos.toLocaleString('pt-BR')}`);
            this.logger.log(`   📋 Colunas: ${data.tabela.total_colunas}`);
            this.logger.log(`   🗂️  Competência: ${data.metadados.competencia}`);
            this.logger.log(`   🆕 Tabela ${data.tabela.criada_agora ? 'criada agora' : 'já existia'}`);
            
            // Retorna metadados do processamento
            return {
                arquivo_original: data.arquivo.nome,
                fonte: data.arquivo.fonte,
                tabela_nome: data.tabela.nome,
                total_registros: data.tabela.total_registros,
                total_colunas: data.tabela.total_colunas,
                tipo_arquivo: data.metadados.tipo_arquivo,
                estado: data.metadados.estado,
                competencia: data.metadados.competencia,
                registros_inseridos: data.processamento.registros_inseridos,
            };
            
        } catch (error: any) {
            const status = error?.response?.status;
            const errorData = error?.response?.data as DbcProcessarErrorResponse | undefined;
            const errorMsg = error?.message || 'Erro desconhecido';
            const errorCode = error?.code;
            
            // Log detalhado do erro
            this.logger.error(`❌ Erro ao processar .dbc ${nomeArquivo}:`);
            this.logger.error(`  - Endpoint: ${endpointUrl}`);
            this.logger.error(`  - Status HTTP: ${status || 'N/A'}`);
            this.logger.error(`  - Código: ${errorCode || 'N/A'}`);
            this.logger.error(`  - Mensagem: ${errorMsg}`);
            
            if (errorData?.mensagem) {
                this.logger.error(`  - Erro da API: ${errorData.mensagem}`);
                if (errorData.erro) {
                    this.logger.error(`  - Detalhe: ${errorData.erro}`);
                }
            }
            
            throw new Error(`Falha ao processar .dbc ${nomeArquivo} no endpoint ${endpointUrl} (HTTP ${status ?? 'N/A'}): ${errorMsg}`);
        }
    }

    async extrairDbcDoZip(zipBuffer: Buffer): Promise<Array<{ nome: string; buffer: Buffer }>> {
        this.logger.log(`Extraindo arquivos .dbc do ZIP...`);
        
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();
        const arquivosDbc: Array<{ nome: string; buffer: Buffer }> = [];

        for (const entry of entries) {
            const nomeArquivo = entry.entryName.toLowerCase();
            
            // Filtrar apenas arquivos .dbc
            if (nomeArquivo.endsWith('.dbc')) {
                arquivosDbc.push({
                    nome: path.basename(entry.entryName),
                    buffer: entry.getData(),
                });
                
                this.logger.log(`Arquivo .dbc encontrado: ${entry.entryName} (${(entry.header.size / 1024).toFixed(2)} KB)`);
            }
        }

        this.logger.log(`Total de arquivos .dbc extraídos: ${arquivosDbc.length}`);
        return arquivosDbc;
    }

    /**
     * Extrai .dbc do ZIP e salva em disco temporário para economizar memória
     */
    async extrairDbcParaDisco(zipBuffer: Buffer): Promise<Array<{ nome: string; caminho: string }>> {
        this.logger.log(`Extraindo arquivos .dbc do ZIP para disco temporário...`);
        
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();
        const arquivosDbc: Array<{ nome: string; caminho: string }> = [];

        // Criar diretório temporário único
        const tempDir = path.join(os.tmpdir(), 'datasus-dbc-' + Date.now());
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        for (const entry of entries) {
            const nomeArquivo = entry.entryName.toLowerCase();
            
            // Filtrar apenas arquivos .dbc
            if (nomeArquivo.endsWith('.dbc')) {
                const nomeBase = path.basename(entry.entryName);
                const caminhoTemp = path.join(tempDir, nomeBase);
                
                // Salvar no disco
                fs.writeFileSync(caminhoTemp, entry.getData());
                
                arquivosDbc.push({
                    nome: nomeBase,
                    caminho: caminhoTemp,
                });
                
                const tamanhoMB = (entry.header.size / 1024 / 1024).toFixed(2);
                this.logger.log(`Arquivo .dbc salvo: ${nomeBase} (${tamanhoMB} MB) → ${caminhoTemp}`);
            }
        }

        this.logger.log(`Total de arquivos .dbc extraídos para disco: ${arquivosDbc.length}`);
        return arquivosDbc;
    }

    /**
     * Deleta um arquivo do disco
     */
    deletarArquivo(caminho: string): void {
        try {
            if (fs.existsSync(caminho)) {
                fs.unlinkSync(caminho);
                this.logger.log(`🗑️  Arquivo deletado: ${path.basename(caminho)}`);
            }
        } catch (error) {
            this.logger.warn(`Erro ao deletar arquivo ${caminho}: ${error.message}`);
        }
    }

    /**
     * Deleta um diretório e seu conteúdo
     */
    deletarDiretorio(caminho: string): void {
        try {
            if (fs.existsSync(caminho)) {
                fs.rmSync(caminho, { recursive: true, force: true });
                this.logger.log(`🗑️  Diretório deletado: ${caminho}`);
            }
        } catch (error) {
            this.logger.warn(`Erro ao deletar diretório ${caminho}: ${error.message}`);
        }
    }

    async processarLinksPadrao(endpointUrl?: string): Promise<DbcArquivoProcessado[]> {
        // Usa a variável de ambiente se não for fornecida (endpoint /processar)
        const url = endpointUrl || process.env.CONVERTER_API_URL || 'http://host.docker.internal:5000/processar';
        
        this.logger.log(`📍 Usando endpoint: ${url}`);
        
        const { links, fonte } = await this.downloadLinksPorMesPadrao();
        
        this.logger.log(`Processando ${links.length} links...`);
        
        const todosOsMetadados: DbcArquivoProcessado[] = [];
        let totalDbcCount = 0;

        // ⚡ OTIMIZAÇÃO: Processar um ZIP por vez para economizar memória
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            
            this.logger.log(`\n📦 [${i + 1}/${links.length}] Processando ZIP: ${link}`);
            
            // 1️⃣ Baixar ZIP
            this.logger.log(`   1/4 Baixando ZIP...`);
            const zipBuffer = await this.downloadZipFromUrl(link);
            
            // 2️⃣ Extrair arquivos .dbc para DISCO (economiza memória)
            this.logger.log(`   2/4 Extraindo .dbc para disco temporário...`);
            const arquivosDbc = await this.extrairDbcParaDisco(zipBuffer);
            
            // ⚡ FORÇA COLETA DE LIXO (libera memória do ZIP)
            const tamanhoZip = (zipBuffer.length / 1024 / 1024).toFixed(2);
            if (global.gc) {
                global.gc();
                this.logger.log(`   🗑️  Garbage Collection forçado - ZIP liberado (${tamanhoZip} MB)`);
            } else {
                this.logger.log(`   💾 Buffer do ZIP será liberado pelo GC (${tamanhoZip} MB)`);
            }
            
            // 3️⃣ Processar cada .dbc sequencialmente
            this.logger.log(`   3/4 Processando ${arquivosDbc.length} arquivos .dbc...`);
            
            for (const dbc of arquivosDbc) {
                totalDbcCount++;
                
                this.logger.log(`\n   📄 [DBC ${totalDbcCount}] ${dbc.nome}`);
                
                try {
                    // Enfileirar o .dbc (passa o caminho do arquivo, não o buffer)
                    const job = await this.datasusQueue.add('sendDbcFromDisk', {
                        caminhoArquivo: dbc.caminho,
                        nomeArquivo: dbc.nome,
                        endpointUrl: url,
                        index: totalDbcCount,
                        zipOrigem: link,
                        fonte: fonte,
                    });
                    
                    // Aguardar processamento ANTES de continuar para o próximo
                    const metadados = await job.finished() as DbcArquivoProcessado;
                    todosOsMetadados.push(metadados);
                    
                    this.logger.log(`   ✅ Processado: ${metadados.registros_inseridos.toLocaleString('pt-BR')} registros → ${metadados.tabela_nome}`);
                    
                } catch (error) {
                    this.logger.error(`   ❌ Erro ao processar ${dbc.nome}: ${error.message}`);
                    
                    // Mesmo com erro, deletar o arquivo
                    this.deletarArquivo(dbc.caminho);
                    throw error;
                }
            }
            
            // 4️⃣ Deletar diretório temporário do ZIP
            if (arquivosDbc.length > 0) {
                const dirTemp = path.dirname(arquivosDbc[0].caminho);
                this.deletarDiretorio(dirTemp);
            }
            
            this.logger.log(`   4/4 ZIP concluído! ${arquivosDbc.length} arquivos .dbc processados\n`);
        }

        this.logger.log(`\n✅ Processamento completo! ${todosOsMetadados.length} arquivos .dbc processados.`);
        
        return todosOsMetadados;
    }
}
