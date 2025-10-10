# 📖 Explicação Detalhada dos Métodos - ETL DATASUS

## Índice
1. [downloadLinksPorMesPadrao()](#1-downloadlinkspormesPadrao)
2. [downloadZipFromUrl()](#2-downloadzipfromurl)
3. [enviarZipParaEndpoint()](#3-enviarzipparaendpoint)
4. [processarLinksPadrao()](#4-processarlinksPadrao)
5. [handleDownloadAndSend() - Processor](#5-handledownloadandsend---processor)
6. [Fluxo Completo](#6-fluxo-completo)

---

## 1. downloadLinksPorMesPadrao()

### 📋 O que faz?
Obtém os links de download dos arquivos ZIP do DATASUS baseado em critérios pré-definidos.

### 🔍 Código Explicado:

```typescript
async downloadLinksPorMesPadrao(): Promise<string[]> {
    // 1️⃣ Define os parâmetros de busca
    const dados: Omit<SiasusArquivoDto, 'ano' | 'mes'> = {
        tipo_arquivo: [
            SiasusArquivoType.PA,    // Produção Ambulatorial
            SiasusArquivoType.AB,    // APAC Acompanhamento Pós-cirúrgico Bariátrica
            SiasusArquivoType.ABO,   // APAC Acompanhamento Pós-cirúrgico Obesidade
            // ... outros tipos
        ],
        modalidade: ["1"],           // Modalidade do atendimento
        fonte: [FonteType.SIASUS],   // Sistema de origem (SIASUS)
        uf: [UFType.PE],            // Estado: Pernambuco
    };
    
    // 2️⃣ Chama o método que busca os links por mês
    // Este método já existe e busca competências automaticamente
    const links = await this.downloadLinksPorMes(dados);
    
    // 3️⃣ Registra no log quantos links foram obtidos
    this.logger.log(`Total de links obtidos: ${links.length}`);
    
    // 4️⃣ Retorna array de URLs (strings)
    // Exemplo: ["https://datasus.saude.gov.br/...arquivo1.zip", "https://...arquivo2.zip"]
    return links;
}
```

### 📤 Retorno:
```typescript
[
  "https://datasus.saude.gov.br/wp-content/uploads/arquivo1.zip",
  "https://datasus.saude.gov.br/wp-content/uploads/arquivo2.zip"
]
```

---

## 2. downloadZipFromUrl()

### 📋 O que faz?
Baixa um arquivo ZIP de uma URL e retorna o conteúdo em memória como Buffer (não salva em disco).

### 🔍 Código Explicado:

```typescript
async downloadZipFromUrl(url: string): Promise<Buffer> {
    // 1️⃣ VALIDAÇÃO: Verifica se a URL é válida
    if (!url || !url.startsWith('http')) {
        throw new Error(`URL inválida: ${url}`);
    }
    // Se a URL for vazia ou não começar com "http", lança erro

    // 2️⃣ LOG: Registra que o download está começando
    this.logger.log(`Baixando ZIP de ${url}...`);

    // 3️⃣ DOWNLOAD: Faz requisição HTTP GET para baixar o arquivo
    const { data } = await firstValueFrom(
        this.httpService.get(url, { 
            responseType: 'arraybuffer'  // ← Importante! Recebe dados binários
        }),
    );
    // firstValueFrom() → Converte Observable (RxJS) em Promise
    // arraybuffer → Formato binário bruto, ideal para arquivos

    // 4️⃣ CONVERSÃO: Converte ArrayBuffer em Buffer do Node.js
    const zipBuffer = Buffer.from(data);
    // Buffer é mais fácil de manipular no Node.js

    // 5️⃣ LOG: Mostra o tamanho do arquivo baixado
    this.logger.log(`Download concluído: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    // zipBuffer.length → bytes
    // / 1024 / 1024 → converte para MB
    // .toFixed(2) → 2 casas decimais (ex: 1.52 MB)

    // 6️⃣ RETORNO: Retorna o Buffer do ZIP
    return zipBuffer;
}
```

### 📊 Exemplo Visual:

```
URL: https://datasus.saude.gov.br/arquivo.zip
     ↓
[HTTP GET com arraybuffer]
     ↓
ArrayBuffer (dados binários brutos)
     ↓
Buffer do Node.js
     ↓
<Buffer 50 4b 03 04 14 00 00 00 08 00 ...>
Tamanho: 1.52 MB
```

### 📤 Retorno:
```typescript
Buffer // Conteúdo binário do arquivo ZIP em memória
```

---

## 3. enviarZipParaEndpoint()

### 📋 O que faz?
Envia um arquivo ZIP (em Buffer) para um endpoint HTTP usando FormData (multipart/form-data).

### 🔍 Código Explicado:

```typescript
async enviarZipParaEndpoint<T = any>(
    zipBuffer: Buffer,              // Buffer do arquivo ZIP
    endpointUrl: string,            // URL do endpoint destino
    nomeArquivo: string = 'arquivo.zip'  // Nome do arquivo (opcional)
): Promise<T> {  // ← Generic: você define o tipo de resposta!

    // 1️⃣ LOG: Mostra tamanho e destino
    this.logger.log(`Enviando ZIP (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB) para ${endpointUrl}...`);

    // 2️⃣ CRIAR FORMULÁRIO: Prepara FormData (multipart/form-data)
    const form = new FormData();
    
    // 3️⃣ ADICIONAR ARQUIVO: Anexa o Buffer como se fosse upload de arquivo
    form.append('file', zipBuffer, {
        filename: nomeArquivo,           // Nome que o servidor verá
        contentType: 'application/zip',  // MIME type
    });
    // É como fazer upload via formulário HTML, mas via código!

    try {
        // 4️⃣ ENVIAR: Faz POST HTTP para o endpoint
        const { data } = await firstValueFrom(
            this.httpService.post<T>(endpointUrl, form, {
                headers: {
                    ...form.getHeaders(),  // ← CRUCIAL! Headers do FormData
                    // Inclui: Content-Type: multipart/form-data; boundary=...
                },
                maxBodyLength: Infinity,    // Sem limite de tamanho do body
                maxContentLength: Infinity, // Sem limite de resposta
            })
        );
        // <T> → Define o tipo da resposta esperada

        // 5️⃣ SUCESSO: Log e retorna a resposta do endpoint
        this.logger.log(`ZIP enviado com sucesso. Resposta recebida do endpoint.`);
        return data;  // Retorna o que o endpoint respondeu

    } catch (error: any) {
        // 6️⃣ ERRO: Captura e trata erros
        const status = error?.response?.status;  // Ex: 404, 500
        const msg = error?.response?.data || error?.message || 'Erro desconhecido';
        
        // Log do erro
        this.logger.error(`Erro ao enviar ZIP: ${JSON.stringify(msg)}`);
        
        // Lança erro com informações detalhadas
        throw new Error(`Falha ao enviar ZIP para ${endpointUrl} (${status ?? 'sem status'}): ${JSON.stringify(msg)}`);
    }
}
```

### 📊 Exemplo Visual:

```
Buffer do ZIP (em memória)
     ↓
FormData
┌─────────────────────────────┐
│ Content-Type: multipart/... │
│ -------------------------   │
│ Content-Disposition: form-  │
│   data; name="file";        │
│   filename="datasus-1.zip"  │
│ Content-Type: application/  │
│   zip                       │
│                             │
│ [bytes binários do ZIP]     │
└─────────────────────────────┘
     ↓
[HTTP POST]
     ↓
Endpoint recebe e processa
     ↓
Resposta JSON/Objeto
     ↓
Retorna para quem chamou
```

### 📤 Retorno:
```typescript
// O tipo T é configurável!
// Exemplo se T = { success: boolean, data: any }
{
  success: true,
  data: { /* dados processados */ }
}
```

---

## 4. processarLinksPadrao()

### 📋 O que faz?
**MÉTODO PRINCIPAL** - Orquestra todo o fluxo: obtém links, enfileira jobs para baixar e enviar cada arquivo, aguarda todas as respostas e retorna resultados.

### 🔍 Código Explicado:

```typescript
async processarLinksPadrao<T = any>(endpointUrl: string): Promise<T[]> {
    // 1️⃣ OBTER LINKS: Busca todos os links de download
    const links = await this.downloadLinksPorMesPadrao();
    // Resultado: ["url1.zip", "url2.zip", "url3.zip"]
    
    // 2️⃣ LOG: Informa quantos links serão processados
    this.logger.log(`Enfileirando ${links.length} links para download e envio...`);
    
    // 3️⃣ ENFILEIRAR: Cria um JOB na fila para CADA link
    const jobs = await Promise.all(
        links.map((link, index) => 
            this.datasusQueue.add('downloadAndSend', {  // Nome do job
                link,              // URL para baixar
                endpointUrl,       // Para onde enviar
                index: index + 1,  // Número do arquivo (1, 2, 3...)
                total: links.length // Total de arquivos
            })
        )
    );
    // Promise.all → Espera TODAS as adições na fila terminarem
    // .map() → Transforma cada link em um job
    // Resultado: [Job1, Job2, Job3, ...]

    // 4️⃣ LOG: Jobs foram adicionados à fila
    this.logger.log(`Aguardando conclusão de ${jobs.length} jobs...`);
    
    // 5️⃣ AGUARDAR: Espera TODOS os jobs terminarem
    const results = await Promise.all(
        jobs.map((job) => job.finished().then(r => r as T))
    );
    // job.finished() → Retorna Promise que resolve quando o job termina
    // Promise.all → Espera TODOS os jobs concluírem
    // r as T → Faz cast para o tipo genérico definido
    // IMPORTANTE: Isso BLOQUEIA até todos terminarem!

    // 6️⃣ LOG: Tudo concluído
    this.logger.log(`Processamento concluído! ${results.length} arquivos processados.`);
    
    // 7️⃣ RETORNO: Array com as respostas de todos os endpoints
    return results;
}
```

### 📊 Fluxo Visual:

```
Passo 1: Obter Links
┌──────────────────────────────────┐
│ downloadLinksPorMesPadrao()     │
│ Resultado: ["url1", "url2"]     │
└──────────────────────────────────┘
           ↓
Passo 2: Criar Jobs na Fila
┌──────────────────────────────────┐
│ Job 1: { link: "url1", ... }    │
│ Job 2: { link: "url2", ... }    │
└──────────────────────────────────┘
           ↓
Passo 3: Processar em Paralelo
┌─────────────────┐  ┌─────────────────┐
│ Job 1 executando│  │ Job 2 executando│
│ - Baixa ZIP     │  │ - Baixa ZIP     │
│ - Envia p/ API  │  │ - Envia p/ API  │
│ - Aguarda resp. │  │ - Aguarda resp. │
└─────────────────┘  └─────────────────┘
           ↓                  ↓
Passo 4: Coletar Resultados
┌──────────────────────────────────┐
│ results = [resposta1, resposta2] │
└──────────────────────────────────┘
           ↓
Passo 5: Retornar
```

### 📤 Retorno:
```typescript
[
  { success: true, data: {...} },  // Resposta do endpoint para arquivo 1
  { success: true, data: {...} }   // Resposta do endpoint para arquivo 2
]
```

---

## 5. handleDownloadAndSend() - Processor

### 📋 O que faz?
**JOB WORKER** - Executado pela fila Bull. Processa um único arquivo: baixa o ZIP e envia para o endpoint.

### 📍 Localização:
`src/datasus/datasus.processor.ts`

### 🔍 Código Explicado:

```typescript
@Process('downloadAndSend')  // ← Registra como handler do job 'downloadAndSend'
async handleDownloadAndSend(
    job: Job<{ 
        link: string;        // URL para baixar
        endpointUrl: string; // Para onde enviar
        index: number;       // Número deste arquivo
        total: number        // Total de arquivos
    }>
): Promise<any> {
    // 1️⃣ EXTRAIR DADOS: Pega informações do job
    const { link, endpointUrl, index, total } = job.data;
    
    // 2️⃣ LOG INICIAL: Mostra qual arquivo está processando
    console.log(`[${index}/${total}] Processando: ${link}`);
    // Exemplo: [1/3] Processando: https://...arquivo1.zip
    
    // 3️⃣ BAIXAR: Chama o serviço para baixar o ZIP
    const zipBuffer = await this.datasusService.downloadZipFromUrl(link);
    // Retorna Buffer do arquivo ZIP em memória
    
    // 4️⃣ PREPARAR NOME: Define nome do arquivo
    const nomeArquivo = `datasus-${index}.zip`;
    // Exemplo: datasus-1.zip, datasus-2.zip, datasus-3.zip
    
    // 5️⃣ ENVIAR: Envia o ZIP para o endpoint
    const resultado = await this.datasusService.enviarZipParaEndpoint(
        zipBuffer,      // Buffer do ZIP
        endpointUrl,    // URL do endpoint
        nomeArquivo     // Nome do arquivo
    );
    // Aguarda resposta do endpoint
    
    // 6️⃣ LOG FINAL: Marca como concluído
    console.log(`[${index}/${total}] Concluído`);
    
    // 7️⃣ RETORNO: Retorna a resposta do endpoint
    return resultado;
    // Este retorno fica disponível em job.finished()
}
```

### 📊 Ciclo de Vida do Job:

```
Estado: WAITING (na fila)
     ↓
Estado: ACTIVE (sendo processado)
     ↓
[1/3] Processando: https://...
     ↓
Baixando ZIP... (2.3 MB)
     ↓
Enviando ZIP para endpoint...
     ↓
Aguardando resposta do endpoint...
     ↓
[1/3] Concluído
     ↓
Estado: COMPLETED
Resultado: { success: true, ... }
```

---

## 6. Fluxo Completo

### 🎬 Passo a Passo Completo:

```typescript
// run-etl.ts
const resultados = await service.processarLinksPadrao('http://api.com/processar');
```

```
┌─────────────────────────────────────────────────────────────┐
│ 1. processarLinksPadrao()                                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. downloadLinksPorMesPadrao()                              │
│    → Retorna: ["url1.zip", "url2.zip", "url3.zip"]         │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Criar 3 Jobs na Fila Bull                                │
│    Job1 → { link: "url1.zip", endpointUrl, index: 1 }      │
│    Job2 → { link: "url2.zip", endpointUrl, index: 2 }      │
│    Job3 → { link: "url3.zip", endpointUrl, index: 3 }      │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ JOB 1 (Paralelo) │  │ JOB 2 (Paralelo) │  │ JOB 3 (Paralelo) │
│ handleDownload   │  │ handleDownload   │  │ handleDownload   │
│ AndSend()        │  │ AndSend()        │  │ AndSend()        │
│                  │  │                  │  │                  │
│ a) Baixa ZIP     │  │ a) Baixa ZIP     │  │ a) Baixa ZIP     │
│ b) Envia p/ API  │  │ b) Envia p/ API  │  │ b) Envia p/ API  │
│ c) Aguarda resp. │  │ c) Aguarda resp. │  │ c) Aguarda resp. │
│ d) Retorna       │  │ d) Retorna       │  │ d) Retorna       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
        ↓                      ↓                      ↓
    resposta1             resposta2             resposta3
        └──────────────────────┴──────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Promise.all() coleta todas as respostas                  │
