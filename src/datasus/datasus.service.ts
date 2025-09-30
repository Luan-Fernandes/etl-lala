import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {  SiasusArquivoDto, SiasusArquivoResponse } from './siasus-arquivo.type';

@Injectable()
export class DatasusService {
    constructor(private readonly httpService: HttpService) {}
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
        return competencias;
    }

    async requestFtp(payload: SiasusArquivoDto): Promise<SiasusArquivoResponse | SiasusArquivoResponse[]> {

        if(!payload.ano || !payload.mes){
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

        const { data } = await firstValueFrom(
            this.httpService.post(
                'https://datasus.saude.gov.br/wp-content/ftp.php',
                form.toString(),
                { headers },
            ),
        );
        return data;
    }

    async multReuestFtp(dados: Omit<SiasusArquivoDto, 'ano' | 'mes'>): Promise<SiasusArquivoResponse[]> {
        const dataAtual = `${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getFullYear()}`;
        const competencias = this.getCompetence(dataAtual);
        const results: SiasusArquivoResponse[] = [];

        for (const c of competencias) {
            const payload: SiasusArquivoDto = {
                tipo_arquivo: dados.tipo_arquivo,
                modalidade: dados.modalidade,
                fonte: dados.fonte,
                uf: dados.uf,
                ano: [c.ano],
                mes: [c.mes],
            };

            const resp = await this.requestFtp(payload);
            const items: SiasusArquivoResponse[] = Array.isArray(resp) ? resp : [resp];
            for (const item of items) {
                if (item) results.push(item);
            }
        }

        return results;
    }

    async downloadFromDatasus(dados: Omit<SiasusArquivoDto, 'ano' | 'mes'>): Promise<string> {
        const arquivos = await this.multReuestFtp(dados);

        const form = new URLSearchParams();
        arquivos.forEach((item, index) => {
            const arquivo = item?.arquivo?.toString().trim();
            const endereco = item?.endereco?.toString().trim();
            if (!arquivo || !endereco) return;
            form.append(`dados[${index}][arquivo]`, arquivo);
            form.append(`dados[${index}][link]`, endereco);
        });

        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://datasus.saude.gov.br',
            'Referer': 'https://datasus.saude.gov.br/transferencia-de-arquivos/',
        };
        
        const { data } = await firstValueFrom(
            this.httpService.post(
                'https://datasus.saude.gov.br/wp-content/download.php',
                form.toString(),
                { headers },
            ),
        );


        return data;
    }
}
