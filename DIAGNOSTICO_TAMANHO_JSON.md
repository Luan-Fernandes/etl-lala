# 🔍 Diagnóstico: Por que .dbc de 47MB vira JSON grande?

## 📊 Problema Reportado

Um arquivo `.dbc` de **47MB** está gerando um arquivo JSON que pode ser muito maior (potencialmente perto do limite de 900MB).

---

## 🤔 É Normal?

### Depende da Expansão

| Expansão | Tamanho JSON | Status | Causa Provável |
|----------|--------------|--------|----------------|
| **2-5x** | 94-235 MB | ✅ **Normal** | JSON é texto verboso, .dbc é binário compacto |
| **5-10x** | 235-470 MB | ⚠️ **Aceitável** | Muitos campos de texto, poucos números |
| **10-20x** | 470-940 MB | 🚨 **Suspeito** | Possível duplicação de dados ou formatação excessiva |
| **>20x** | >940 MB | ❌ **Erro** | Há algo muito errado na conversão |

---

## 🔬 Causas Comuns de Expansão

### 1. **Formato Binário vs Texto**

**.dbc (binário compacto):**
```
Campo numérico (int32): 4 bytes
Campo data: 4 bytes
Campo texto (10 chars): 10 bytes
```

**JSON (texto verboso):**
```json
{
  "campo_numerico": 12345,        // 25 bytes
  "campo_data": "2025-01-15",     // 28 bytes  
  "campo_texto": "João Silva"     // 30 bytes
}
Total: ~83 bytes (vs 18 bytes no binário) → 4.6x expansão
```

### 2. **Pretty Print (CORRIGIDO)**

**Antes (com indentação):**
```json
{
  "dados": [
    {
      "campo1": "valor1",
      "campo2": "valor2"
    }
  ]
}
```
**Tamanho:** ~100 bytes

**Agora (compacto):**
```json
{"dados":[{"campo1":"valor1","campo2":"valor2"}]}
```
**Tamanho:** ~52 bytes (**~50% menor!**)

### 3. **Nomes de Campos Longos**

Se o .dbc tem colunas com nomes longos, isso se repete em CADA registro:

```json
// 100.000 registros com:
{
  "PROCEDIMENTO_AMBULATORIAL_SUS": "0301010010",  // 50 bytes só no nome
  "COMPETENCIA_MOVIMENTACAO": "202501",
  "CODIGO_UNIDADE_SAUDE": "2600702"
}
```

**Total:** 50 bytes × 100.000 registros = **5MB só em nomes de campos!**

### 4. **Valores NULL ou Vazios**

JSON representa NULL como texto:

```json
{
  "campo1": null,  // 15 bytes
  "campo2": null,
  "campo3": null
}
```

No .dbc binário, NULL pode ser apenas 1 byte.

---

## 📈 Cálculo Teórico

### Exemplo Real: Arquivo DATASUS

**Arquivo .dbc:**
- Tamanho: 47 MB
- Registros estimados: 500.000
- Colunas: 92
- Tamanho médio por registro no .dbc: ~98 bytes

**Conversão para JSON:**

```typescript
// Cada registro pode virar:
{
  "AP_MVM": "202501",           // ~20 bytes
  "AP_CONDIC": "EP",            // ~18 bytes
  "AP_GESTAO": "260000",        // ~20 bytes
  // ... 89 campos mais
}
// Total por registro: ~200-400 bytes
```

**Cálculo:**
- 500.000 registros × 300 bytes = **150 MB de dados**
- + Metadados (colunas, sucesso, etc): **+5 MB**
- **Total: ~155 MB** (expansão de 3.3x) ✅ **Aceitável**

Mas se tiver:
- 1.000.000 registros × 400 bytes = **400 MB** (expansão de 8.5x) ⚠️
- 2.000.000 registros × 500 bytes = **1000 MB** (expansão de 21x) 🚨

---

## 🛠️ O Que Foi Feito

### 1. **Removido Pretty Print**
```typescript
// ANTES (muito espaço desperdiçado)
JSON.stringify(resultado, null, 2)

// AGORA (compacto)
JSON.stringify(resultado)
```

**Economia:** ~30-50% do tamanho

### 2. **Logs de Monitoramento**

Agora você verá:
```
📤 Enviando arquivo .dbc: PAPA2501.dbc (47.23 MB)
✅ PAPA2501.dbc convertido: 523.450 registros, 92 colunas
   📊 Tamanho: .dbc 47.23MB → JSON 158.67MB (expansão: 3.36x)
   ✅ [1/1] PAPA2501.json - 523.450 registros (158.67 MB)
```

