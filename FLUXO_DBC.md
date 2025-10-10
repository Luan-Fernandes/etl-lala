# 📄 Fluxo de Processamento de Arquivos DBC

## 🔄 Mudança Implementada

### ❌ Fluxo Anterior (enviava ZIP completo):
```
1. Obter links dos ZIPs
2. Baixar cada ZIP
3. Enviar ZIP completo para endpoint
```

### ✅ Fluxo Novo (envia cada .dbc individualmente):
```
1. Obter links dos ZIPs
2. Para cada ZIP:
   a. Baixar ZIP
   b. Extrair arquivos .dbc
   c. Enfileirar cada .dbc separadamente
3. Processar fila: enviar cada .dbc para endpoint
```

---

## 📊 Fluxo Visual Detalhado

```
┌─────────────────────────────────────────────────────────┐
│ 1. processarLinksPadrao(endpointUrl)                    │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ 2. downloadLinksPorMesPadrao()                          │
│    Retorna: ["url1.zip", "url2.zip"]                   │
└──────────────────────┬──────────────────────────────────┘
                       ↓
         ┌─────────────┴─────────────┐
         ↓                           ↓
┌──────────────────┐        ┌──────────────────┐
│ ZIP 1            │        │ ZIP 2            │
│ url1.zip         │        │ url2.zip         │
└────────┬─────────┘        └────────┬─────────┘
         ↓                           ↓
┌──────────────────┐        ┌──────────────────┐
│ 3. downloadZip   │        │ 3. downloadZip   │
│ Buffer do ZIP    │        │ Buffer do ZIP    │
└────────┬─────────┘        └────────┬─────────┘
         ↓                           ↓
┌──────────────────┐        ┌──────────────────┐
│ 4. extrairDbc    │        │ 4. extrairDbc    │
│ - PAPA.dbc       │        │ - ABPA.dbc       │
│ - ABOA.dbc       │        │ - ABOA.dbc       │
│ - ACF.dbc        │        │ - AD.dbc         │
└────────┬─────────┘        └────────┬─────────┘
         │                           │
         └──────────┬────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Fila Bull - Jobs 'sendDbc'                           │
│                                                          │
│ Job 1: PAPA.dbc  → Endpoint                             │
│ Job 2: ABOA.dbc  → Endpoint                             │
│ Job 3: ACF.dbc   → Endpoint                             │
│ Job 4: ABPA.dbc  → Endpoint                             │
│ Job 5: ABOA.dbc  → Endpoint                             │
│ Job 6: AD.dbc    → Endpoint                             │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Respostas do Endpoint                                │
│ [resposta1, resposta2, resposta3, ...]                 │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Métodos Criados/Modificados

### 1. `extrairDbcDoZip(zipBuffer: Buffer)`

**O que faz:**
- Recebe Buffer de um arquivo ZIP
- Extrai todos os arquivos com extensão `.dbc`
- Retorna array com nome e buffer de cada arquivo

**Exemplo:**
```typescript
const zipBuffer = await this.downloadZipFromUrl(url);
const arquivos = await this.extrairDbcDoZip(zipBuffer);

