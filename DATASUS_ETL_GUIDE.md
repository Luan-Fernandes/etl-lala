# Guia de Uso - ETL DATASUS

## 📋 Visão Geral

Este sistema faz o download automático de arquivos ZIP do DATASUS e os envia para um endpoint HTTP para processamento.

## 🔄 Fluxo de Execução

1. **Obter Links**: Busca os links dos arquivos ZIP do DATASUS
2. **Fila de Processamento**: Cada link é enfileirado para processamento paralelo
3. **Download**: Baixa o arquivo ZIP em memória (não salva em disco)
4. **Envio**: Envia o ZIP para o endpoint via FormData (multipart/form-data)
5. **Aguarda Resposta**: Espera a resposta do endpoint
6. **Retorna Resultados**: Retorna array com todas as respostas

## 🚀 Como Usar

### 1. Configurar o Endpoint

Edite o arquivo `.env` ou defina a variável de ambiente:

```bash
DATASUS_ENDPOINT_URL=https://seu-endpoint.com/processar
```

Ou edite diretamente em `src/scripts/run-etl.ts` (linha 21).

### 2. Executar o Script

```bash
npm run build
node dist/scripts/run-etl.js
```

## 📤 O que o Endpoint Recebe

O endpoint receberá uma requisição POST com:

**Headers:**
```
Content-Type: multipart/form-data
```

**Body:**
- Campo: `file`
- Tipo: arquivo ZIP
- Nome: `datasus-1.zip`, `datasus-2.zip`, etc.

### Exemplo de Endpoint (NestJS)

```typescript
import { Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Post('processar')
@UseInterceptors(FileInterceptor('file'))
async processar(@UploadedFile() file: Express.Multer.File) {
  const zipBuffer = file.buffer;
  const nomeArquivo = file.originalname;
  
  // Processar o ZIP...
  
  return {
    success: true,
    message: 'Arquivo processado com sucesso',
    data: { /* seus dados */ }
  };
}
```

### Exemplo de Endpoint (Express)

```javascript
const multer = require('multer');
const upload = multer();

app.post('/processar', upload.single('file'), (req, res) => {
  const zipBuffer = req.file.buffer;
  const nomeArquivo = req.file.originalname;
  
  // Processar o ZIP...
  
  res.json({
    success: true,
    message: 'Arquivo processado com sucesso'
  });
});
```

### Exemplo de Endpoint (Python FastAPI)

```python
from fastapi import FastAPI, File, UploadFile

@app.post("/processar")
async def processar(file: UploadFile = File(...)):
    contents = await file.read()
    
    # Processar o ZIP...
    
    return {
        "success": True,
        "message": "Arquivo processado com sucesso"
    }
```

## 🔧 Personalizar Tipo de Resposta

Edite o arquivo `src/scripts/run-etl.ts` para definir o tipo de resposta:

```typescript
interface EndpointResponse {
  success: boolean;
  message?: string;
  data?: any;
  // Adicione seus campos aqui
}

const resultados = await service.processarLinksPadrao<EndpointResponse>(ENDPOINT_URL);
```

## 📊 Métodos Disponíveis

### `downloadLinksPorMesPadrao()`
Retorna array de URLs dos arquivos ZIP.

```typescript
const links = await service.downloadLinksPorMesPadrao();
```

### `downloadZipFromUrl(url)`
Baixa um arquivo ZIP e retorna o Buffer.

```typescript
const zipBuffer = await service.downloadZipFromUrl(url);
```

### `enviarZipParaEndpoint<T>(zipBuffer, endpointUrl, nomeArquivo)`
Envia um ZIP para o endpoint e retorna a resposta tipada.

```typescript
const resposta = await service.enviarZipParaEndpoint<MyType>(
  zipBuffer, 
  'https://endpoint.com/processar',
  'arquivo.zip'
);
```

### `processarLinksPadrao<T>(endpointUrl)`
**Método principal**: Executa todo o fluxo automaticamente.

```typescript
const resultados = await service.processarLinksPadrao<EndpointResponse>(
  'https://endpoint.com/processar'
);
```

## ⚙️ Configurações

### Modificar Tipos de Arquivo

Edite `downloadLinksPorMesPadrao()` em `datasus.service.ts` (linha 192):

```typescript
tipo_arquivo: [
  SiasusArquivoType.PA,   // Produção ambulatorial
  SiasusArquivoType.AB,   // APAC Acompanhamento
  // Adicione ou remova tipos conforme necessário
]
```

### Modificar UF

```typescript
uf: [UFType.PE]  // Altere para o estado desejado
```

## 🔍 Logs

O sistema gera logs detalhados:

```
🚀 Iniciando ETL DATASUS
📍 Endpoint: http://localhost:3000/processar

[DatasusService] Total de links obtidos: 1
[DatasusService] Enfileirando 1 links para download e envio...
[1/1] Processando: https://...
[DatasusService] Baixando ZIP de https://...
[DatasusService] Download concluído: 1.52 MB
[DatasusService] Enviando ZIP (1.52 MB) para http://localhost:3000/processar...
[DatasusService] ZIP enviado com sucesso. Resposta recebida do endpoint.
[1/1] ✅ Concluído

✅ ETL concluído com sucesso!
📊 Total de arquivos processados: 1
```

## 🎯 Vantagens

✅ **Sem I/O de disco** - Tudo em memória  
✅ **Processamento paralelo** - Usa filas Bull  
✅ **Tipagem forte** - TypeScript genéricos  
✅ **Fácil customização** - Tipos de resposta configuráveis  
✅ **Logs detalhados** - Acompanhamento completo  
✅ **Tratamento de erros** - Mensagens claras  

## 🛠️ Troubleshooting

### Erro: "Invalid URL"
- Verifique se a URL do endpoint está correta
- Certifique-se de que começa com `http://` ou `https://`

### Erro: "Connection refused"
- Verifique se o endpoint está rodando
- Confirme a porta e o host

### Timeout
- Aumente o timeout do Axios se os arquivos forem muito grandes
- Configure o `maxBodyLength` e `maxContentLength`






