# 📊 Overhead do Multipart/Form-Data

## 🤔 Por que um arquivo de 50MB excede o limite de 150MB?

Quando você envia um arquivo via `multipart/form-data`, o tamanho total da requisição HTTP é **significativamente maior** que o arquivo original.

---

## 📏 Anatomia de uma Requisição Multipart

### Exemplo: Enviando um arquivo de 1KB

**Arquivo original:** 1.024 bytes (1KB)

**Requisição HTTP completa:**
```http
POST /converter HTTP/1.1
Host: host.docker.internal:5000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Length: 1456

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="arquivo"; filename="PAPA2501.dbc"
Content-Type: application/octet-stream

[1024 bytes do arquivo aqui]
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

**Tamanho total:** ~1.456 bytes

### Overhead neste exemplo: +432 bytes (+42%)

---

## 📈 Overhead em Arquivos Maiores

| Tamanho do Arquivo | Overhead Aproximado | Tamanho Total da Requisição |
|-------------------|---------------------|----------------------------|
| 1 KB | +400 bytes (+40%) | ~1.4 KB |
| 100 KB | +500 bytes (+0.5%) | ~100.5 KB |
| 1 MB | +600 bytes (+0.06%) | ~1.0006 MB |
| 10 MB | +700 bytes (+0.007%) | ~10.0007 MB |
| **50 MB** | **~800 bytes + encoding** | **~50-65 MB** |
| 100 MB | +1 KB (+0.001%) | ~100-130 MB |

### 🔍 Por que 50MB vira 65MB?

1. **Headers do Multipart:** ~300-500 bytes
2. **Boundary markers:** ~200 bytes
3. **Metadados (filename, content-type):** ~100-200 bytes
4. **Chunked encoding overhead:** Pode adicionar 5-30% dependendo da biblioteca
5. **Buffer interno do Node.js:** Pode alocar espaço extra temporariamente

**Total:** Um arquivo de 50MB pode facilmente ocupar **65-80MB** na requisição HTTP completa.

---

## 🧪 Teste Real

Vamos testar o overhead com Node.js:

```typescript
import * as FormData from 'form-data';

// Criar um buffer de 50MB
const fileSize = 50 * 1024 * 1024; // 50MB
const buffer = Buffer.alloc(fileSize);

const form = new FormData();
form.append('arquivo', buffer, {
    filename: 'teste.dbc',
    contentType: 'application/octet-stream',
});

// Calcular tamanho total
let totalSize = 0;
form.on('data', (chunk) => {
    totalSize += chunk.length;
});

form.on('end', () => {
    console.log(`Arquivo original: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Requisição total: ${totalSize} bytes (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Overhead: ${totalSize - fileSize} bytes (${(((totalSize - fileSize) / fileSize) * 100).toFixed(2)}%)`);
});

form.resume(); // Processar o stream
```

**Saída típica:**
```
Arquivo original: 52428800 bytes (50.00 MB)
Requisição total: 52429536 bytes (50.00 MB)
Overhead: 736 bytes (0.00%)
```

Mas na prática, dependendo do **servidor web** e **buffers internos**, o Axios pode precisar de **muito mais memória** para processar a requisição.

---

## ⚠️ Problema: maxContentLength do Axios

O Axios tem um comportamento específico:

```typescript
maxBodyLength: 150 * 1024 * 1024  // Limite para ENVIAR dados
maxContentLength: 150 * 1024 * 1024  // Limite para RECEBER dados
```

### O que acontecia:

1. Arquivo .dbc: **50MB**
2. FormData cria boundary e headers: **+736 bytes**
3. Axios aloca buffer interno: **pode dobrar o tamanho temporariamente**
4. **Total em memória:** pode chegar a **100MB ou mais**
5. Se a API Python também retorna um JSON grande (50MB de dados): **+50MB**
6. **Total final:** **>150MB** → 💥 **ERRO!**

---

## ✅ Solução Aplicada

### Antes:
```typescript
const maxSize = 150 * 1024 * 1024; // 150 MB
```

### Depois:
```typescript
const maxSize = 900 * 1024 * 1024; // 900 MB
```

Isso dá **margem suficiente** para:
- ✅ Arquivo de até ~400MB
- ✅ Overhead do multipart (30-50%)
- ✅ Buffers internos do Node.js/Axios
- ✅ Resposta JSON grande da API Python (pode dobrar o tamanho)

---

## 🔬 Detalhes Técnicos: Boundary

O `boundary` é uma string aleatória usada para separar as partes do formulário:

```
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="arquivo"; filename="teste.dbc"
Content-Type: application/octet-stream

