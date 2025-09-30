export enum SiasusArquivoType {
    AB = "AB",
    ABO = "ACF",
    ACF = "ACF",
    AD = "AD",
    AM = "AM",
    AN = "AN",
    AQ = "AQ",
    AR = "AR",
    ATD = "ATD",
    PA = "PA",
    PS = "PS",
    SAD = "SAD",
};

export enum FonteType {
    CIH = 'CIH',
    CIHA = 'CIHA',
    CNES = 'CNES',
    PCE = 'PCE',
    PO = 'PO',
    RESP = 'RESP',
    SIASUS = 'SIASUS',
    SIHSUS = 'SIHSUS',
    SIM = 'SIM',
    SINAN = 'SIM_SISCOMEX',
    SINASC = 'SISCOMEX',
    SISCOLO = 'SISCOLO',
    SISMAMA = 'SISMAMA',
    SISPRENATAL = 'SISPRENATAL',
}

export enum UFType {
    AL = 'AL',
    PE = 'PE',
    PB = 'PB',
}

export type SiasusArquivoDto = {
    tipo_arquivo: SiasusArquivoType[];
    modalidade : string[];
    fonte : FonteType[];
    uf : UFType[];
    ano? : string[];
    mes?: string[];
}

export type SiasusArquivoResponse = {
    fonte : FonteType;
    modalidade : string;
    arquivo : string;
    link : string;
    endereco : string;
}

export type dataRequest = {
    mes: string;
    ano:string;
} 

export type SiasusArquivoRequest = {
    tipo_arquivo: SiasusArquivoType[];
    modalidade : string[];
    fonte : FonteType[];
    uf : UFType[];
}