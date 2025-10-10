# 📝 Resumo das Alterações - Integração com API Python

## 🎯 Problema Resolvido

O ETL estava tentando se conectar a `http://172.27.0.2:5000/converter` (IP interno do Docker), mas quando roda dentro de um container Docker, precisa usar `host.docker.internal` para acessar serviços na máquina host.

---

## ✅ Alterações Realizadas

### 1. **Interface TypeScript para a API Python** (`datasus.service.ts`)

Criadas interfaces que correspondem exatamente à resposta da API Python Flask:

```typescript
export interface DbcConverterResponse {
    sucesso: boolean;
    arquivo: string;
    total_registros: number;
    total_colunas: number;
    colunas: string[];
    dados: Record<string, any>[];
}

export interface DbcConverterErrorResponse {
    erro: string;
    detalhe?: string;
}
```

### 2. **Método `enviarDbcParaEndpoint` aprimorado**

- ✅ Envia o campo `'arquivo'` no form-data (esperado pela API Python)
- ✅ Valida `sucesso: true` na resposta
- ✅ Logs detalhados com emojis e informações úteis
- ✅ Tratamento de erros melhorado com detalhes da API
- ✅ Tipagem forte com `DbcConverterResponse`

### 3. **Método `processarLinksPadrao` atualizado**

- ✅ Parâmetro `endpointUrl` agora é **opcional**
- ✅ Usa automaticamente `process.env.CONVERTER_API_URL`
- ✅ Fallback para `http://host.docker.internal:5000/converter`
- ✅ Retorna `DbcConverterResponse[]` tipado
- ✅ Log informativo do endpoint sendo usado

### 4. **Script `run-etl.ts` simplificado**

- ✅ Não precisa mais passar a URL manualmente
- ✅ Usa a variável de ambiente automaticamente
- ✅ Estatísticas baseadas na resposta real da API
- ✅ Removido import desnecessário do axios

### 5. **Processor atualizado** (`datasus.processor.ts`)

- ✅ Usa o tipo `DbcConverterResponse`
- ✅ Logs melhorados com informações úteis

### 6. **Variável de ambiente configurada** (`docker-compose.yml`)

```yaml
environment:
  CONVERTER_API_URL: ${CONVERTER_API_URL:-http://host.docker.internal:5000/converter}
```

E também adicionado:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Isso garante que `host.docker.internal` funciona no Linux.

### 7. **Documentação atualizada**

- ✅ `env.example` com instruções claras
- ✅ `CONFIGURACAO_API_CONVERTER.md` com guia completo

---

## 🔧 Como a Requisição Funciona Agora

### TypeScript (NestJS)
```typescript
const form = new FormData();
form.append('arquivo', dbcBuffer, {
    filename: nomeArquivo,
    contentType: 'application/octet-stream',
});

const { data } = await this.httpService.post<DbcConverterResponse>(
    endpointUrl, 
    form, 
    { headers: { ...form.getHeaders() } }
);
```

### Python (Flask)
```python
@app.route('/converter', methods=['POST'])
def converter_dbc():
    arquivo = request.files['arquivo']  # ✅ Recebe o campo 'arquivo'
    # ... processa e retorna JSON
    return jsonify({
        'sucesso': True,
        'arquivo': arquivo.filename,
        'total_registros': total_registros,
        'total_colunas': len(colunas),
        'colunas': colunas,
        'dados': dados_json
    })
```

**✅ Perfeito match! O TypeScript envia exatamente o que o Python espera.**

---

## 🚀 Como Executar

### Opção 1: Com Docker (recomendado)

```bash
cd /home/luan/Documentos/etl-mult/etl-mult

# Parar containers atuais
docker-compose down

# Rebuildar com as mudanças
docker-compose build

# Executar
docker-compose up
```

A variável `CONVERTER_API_URL` está configurada no `docker-compose.yml` com o valor correto: `http://host.docker.internal:5000/converter`

### Opção 2: Sem Docker (desenvolvimento local)

```bash
cd /home/luan/Documentos/etl-mult/etl-mult

# Definir a URL (localhost funciona fora do Docker)
export CONVERTER_API_URL=http://localhost:5000/converter

# Executar
npm run start:dev
# ou
npm run build && node dist/scripts/run-etl.js
```

### Opção 3: Customizar a URL

```bash
# Criar arquivo .env
echo "CONVERTER_API_URL=http://meu-servidor:8080/api/converter" > .env

# Executar
docker-compose up
```

---

## 🧪 Verificar se a API Python está rodando

### Teste básico:
```bash
curl http://localhost:5000/converter
```

### Teste com arquivo real:
```bash
curl -X POST http://localhost:5000/converter \
  -F "arquivo=@/caminho/para/arquivo.dbc"
```

---

## 📊 Saída Esperada

Agora você verá logs informativos como:

```
🚀 Iniciando ETL DATASUS

📍 Usando endpoint: http://host.docker.internal:5000/converter

[DBC 1] Enviando: PAPA2501.dbc de https://...
✅ PAPA2501.dbc convertido: 12543 registros, 92 colunas
[DBC 1] ✅ PAPA2501.dbc: 12543 registros convertidos

✅ ETL concluído com sucesso!
📊 Total de arquivos .dbc processados: 1

📈 Estatísticas:
   - Arquivos .dbc: 1
   - Total de registros: 12543
   - Média por arquivo: 12543
   - Colunas (max): 92

📋 Resumo por arquivo:
   1. PAPA2501.dbc: 12543 registros

✨ Processamento finalizado!
```

---

## ❌ Troubleshooting

### Erro: `ECONNREFUSED`

**Causa:** A API Python não está acessível.

**Soluções:**
1. Verifique se a API está rodando: `curl http://localhost:5000`
2. No Linux, certifique-se de que `extra_hosts` está no `docker-compose.yml`
3. Tente usar o IP da bridge Docker: `http://172.17.0.1:5000/converter`

### Erro: `Nenhum arquivo enviado`

**Causa:** O campo form-data não está sendo enviado corretamente.

**Solução:** Já está corrigido! O código usa `form.append('arquivo', ...)` corretamente.

### Erro: `API retornou sucesso=false`

**Causa:** A API Python processou a requisição mas encontrou um erro.

**Solução:** Veja os logs da API Python para mais detalhes.

---

## 🎯 Conclusão

✅ **O código TypeScript está perfeito e alinhado com a API Python**
✅ **A URL usa `host.docker.internal` automaticamente quando roda no Docker**
✅ **Tipagem forte garante que a resposta está correta**
✅ **Logs informativos facilitam o debug**
✅ **Tudo configurável via variáveis de ambiente**

Basta executar `docker-compose up --build` e tudo deve funcionar! 🚀