│    results = [resposta1, resposta2, resposta3]             │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Retorna para run-etl.ts                                  │
│    console.log(resultados)                                  │
└─────────────────────────────────────────────────────────────┘
```

### ⏱️ Timeline:

```
t=0s    → Inicia processarLinksPadrao()
t=1s    → Links obtidos: 3 arquivos
t=1.5s  → Jobs criados na fila
t=2s    → Job 1, 2, 3 iniciam EM PARALELO
t=5s    → Job 1 baixou ZIP (2.1 MB)
t=6s    → Job 2 baixou ZIP (1.8 MB)
t=7s    → Job 3 baixou ZIP (2.5 MB)
t=10s   → Job 1 enviou para endpoint
t=11s   → Job 2 enviou para endpoint
t=12s   → Job 1 recebeu resposta do endpoint
t=13s   → Job 3 enviou para endpoint
t=14s   → Job 2 recebeu resposta
t=15s   → Job 3 recebeu resposta
t=15s   → Promise.all() resolvida
t=15s   → Retorna resultados para run-etl.ts
```

---

## 🎯 Resumo dos Conceitos-Chave

### 1. **Buffer vs String**
- `Buffer` → Dados binários (arquivos, imagens, vídeos)
- `string` → Texto (URLs, JSON, HTML)

### 2. **FormData (multipart/form-data)**
- Formato usado para enviar arquivos via HTTP
- Como um formulário HTML com `<input type="file">`

### 3. **Generics TypeScript `<T>`**
```typescript
enviarZipParaEndpoint<MeuTipo>()
// Define o tipo de retorno dinamicamente
```

### 4. **Fila Bull (Jobs)**
- Permite processamento assíncrono
- Jobs rodam em paralelo
- Retry automático em caso de falha

### 5. **Promise.all()**
- Espera TODAS as Promises terminarem
- Roda em paralelo (mais rápido)
- Se uma falhar, todas falham

### 6. **firstValueFrom() do RxJS**
- Converte Observable → Promise
- Necessário porque HttpService do NestJS retorna Observable

---

## 🔧 Customizações Possíveis

### Mudar tipo de resposta:
```typescript
interface MinhaResposta {
  id: number;
  processado: boolean;
  erros: string[];
}

