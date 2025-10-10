import {
  CIHArquivosArray,
  CIHAArquivosArray,
  FonteType,
  SiasusArquivoArray,
  SiasusArquivoDto,
  UFType,
  CNESArquivosArray,
  SIHSUSArquivosArray,
  SINANArquivosArray,
} from './datasus-arquivo.type';

export const ObjectDados: Omit<SiasusArquivoDto, 'ano' | 'mes'>[] = [
  ...SiasusArquivoArray.map((tipo) => ({
    tipo_arquivo: [tipo],
    modalidade: ['1'],
    fonte: [FonteType.SIASUS],
    uf: [UFType.PE],
  })),
  ...CIHArquivosArray.map((tipo) => ({
    tipo_arquivo: [tipo],
    modalidade: ['1'],
    fonte: [FonteType.CIH],
    uf: [UFType.PE],
  })),
  ...CIHAArquivosArray.map((tipo) => ({
    tipo_arquivo: [tipo],
    modalidade: ['1'],
    fonte: [FonteType.CIHA],
    uf: [UFType.PE],
  })),
  ...CNESArquivosArray.map((tipo) => ({
    tipo_arquivo: [tipo],
    modalidade: ['1'],
    fonte: [FonteType.CNES],
    uf: [UFType.PE],
  })),
  ...SIHSUSArquivosArray.map((tipo) => ({
    tipo_arquivo: [tipo],
    modalidade: ['1'],
    fonte: [FonteType.SIHSUS],
    uf: [UFType.PE],
  })),
  ...SINANArquivosArray.map((tipo) => ({
    tipo_arquivo: [tipo],
    modalidade: ['1'],
    fonte: [FonteType.SINAN],
    uf: [UFType.PE],
  })),
];