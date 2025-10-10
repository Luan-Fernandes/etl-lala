# 🚀 Otimizações de Memória e Swap

## 🎯 Problema Original
- Memória swap atingindo 100%
- Múltiplos arquivos .dbc carregados em memória simultaneamente
- Conversão para base64 aumentava ~33% o tamanho em memória
- Processamento paralelo de jobs sobrecarregava a memória

## ✅ Soluções Implementadas

### 1. **Processamento Sequencial de ZIPs**
```typescript
// ANTES: Baixava todos os ZIPs e enfileirava tudo de uma vez
for (const link of links) {
    const zipBuffer = await downloadZipFromUrl(link);
    const arquivosDbc = await extrairDbcDoZip(zipBuffer);
    // Enfileira todos os .dbc
}

// DEPOIS: Processa um ZIP por vez, completamente
for (const link of links) {
    const zipBuffer = await downloadZipFromUrl(link);
    const arquivosDbc = await extrairDbcParaDisco(zipBuffer); // Salva em disco
    
    // Processa cada .dbc ANTES de ir para o próximo ZIP
    for (const dbc of arquivosDbc) {
        await processarDbc(dbc);
        deletarArquivo(dbc.caminho); // Deleta após processar
    }
    
    deletarDiretorio(tempDir); // Limpa tudo do ZIP
}
```

### 2. **Uso de Disco Temporário ao Invés de Memória**

#### Antes (Base64 na Fila):
- Extraia .dbc → Buffer em memória
- Converte para base64 (aumenta 33%)
- Armazena base64 no Redis
- **Problema:** Múltiplos buffers gigantes em memória

#### Depois (Arquivo no Disco):
- Extrai .dbc → Salva em `/tmp/datasus-dbc-{timestamp}/`
- Enfileira apenas o **caminho do arquivo**
- Processor lê do disco sob demanda
- Deleta após processar
- **Benefício:** Memória ocupada apenas durante o processamento

```typescript
// Novo método
async extrairDbcParaDisco(zipBuffer: Buffer): Promise<Array<{ nome: string; caminho: string }>> {
    const tempDir = path.join(os.tmpdir(), 'datasus-dbc-' + Date.now());
    // Extrai e salva cada .dbc em disco
    // Retorna apenas caminhos, não buffers
}
```

### 3. **Limpeza Automática de Arquivos**

```typescript
// No processor (sendDbcFromDisk)
try {
    const dbcBuffer = fs.readFileSync(caminhoArquivo);
    await enviarDbcParaEndpoint(dbcBuffer, ...);
    
    // ✅ Deleta após sucesso
    deletarArquivo(caminhoArquivo);
    
} catch (error) {
    // ✅ Deleta mesmo em caso de erro
    deletarArquivo(caminhoArquivo);
    throw error;
}
```

### 4. **Garbage Collection Forçado**

#### Node.js Configurado com `--expose-gc`:
```dockerfile
# Dockerfile
ENV NODE_OPTIONS="--expose-gc --max-old-space-size=2048"
CMD ["node", "--expose-gc", "--max-old-space-size=2048", "dist/main.js"]
```

#### Uso no código:
```typescript
// Após extrair .dbc do ZIP
if (global.gc) {
    global.gc(); // Força coleta de lixo imediata
}
```

### 5. **Concorrência Limitada (1 job por vez)**

```typescript
@Processor('datasus')
export class DatasusProcessor {
    // Cada processo com concurrency: 1
    @Process({ name: 'sendDbcFromDisk', concurrency: 1 })
    async handleSendDbcFromDisk(job: Job) {
        // Processa apenas 1 .dbc por vez
    }
}
```

### 6. **Limites de Memória no Docker**

```yaml
# docker-compose.yml
etl_job:
    mem_limit: 3g
    memswap_limit: 3g  # Igual ao mem_limit = desabilita swap
    environment:
        NODE_OPTIONS: "--expose-gc --max-old-space-size=2048"
```

### 7. **Monitoramento de Memória em Tempo Real**

```typescript
// Logs detalhados de memória
const memUsage = process.memoryUsage();
console.log(`📊 Memória: RSS=${(memUsage.rss / 1024 / 1024).toFixed(0)}MB | Heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`);

// Antes, durante e depois de cada processamento
console.log(`📊 Mem ANTES: RSS=XXX MB`);
// ... processa arquivo ...
console.log(`📊 Mem DEPOIS: RSS=XXX MB`);
global.gc();
console.log(`🗑️ Mem PÓS-GC: RSS=XXX MB`);
```