// Retorna:
[
  { nome: 'PAPA2501.dbc', buffer: Buffer<...> },
  { nome: 'ABOA2501.dbc', buffer: Buffer<...> },
  { nome: 'ACF2501.dbc', buffer: Buffer<...> }
]
```

**Logs:**
```
Extraindo arquivos .dbc do ZIP...
Arquivo .dbc encontrado: PAPA2501.dbc (142.56 KB)
Arquivo .dbc encontrado: ABOA2501.dbc (89.23 KB)
Arquivo .dbc encontrado: ACF2501.dbc (45.12 KB)
Total de arquivos .dbc extraídos: 3
```

---

### 2. `enviarDbcParaEndpoint<T>(dbcBuffer, endpointUrl, nomeArquivo)`

**O que faz:**
- Envia arquivo .dbc para endpoint via FormData
- Similar ao `enviarZipParaEndpoint`, mas otimizado para .dbc
- Content-Type: `application/octet-stream`

**Exemplo:**
```typescript
const dbcBuffer = arquivos[0].buffer;
const resultado = await this.enviarDbcParaEndpoint(
  dbcBuffer,
  'https://api.com/processar',
  'PAPA2501.dbc'
);
```

**Logs:**
```
Enviando arquivo .dbc: PAPA2501.dbc (142.56 KB) para https://api.com/processar...
Arquivo .dbc PAPA2501.dbc enviado com sucesso.
```

---

### 3. `processarLinksPadrao<T>(endpointUrl)` - MODIFICADO

**O que mudou:**

**Antes:**
```typescript
// Enfileirava 1 job por ZIP
for (const link of links) {
  datasusQueue.add('downloadAndSend', { link });
}
```

**Agora:**
```typescript
// Baixa ZIP, extrai .dbc, enfileira cada .dbc
for (const link of links) {
  const zipBuffer = await downloadZipFromUrl(link);
  const arquivosDbc = await extrairDbcDoZip(zipBuffer);
  
  for (const dbc of arquivosDbc) {
    datasusQueue.add('sendDbc', { 
      dbcBuffer: dbc.buffer,
      nomeArquivo: dbc.nome 
    });
  }
}
```

**Logs:**
```
Processando 2 links...
[1/2] Baixando e extraindo ZIP: https://...
Baixando ZIP de https://...
Download concluído: 1.52 MB
Extraindo arquivos .dbc do ZIP...
Arquivo .dbc encontrado: PAPA2501.dbc (142.56 KB)
Arquivo .dbc encontrado: ABOA2501.dbc (89.23 KB)
Arquivo .dbc encontrado: ACF2501.dbc (45.12 KB)
Total de arquivos .dbc extraídos: 3

[2/2] Baixando e extraindo ZIP: https://...
Baixando ZIP de https://...
Download concluído: 1.85 MB
Extraindo arquivos .dbc do ZIP...
Arquivo .dbc encontrado: ABPA2501.dbc (98.45 KB)
Arquivo .dbc encontrado: AD2501.dbc (67.89 KB)
Total de arquivos .dbc extraídos: 2

Total de 5 arquivos .dbc enfileirados. Aguardando processamento...
[DBC 1] Enviando: PAPA2501.dbc
[DBC 2] Enviando: ABOA2501.dbc
[DBC 3] Enviando: ACF2501.dbc
[DBC 4] Enviando: ABPA2501.dbc
[DBC 5] Enviando: AD2501.dbc
[DBC 1] PAPA2501.dbc concluído
[DBC 2] ABOA2501.dbc concluído
[DBC 3] ACF2501.dbc concluído
[DBC 4] ABPA2501.dbc concluído
[DBC 5] AD2501.dbc concluído

Processamento concluído! 5 arquivos .dbc processados.
```

---

### 4. Processor: `@Process('sendDbc')` - NOVO JOB

**Handler:**
```typescript
@Process('sendDbc')
async handleSendDbc(job: Job<{
  dbcBuffer: Buffer;
  nomeArquivo: string;
  endpointUrl: string;
  index: number;
  zipOrigem: string;
}>) {
  const { dbcBuffer, nomeArquivo, endpointUrl } = job.data;
  
  const resultado = await this.datasusService.enviarDbcParaEndpoint(
    dbcBuffer,
    endpointUrl,
    nomeArquivo
  );
  
  return resultado;
}
```

**Payload do Job:**
```javascript
{
  dbcBuffer: Buffer<...>,         // Buffer do arquivo .dbc
  nomeArquivo: 'PAPA2501.dbc',    // Nome do arquivo
  endpointUrl: 'https://...',     // URL do endpoint
  index: 1,                       // Número sequencial
  zipOrigem: 'https://...zip'     // Link do ZIP original
}
```

---

## 📤 O que o Endpoint Recebe

### Request (FormData):

```
POST https://seu-endpoint.com/processar
Content-Type: multipart/form-data

--------------------------
Content-Disposition: form-data; name="file"; filename="PAPA2501.dbc"
Content-Type: application/octet-stream