### 3. **Limites Ajustados**

```typescript
maxBodyLength: 900 MB    // Para enviar .dbc grande
maxContentLength: 900 MB // Para receber JSON grande
```

---

## 🔍 Como Diagnosticar

### 1. **Verificar os Logs**

Execute o ETL e observe:

```bash
docker-compose logs -f etl_job
```

Procure por:
```
📊 Tamanho: .dbc XXmb → JSON YYmb (expansão: Z.ZZx)
```

### 2. **Análise da Expansão**

| Razão de Expansão | Ação |
|-------------------|------|
| **< 5x** | ✅ Normal, tudo OK |
| **5-10x** | ⚠️ Verificar se tem muitos campos de texto |
| **10-20x** | 🔍 Investigar com a API Python |
| **> 20x** | 🚨 Há algo errado, verificar API Python |

### 3. **Verificar API Python**

Adicione logs na sua API Flask:

```python
@app.route('/converter', methods=['POST'])
def converter_dbc():
    arquivo = request.files['arquivo']
    tamanho_dbc = len(arquivo.read())
    arquivo.seek(0)  # Voltar ao início
    
    # ... processar ...
    
    tamanho_json = len(json.dumps(dados_json))
    expansao = tamanho_json / tamanho_dbc
    
    print(f"📊 .dbc: {tamanho_dbc/1024/1024:.2f}MB → JSON: {tamanho_json/1024/1024:.2f}MB (expansão: {expansao:.2f}x)")
    
    return jsonify({...})
```

---

## ⚠️ Problemas Possíveis na API Python

### 1. **Duplicação de Dados**

```python
# ERRADO - duplica dados
dados_json = []
for registro in table:
    dados_json.append(registro)
    dados_json.append(registro)  # BUG: duplicação!

# CERTO
dados_json = []
for registro in table:
    dados_json.append(registro)
```

### 2. **Inclusão de Dados Desnecessários**

```python
# ERRADO - inclui informações demais
return jsonify({
    'dados': dados_json,
    'debug_info': str(table),  # Pode ser enorme!
    'raw_bytes': arquivo_bytes  # Duplica o arquivo!
})

# CERTO
return jsonify({
    'sucesso': True,
    'arquivo': arquivo.filename,
    'total_registros': len(dados_json),
    'dados': dados_json
})
```

### 3. **Codificação Errada**

```python
# ERRADO - pode gerar caracteres escapados demais
registro_limpo[key] = str(value).encode('unicode-escape')

# CERTO
registro_limpo[key] = str(value)
```

---

## 💡 Soluções se Expansão for Muito Grande

### Opção 1: Limitar Dados Retornados

Na API Python, aceite um parâmetro `limit`:

```python
limit = request.form.get('limit', type=int, default=None)

dados_json = []
for i, registro in enumerate(table):
    if limit and i >= limit:
        break
    dados_json.append(registro_limpo)
```

### Opção 2: Salvar Direto no Banco

Em vez de retornar JSON gigante, salve no banco e retorne só metadados:

```python
# Salvar no PostgreSQL
for registro in table:
    cursor.execute("INSERT INTO ... VALUES (...)", valores)

# Retornar apenas metadados
return jsonify({
    'sucesso': True,
    'total_registros': total,
    'tabela': 'datasus_papa2501'
})
```

### Opção 3: Compressão

Comprima o JSON antes de enviar:

```python
import gzip

json_bytes = json.dumps(dados_json).encode('utf-8')
json_compressed = gzip.compress(json_bytes)

return Response(
    json_compressed,
    headers={'Content-Encoding': 'gzip'}
)
```

---

## 📝 Checklist de Diagnóstico

- [ ] Verificar logs da expansão (.dbc → JSON)
- [ ] Expansão < 10x? Se não, investigar
- [ ] Adicionar logs na API Python
- [ ] Verificar se há duplicação de dados
- [ ] Confirmar que pretty print está desabilitado
- [ ] Se > 20x de expansão, há bug na API Python
- [ ] Considerar salvar direto no banco em vez de retornar JSON

---

## 🎯 Resultado Esperado

Com as correções aplicadas, para um arquivo .dbc de 47MB:

| Cenário | Registros | Expansão | Tamanho JSON | Status |
|---------|-----------|----------|--------------|--------|
| **Típico** | 500k | 3-5x | 141-235 MB | ✅ OK |
| **Muitos campos texto** | 500k | 5-8x | 235-376 MB | ⚠️ Aceitável |
| **Muito grande** | 1M+ | 8-15x | 376-705 MB | 🔍 Investigar |

**Se passar de 900MB, há certeza de que algo está errado!** 🚨




