import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {  SiasusArquivoDto, SiasusArquivoResponse } from './siasus-arquivo.type';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SiasusArquivoType, FonteType, UFType } from './siasus-arquivo.type';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

function toArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
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
    getCompetence(competence: string): Array<{ mes: string, ano: string }> {
        if (typeof competence !== 'string' || !/^\d{2}-\d{4}$/.test(competence)) {
            throw new Error('Competência deve estar no formato MM-YYYY');
        }

        const [mesStr, anoStr] = competence.split('-');
        const mes = parseInt(mesStr, 10);
        const ano = parseInt(anoStr, 10);

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
        return competencias;
    }

    async requestFtp(payload: SiasusArquivoDto): Promise<SiasusArquivoResponse | SiasusArquivoResponse[]> {

        const normalized: Required<Pick<SiasusArquivoDto, 'tipo_arquivo' | 'modalidade' | 'fonte' | 'ano' | 'mes' | 'uf'>> = {
            tipo_arquivo: toArray(payload.tipo_arquivo),
            modalidade: toArray(payload.modalidade),
            fonte: toArray(payload.fonte),
            ano: toArray(payload.ano),
            mes: toArray(payload.mes),
            uf: toArray(payload.uf),
        };

        if (normalized.ano.length === 0 || normalized.mes.length === 0) {
            throw new Error('Competência inválida');
        }

        const form = new URLSearchParams();

        for (const v of normalized.tipo_arquivo) form.append('tipo_arquivo[]', v);
        for (const v of normalized.modalidade) form.append('modalidade[]', v);
        for (const v of normalized.fonte) form.append('fonte[]', v);
        for (const v of normalized.ano) form.append('ano[]', v);
        for (const v of normalized.mes) form.append('mes[]', v);
        for (const v of normalized.uf) form.append('uf[]', v);

        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://datasus.saude.gov.br',
            'Referer': 'https://datasus.saude.gov.br/transferencia-de-arquivos',
        };

        try {
            this.logger.log(`POST ftp.php - payload: tipo_arquivo=${normalized.tipo_arquivo.join(',')}, modalidade=${normalized.modalidade.join(',')}, fonte=${normalized.fonte.join(',')}, ano=${normalized.ano.join(',')}, mes=${normalized.mes.join(',')}, uf=${normalized.uf.join(',')}`);
            const { data } = await firstValueFrom(
                this.httpService.post(
                    'https://datasus.saude.gov.br/wp-content/ftp.php',
                    form.toString(),
                    { headers },
                ),
            );
            const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
           count > 0 ? this.logger.log(`ftp.php OK - itens retornados: ${count}`) : this.logger.warn(`ftp.php OK - itens retornados: ${count}`);
            return data;
        } catch (e: any) {
            const status = e?.response?.status;
            const resp = e?.response?.data;
            const msg = typeof resp === 'string' ? resp : JSON.stringify(resp);
            throw new Error(`Erro DataSUS ftp.php (${status ?? 'sem status'}): ${msg}`);
        }
    }

    async multReuestFtp(dados: Omit<SiasusArquivoDto, 'ano' | 'mes'>): Promise<SiasusArquivoResponse[]> {
        const dataAtual = `${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getFullYear()}`;
        const competencias = this.getCompetence(dataAtual);

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
            // Último recurso: procurar string http(s)
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
        const dataAtual = `${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getFullYear()}`;
        const competencias = this.getCompetence(dataAtual);
        const links: string[] = [];

        for (const c of competencias) {
            this.logger.log(`Processando competência ${c.mes}-${c.ano}...`);
            const ftpJob = await this.datasusQueue.add('ftpByMonth', { dados, competence: c });
            const items = await ftpJob.finished() as SiasusArquivoResponse[];
            if (!items || items.length === 0) continue;
            // baixar diretamente
            const link = await this.downloadFromItems(items);
            if (link) { links.push(link); this.logger.log(`Link capturado (${c.mes}-${c.ano}): ${link}`)
            }
        }

        return links;
    }

    async downloadLinksPorMesPadrao(): Promise<string[]> {
        const dados: Omit<SiasusArquivoDto, 'ano' | 'mes'> = {
            tipo_arquivo: [SiasusArquivoType.PA, SiasusArquivoType.AB, SiasusArquivoType.ABO, SiasusArquivoType.ACF, SiasusArquivoType.AD, SiasusArquivoType.AM, SiasusArquivoType.AN, SiasusArquivoType.AQ, SiasusArquivoType.AR, SiasusArquivoType.ATD, SiasusArquivoType.SAD],
            modalidade: ["1"],
            fonte: [FonteType.SIASUS],
            uf: [UFType.PE],
        };
        return this.downloadLinksPorMes(dados);
    }

    async baixarEExtrairDbc(links: string[], outDir = '/data'): Promise<string[]> {
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        const extraidos: string[] = [];
        for (const link of links) {
            this.logger.log(`Baixando ZIP: ${link}`);
            const { data } = await firstValueFrom(
                this.httpService.get(link, { responseType: 'arraybuffer' as any })
            );
            const zip = new AdmZip(Buffer.from(data as ArrayBuffer));
            const entries = zip.getEntries();
            for (const entry of entries) {
                if (!entry.entryName.toLowerCase().endsWith('.dbc')) continue;
                const dest = path.join(outDir, path.basename(entry.entryName));
                fs.writeFileSync(dest, entry.getData());
                extraidos.push(dest);
                this.logger.log(`Extraído: ${dest}`);
            }
        }
        return extraidos;
    }
}