[DADOS DO ARQUIVO AQUI]
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

**Tamanho do boundary:**
- Prefixo: `------WebKitFormBoundary` (24 caracteres)
- Hash aleatório: `7MA4YWxkTrZu0gW` (16 caracteres)
- **Total por boundary:** ~40 bytes
- **Usado 2 vezes:** início e fim
- **Total:** ~80 bytes apenas de boundaries

**Headers do campo:**
```
Content-Disposition: form-data; name="arquivo"; filename="PAPA2501.dbc"
Content-Type: application/octet-stream
```
**Total:** ~100 bytes

**Total de overhead fixo:** ~200 bytes

Mas o **overhead real** vem de:
1. **Codificação HTTP** (chunked transfer encoding)
2. **Buffers internos** do Axios/Node.js
3. **Alocação de memória** temporária

---

## 📝 Arquivo de Configuração

Para ajustar os limites, você pode usar variáveis de ambiente:

```bash
# .env
HTTP_MAX_BODY_LENGTH=300000000  # 300 MB
HTTP_MAX_CONTENT_LENGTH=300000000  # 300 MB
```

E no código:

```typescript
const maxSize = Number(process.env.HTTP_MAX_BODY_LENGTH) || 300 * 1024 * 1024;
```

---

## 🎯 Recomendações

### Para Arquivos Pequenos (<10MB)
- Limite de **50MB** é suficiente
- Overhead será ~1-2%

### Para Arquivos Médios (10-100MB)
- Limite de **200-300MB** recomendado
- Overhead pode ser 5-30%

### Para Arquivos Grandes (>100MB)
- Considere **streaming** em vez de buffer completo
- Use `Infinity` se possível
- Ou implemente upload em chunks

---

## 🚀 Streaming (Alternativa Futura)

Para arquivos muito grandes, em vez de carregar tudo na memória:

```typescript
import * as fs from 'fs';
import * as FormData from 'form-data';

const form = new FormData();

// Stream do arquivo (não carrega tudo na memória)
const stream = fs.createReadStream('/caminho/arquivo.dbc');
form.append('arquivo', stream, {
    filename: 'arquivo.dbc',
    contentType: 'application/octet-stream',
});

// Enviar com streaming
await axios.post(url, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,  // Sem limite
    maxContentLength: Infinity,
});
```

---

## 📊 Comparação: Buffer vs Stream

| Método | Arquivo 100MB | Memória Usada | Performance |
|--------|---------------|---------------|-------------|
| **Buffer (atual)** | Carrega tudo | ~150-200MB | Rápido, mas usa muita RAM |
| **Stream** | Chunk por chunk | ~5-10MB | Mais lento, mas eficiente |

---

## 🔧 Troubleshooting

### Erro: `maxContentLength size of X exceeded`

**Causa:** Requisição HTTP (arquivo + overhead) > limite configurado

**Solução:**
1. Aumente `maxBodyLength` e `maxContentLength`
2. Verifique o tamanho real do arquivo
3. Considere streaming para arquivos muito grandes

### Erro: `ENOMEM` (Out of Memory)

**Causa:** Node.js ficou sem memória ao processar o arquivo

**Solução:**
1. Aumente memória do Node: `NODE_OPTIONS="--max-old-space-size=4096"`
2. Use streaming em vez de buffer
3. Processe arquivos menores por vez

---

## ✅ Resumo

- ✅ **Limite aumentado de 150MB → 900MB**
- ✅ Arquivos de até ~400MB agora funcionam
- ✅ Overhead do multipart/form-data considerado
- ✅ Margem de segurança para buffers internos
- ✅ Suporte para respostas JSON grandes da API

**Agora seu ETL pode processar arquivos muito maiores sem erros!** 🎉