[bytes binários do arquivo .dbc]
--------------------------
```

### Exemplo de Endpoint (NestJS):

```typescript
@Post('processar')
@UseInterceptors(FileInterceptor('file'))
async processar(@UploadedFile() file: Express.Multer.File) {
  console.log('Arquivo recebido:', file.originalname);  // PAPA2501.dbc
  console.log('Tamanho:', file.size, 'bytes');
  console.log('Buffer:', file.buffer);  // Buffer do .dbc
  
  // Processar arquivo .dbc
  const dados = processarDbc(file.buffer);
  
  return {
    success: true,
    arquivo: file.originalname,
    registros: dados.length
  };
}
```

---

## 📊 Exemplo de Execução Completa

### Input:
```typescript
const resultados = await service.processarLinksPadrao('https://api.com/processar');
```

### Processamento:

```
1 ZIP → 3 arquivos .dbc → 3 jobs → 3 requisições para endpoint
2 ZIP → 2 arquivos .dbc → 2 jobs → 2 requisições para endpoint
───────────────────────────────────────────────────────────────
Total: 2 ZIPs → 5 arquivos .dbc → 5 requisições
```

### Output:
```typescript
[
  { success: true, arquivo: 'PAPA2501.dbc', registros: 1542 },
  { success: true, arquivo: 'ABOA2501.dbc', registros: 892 },
  { success: true, arquivo: 'ACF2501.dbc', registros: 456 },
  { success: true, arquivo: 'ABPA2501.dbc', registros: 678 },
  { success: true, arquivo: 'AD2501.dbc', registros: 234 }
]
```

---

## 🎯 Vantagens do Novo Fluxo

✅ **Granularidade:** Processa cada .dbc individualmente
✅ **Rastreabilidade:** Sabe exatamente qual arquivo falhou
✅ **Escalabilidade:** Fila pode processar em paralelo
✅ **Flexibilidade:** Endpoint recebe arquivos separados
✅ **Resiliência:** Se 1 .dbc falhar, outros continuam

---

## ⚙️ Configuração

### Controlar Paralelismo:

No `datasus.module.ts`:
```typescript
BullModule.registerQueue({
  name: 'datasus',
  defaultJobOptions: {
    attempts: 3,        // Tenta 3 vezes em caso de falha
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  },
  settings: {
    maxStalledCount: 3,
    lockDuration: 300000,  // 5 minutos
  },
  limiter: {
    max: 5,         // Máximo 5 jobs simultâneos
    duration: 1000  // Por segundo
  }
})
```

---

## 🔍 Monitoramento

### Ver Jobs na Fila:

```typescript
const jobCounts = await this.datasusQueue.getJobCounts();
console.log({
  waiting: jobCounts.waiting,    // Aguardando processamento
  active: jobCounts.active,      // Sendo processados
  completed: jobCounts.completed, // Concluídos
  failed: jobCounts.failed       // Falharam
});
```

---

## 🐛 Troubleshooting

### Erro: "Arquivo .dbc não encontrado no ZIP"

**Causa:** ZIP não contém arquivos .dbc

**Solução:** Verificar se o ZIP está correto:
```typescript
const zip = new AdmZip(zipBuffer);
console.log('Arquivos no ZIP:', zip.getEntries().map(e => e.entryName));
```

### Muitos arquivos .dbc, fila lenta

**Solução:** Aumentar paralelismo:
```typescript
limiter: {
  max: 10,  // 10 jobs simultâneos
  duration: 1000
}
```

### Endpoint retorna erro 413 (Payload too large)

**Causa:** Arquivo .dbc muito grande

**Solução:** Aumentar limite do servidor ou enviar em chunks

---

## ✅ Resumo

| Aspecto | Antes | Agora |
|---------|-------|-------|
| **Arquivo enviado** | ZIP completo | .dbc individual |
| **Jobs por ZIP** | 1 | N (N = qtd de .dbc) |
| **Requisições HTTP** | 1 por ZIP | N por ZIP |
| **Endpoint recebe** | arquivo.zip | PAPA2501.dbc |
| **Rastreamento** | Por ZIP | Por arquivo .dbc |

**Fluxo implementado com sucesso!** 🎉




