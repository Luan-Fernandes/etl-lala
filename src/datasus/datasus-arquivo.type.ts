export const SiasusArquivoType = {
    AB: "AB",
    ABO: "ABO",
    ACF: "ACF",
    AD: "AD",
    AM: "AM",
    AN: "AN",
    AQ: "AQ",
    AR: "AR",
    ATD: "ATD",
    PA: "PA",
    PS: "PS",
    SAD: "SAD",
  } as const;
export const SiasusArquivoArray = Object.values(SiasusArquivoType);
export type SiasusArquivoType = typeof SiasusArquivoType[keyof typeof SiasusArquivoType];

export const CIHArquivosType = {
    CR : "CR",
} as const;
export const CIHArquivosArray = Object.values(CIHArquivosType);
export type CIHArquivosType = typeof CIHArquivosType[keyof typeof CIHArquivosType];


export const CIHAArquivosType = {
    CIHA : "CIHA",
} as const;
export const CIHAArquivosArray = Object.values(CIHAArquivosType);
export type CIHAArquivosType = typeof CIHAArquivosType[keyof typeof CIHAArquivosType];

export const CNESArquivosType = {
    DC : "DC",
    EE : "EE",
    EF : "EF",
    EP : "EP",
    EQ : "EQ",
    GM : "GM",
    HB : "HB",
    IN : "IN",
    LT : "LT",
    PF : "PF",
    RC : "RC",
    SR : "SR",
    ST : "ST",

} as const;
export const CNESArquivosArray = Object.values(CNESArquivosType);
export type CNESArquivosType = typeof CNESArquivosType[keyof typeof CNESArquivosType];

export const SIHSUSArquivosType = {
    ER : "ER",
    RD : "RD",
    RJ : "RJ",
    SP : "SP",
} as const;
export const SIHSUSArquivosArray = Object.values(SIHSUSArquivosType);
export type SIHSUSArquivosType = typeof SIHSUSArquivosType[keyof typeof SIHSUSArquivosType];

export const SINANArquivosType = {
    ACBI : "ACBI",
    ACGR : "ACGR",
    AIDA : "AIDA",
    AIDC : "AIDC",
    ANIM : "ANIM",
    ANTR : "ANTR",
    BOTU : "BOTU",
    CANC : "CANC",
    CHAG : "CHAG",
    CHIK : "CHIK",
    COLE : "COLE",
    COQU : "COQU",
    DCRJ : "DCRJ",
    DENG : "DENG",
    DERM : "DERM",
    DIFT : "DIFT",
    ESPO : "ESPO",
    ESQU : "ESQU",
    EXAN : "EXAN",
    FMAC : "FMAC",
    FTIF : "FTIF",
    HANS : "HANS",
    HANT : "HANT",
    HEPA : "HEPA",
    HIVA : "HIVA",
    HIVC : "HIVC",
    HIVE : "HIVE",
    HIVG : "HIVG",
    IEXO : "IEXO",
    INFL : "INFL",
    LEIV : "LEIV",
    LEPT : "LEPT",
    LERD : "LERD",
    LTAN : "LTAN",
    MALA : "MALA",
    MENI : "MENI",
    MENT : "MENT",
    NTRA : "NTRA",
    PAIR : "PAIR",
    PEST : "PEST",
    PFAN : "PFAN",
    PNEU : "PNEU",
    RAIV : "RAIV",  
    ROTA : "ROTA",
    SDTA : "SDTA",
    SIFA : "SIFA",
    SIFC : "SIFC",
    SIFG : "SIFG",
    SRC : "SRC",
    TETA : "TETA",
    TETN : "TETN",
    TOXC : "TOXC",
    TOXG : "TOXG",
    TRAC : "TRAC",
    TUBE : "TUBE",
    VARC : "VARC",
    VIOL : "VIOL",
    ZIKA : "ZIKA",
    
} as const;
export const SINANArquivosArray = Object.values(SINANArquivosType);
export type SINANArquivosType = typeof SINANArquivosType[keyof typeof SINANArquivosType];

export const FonteType = {
    CIH: "CIH",
    CIHA: "CIHA",
    CNES: "CNES",
    PCE: "PCE",
    PO: "PO",
    RESP: "RESP",
    SIASUS: "SIASUS",
    SIHSUS: "SIHSUS",
    SIM: "SIM",
    SINAN: "SIM_SISCOMEX",
    SINASC: "SISCOMEX",
    SISCOLO: "SISCOLO",
    SISMAMA: "SISMAMA",
    SISPRENATAL: "SISPRENATAL",
  } as const;
  
  export type FonteType = typeof FonteType[keyof typeof FonteType];
  
  export enum UFType {
    AL = "AL",
    PE = "PE",
    PB = "PB",
  }
  
  export type SiasusArquivoDto = {
        tipo_arquivo: SiasusArquivoType[] | CIHArquivosType[] | CIHAArquivosType[] | CNESArquivosType[] | SIHSUSArquivosType[] | SINANArquivosType[];
        modalidade: string[];
        fonte: FonteType[];
        uf: UFType[];
        ano?: string[];
        mes?: string[];
    };
  
  export type SiasusArquivoResponse = {
    fonte: FonteType;
    modalidade: string;
    arquivo: string;
    link: string;
    endereco: string;
  };
  
  export type dataRequest = {
    mes: string;
    ano: string;
  };