const resultados = await service.processarLinksPadrao<MinhaResposta>(url);
// resultados[0].id
// resultados[0].processado
```

### Mudar UF ou tipos de arquivo:
```typescript
// Em downloadLinksPorMesPadrao()
uf: [UFType.SP],  // Muda para São Paulo
tipo_arquivo: [SiasusArquivoType.PA],  // Só Produção Ambulatorial
```

### Adicionar retry:
```typescript
// Em datasus.module.ts (configuração do Bull)
BullModule.registerQueue({
  name: 'datasus',
  defaultJobOptions: {
    attempts: 3,  // Tenta 3 vezes antes de falhar
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
})
```

---

## ❓ Dúvidas Frequentes

**P: Os arquivos são salvos em disco?**  
R: NÃO! Tudo fica em memória (Buffer). Mais rápido e não ocupa espaço.

**P: Os downloads são paralelos?**  
R: SIM! Cada job roda em paralelo graças ao Bull.

**P: E se um job falhar?**  
R: Por padrão, o erro é lançado. Configure `attempts` para retry automático.

**P: Posso processar 100 arquivos ao mesmo tempo?**  
R: Sim, mas configure `concurrency` no Bull para limitar e não sobrecarregar.

**P: O endpoint precisa retornar JSON?**  
R: Não! Pode retornar qualquer coisa. Defina o tipo genérico `<T>` conforme necessário.