### 8. **Redução Temporária de Tipos de Arquivo**

```typescript
// Para teste inicial - evita sobrecarga
const dados: Omit<SiasusArquivoDto, 'ano' | 'mes'> = {
    tipo_arquivo: [SiasusArquivoType.PA], // Apenas 1 tipo para teste
    // tipo_arquivo: [PA, PS, SAD, AB, ...], // Depois adicione mais
    modalidade: ["1"],
    fonte: [FonteType.SIASUS],
    uf: [UFType.PE],
};
```

## 📊 Fluxo Otimizado

```
┌─────────────────────────────────────────┐
│  1. Obter Links dos ZIPs (12 meses)     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Para cada ZIP (SEQUENCIAL):            │
│                                         │
│  2. ⬇️  Baixar ZIP → buffer             │
│                                         │
│  3. 💾 Extrair .dbc → DISCO (/tmp)      │
│     (não mantém em memória)             │
│                                         │
│  4. 🗑️  Liberar buffer do ZIP (GC)     │
│                                         │
│  5. Para cada .dbc (SEQUENCIAL):        │
│     ┌─────────────────────────────┐    │
│     │ a. Enfileirar (só caminho)  │    │
│     │ b. Ler do disco             │    │
│     │ c. Enviar para API Python   │    │
│     │ d. DELETAR arquivo          │    │
│     │ e. Forçar GC                │    │
│     └─────────────────────────────┘    │
│                                         │
│  6. 🗑️  Deletar diretório /tmp/...     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
        Próximo ZIP (volta ao passo 2)
```

## 🎯 Resultados Esperados

| Métrica | Antes | Depois |
|---------|-------|--------|
| **Memória RAM** | Todos ZIPs + .dbc em memória | 1 .dbc por vez |
| **Swap** | 100% (estouro) | 0% (desabilitado) |
| **Redis** | Buffers base64 gigantes | Apenas caminhos de arquivo |
| **Disco /tmp** | Não usado | Usado e limpo automaticamente |
| **Concorrência** | Múltiplos jobs simultâneos | 1 job por vez |
| **GC** | Automático (lento) | Forçado após cada arquivo |

## 🚀 Como Testar

```bash
# 1. Rebuild com as novas configurações
cd /home/luan/Documentos/etl-mult/etl-mult
docker-compose down -v
docker-compose build --no-cache

# 2. Subir com monitoramento
docker-compose up

# 3. Monitorar memória em outro terminal
watch -n 1 docker stats etl_job

# 4. Verificar logs com métricas de memória
docker-compose logs -f etl_job | grep "📊"
```

## 🔧 Ajustes Finos

### Se ainda houver problemas de memória:

1. **Reduzir heap do Node.js:**
```bash
--max-old-space-size=1024  # Reduzir para 1GB
```

2. **Aumentar limite do container:**
```yaml
mem_limit: 4g  # Aumentar para 4GB
```

3. **Processar menos competências:**
```typescript
// Em getCompetence()
return [{ mes: "01", ano: "2025" }]; // Apenas 1 mês
```

4. **Adicionar delay entre processamentos:**
```typescript
await new Promise(r => setTimeout(r, 5000)); // 5s de pausa
```

## 📝 Logs Importantes

Fique atento aos seguintes logs:

```
✅ BOM:
📊 Memória: RSS=450MB | Heap=280MB
🗑️ Arquivo deletado: PAPE2501.dbc
🗑️ Diretório deletado: /tmp/datasus-dbc-1234567890
🗑️ Mem PÓS-GC: RSS=420MB | Heap=250MB

❌ PROBLEMA:
📊 Memória: RSS=2500MB | Heap=1800MB  # Muito alto!
# Se a memória não cair após GC, há vazamento
```

## 🔍 Debug de Vazamento de Memória

Se a memória continuar crescendo:

```bash
# 1. Habilitar heap snapshot
node --expose-gc --heapsnapshot-signal=SIGUSR2 dist/main.js

# 2. Tirar snapshot durante execução
kill -SIGUSR2 <pid>

# 3. Analisar com Chrome DevTools
# chrome://inspect → Load snapshot
```

## ✨ Próximos Passos

Após confirmar que está funcionando:

1. ✅ Aumentar tipos de arquivo gradualmente
2. ✅ Aumentar número de competências
3. ✅ Ajustar limites de memória conforme necessário
4. ✅ Configurar alertas de memória

---

**Última atualização:** Otimizações implementadas para resolver estouro de swap




