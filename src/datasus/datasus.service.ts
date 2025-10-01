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
        return competencias;
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

    async downloadLinksPorMesPadrao(): Promise<string[]> {
        const dados: Omit<SiasusArquivoDto, 'ano' | 'mes'> = {
            tipo_arquivo: [SiasusArquivoType.PA, SiasusArquivoType.AB, SiasusArquivoType.ABO, SiasusArquivoType.ACF, SiasusArquivoType.AD, SiasusArquivoType.AM, SiasusArquivoType.AN, SiasusArquivoType.AQ, SiasusArquivoType.AR, SiasusArquivoType.ATD, SiasusArquivoType.SAD],
            modalidade: ["1"],
            fonte: [FonteType.SIASUS],
            uf: [UFType.PE],
        };
        return this.downloadLinksPorMes(dados);
    }

    extractDbc(zip: AdmZip): { name: string; data: Buffer }[] {
        const entries = zip.getEntries();
        const dbcs: { name: string; data: Buffer }[] = [];
        for (const entry of entries) {
            if (!entry.entryName.toLowerCase().endsWith('.dbc')) continue;
            dbcs.push({ name: path.basename(entry.entryName), data: entry.getData() });
        }
        return dbcs;
    }
}
