# 📁 Estrutura dos Dados Processados

## 📂 Organização das Pastas

Quando você executa o ETL, os arquivos JSON processados são salvos em:

```
etl-mult/
└── src/
    └── json/
        ├── execucao-1728219876543/
        │   ├── _indice.json
        │   ├── PAPA2501.json
        │   ├── PAPE2501.json
        │   └── ...
        ├── execucao-1728306276543/
        │   ├── _indice.json
        │   └── ...
        └── ...
```

### 🗂️ Convenção de Nomes

- **Pasta raiz:** `src/json/`
- **Pasta de execução:** `execucao-{TIMESTAMP}/`
  - Formato: `execucao-{milissegundos}`
  - Exemplo: `execucao-1728219876543`
- **Arquivo de índice:** `_indice.json`
- **Arquivos de dados:** `{NOME_ORIGINAL}.json`

---

## 📄 Arquivo de Índice (`_indice.json`)

Cada execução gera um arquivo de índice com metadados completos:

```json
{
  "data_execucao": "2025-10-06T16:31:16.543Z",
  "total_arquivos": 3,
  "total_registros": 45678,
  "media_registros": 15226,
  "total_colunas_max": 92,
  "arquivos": [
    {
      "arquivo_original": "PAPA2501.dbc",
      "arquivo_json": "PAPA2501.json",
      "total_registros": 12543,
      "total_colunas": 92,
      "colunas": ["COLUNA1", "COLUNA2", ...]
    },
    {
      "arquivo_original": "PAPE2501.dbc",
      "arquivo_json": "PAPE2501.json",
      "total_registros": 18934,
      "total_colunas": 87,
      "colunas": ["CAMPO1", "CAMPO2", ...]
    }
  ]
}
```

### Campos do Índice:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `data_execucao` | ISO 8601 | Data/hora da execução do ETL |
| `total_arquivos` | number | Quantidade de arquivos .dbc processados |
| `total_registros` | number | Soma total de registros de todos os arquivos |
| `media_registros` | number | Média de registros por arquivo |
| `total_colunas_max` | number | Número máximo de colunas entre todos os arquivos |
| `arquivos` | array | Lista com metadados de cada arquivo processado |

---

## 📄 Arquivos de Dados (`.json`)

Cada arquivo `.dbc` gera um arquivo `.json` correspondente com a estrutura completa retornada pela API de conversão:

```json
{
  "sucesso": true,
  "arquivo": "PAPA2501.dbc",
  "total_registros": 12543,
  "total_colunas": 92,
  "colunas": [
    "AP_MVM",
    "AP_CONDIC",
    "AP_GESTAO",
    "AP_CODUNI",
    "AP_GESTAO",
    ...
  ],
  "dados": [
    {
      "AP_MVM": "202501",
      "AP_CONDIC": "EP",
      "AP_GESTAO": "260000",
      "AP_CODUNI": "2600702",
      ...
    },
    {
      "AP_MVM": "202501",
      "AP_CONDIC": "EP",
      ...
    }
  ]
}
```

### Estrutura do Arquivo JSON:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `sucesso` | boolean | Indica se a conversão foi bem-sucedida |
| `arquivo` | string | Nome do arquivo .dbc original |
| `total_registros` | number | Quantidade de registros (linhas) no arquivo |
| `total_colunas` | number | Quantidade de colunas |
| `colunas` | string[] | Lista dos nomes das colunas |
| `dados` | object[] | Array com todos os registros convertidos |

---

## 💡 Uso dos Dados

### 1. Ler o Índice

```typescript
import * as fs from 'fs';
import * as path from 'path';

const execucaoDir = './src/json/execucao-1728219876543';
const indice = JSON.parse(
  fs.readFileSync(path.join(execucaoDir, '_indice.json'), 'utf-8')
);

console.log(`Total de arquivos: ${indice.total_arquivos}`);
console.log(`Total de registros: ${indice.total_registros}`);

// Listar todos os arquivos processados
indice.arquivos.forEach(arquivo => {
  console.log(`${arquivo.arquivo_original}: ${arquivo.total_registros} registros`);
});
```

### 2. Ler um Arquivo de Dados Específico

```typescript
const arquivo = JSON.parse(
  fs.readFileSync(path.join(execucaoDir, 'PAPA2501.json'), 'utf-8')
);

console.log(`Colunas: ${arquivo.colunas.join(', ')}`);
console.log(`Total de registros: ${arquivo.total_registros}`);

// Processar cada registro
arquivo.dados.forEach((registro, index) => {
  console.log(`Registro ${index + 1}:`, registro);
});
```

### 3. Importar para Banco de Dados

```typescript
import { Pool } from 'pg';

const pool = new Pool({ /* config */ });

async function importarParaPostgres(execucaoDir: string) {
  const indice = JSON.parse(
    fs.readFileSync(path.join(execucaoDir, '_indice.json'), 'utf-8')
  );

  for (const meta of indice.arquivos) {
    const arquivo = JSON.parse(
      fs.readFileSync(path.join(execucaoDir, meta.arquivo_json), 'utf-8')
    );

    // Criar tabela dinamicamente baseado nas colunas
    const colunas = arquivo.colunas.map(col => `${col} TEXT`).join(', ');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${meta.arquivo_original.replace('.dbc', '')} (
        id SERIAL PRIMARY KEY,
        ${colunas}
      )
    `);

    // Inserir dados
    for (const registro of arquivo.dados) {
      const valores = arquivo.colunas.map(col => registro[col]);
      const placeholders = valores.map((_, i) => `$${i + 1}`).join(', ');
      
      await pool.query(`
        INSERT INTO ${meta.arquivo_original.replace('.dbc', '')} 
        (${arquivo.colunas.join(', ')}) 
        VALUES (${placeholders})
      `, valores);
    }

    console.log(`✅ ${meta.arquivo_original} importado`);
  }
}
```

### 4. Análise Rápida com Node.js

```typescript
// Contar total de registros em todas as execuções
const execucoes = fs.readdirSync('./src/json')
  .filter(dir => dir.startsWith('execucao-'));

let totalGeralRegistros = 0;

execucoes.forEach(execucao => {
  const indice = JSON.parse(
    fs.readFileSync(`./src/json/${execucao}/_indice.json`, 'utf-8')
  );
  
  totalGeralRegistros += indice.total_registros;
  
  console.log(`${execucao}: ${indice.total_registros} registros`);
});

console.log(`\nTotal geral: ${totalGeralRegistros} registros`);
```

---

## 🗑️ Limpeza

Os arquivos JSON podem ocupar bastante espaço. Para limpar execuções antigas:

```bash
# Remover execuções específicas
rm -rf src/json/execucao-1728219876543

# Manter apenas as 5 execuções mais recentes
cd src/json
ls -t | tail -n +6 | xargs rm -rf

# Limpar tudo
rm -rf src/json/*
```

---

## 📊 Tamanho Estimado

| Arquivo | Registros | Tamanho Aprox. |
|---------|-----------|----------------|
| 1.000 registros | 50 colunas | ~500 KB |
| 10.000 registros | 50 colunas | ~5 MB |
| 100.000 registros | 50 colunas | ~50 MB |

**Obs:** JSON é verboso. Para arquivos muito grandes, considere:
- Compactar com gzip: `gzip dados-processados/execucao-*/*.json`
- Usar formato binário (Parquet, Arrow)
- Salvar diretamente no banco de dados

---

## 🔒 Segurança

A pasta `src/json/` está no `.gitignore` para:
- ✅ Não commitar dados sensíveis
- ✅ Evitar repositório gigante
- ✅ Manter dados apenas local/servidor

**Importante:** Se os dados contêm informações sensíveis (dados de saúde, CPF, etc.), certifique-se de:
1. Não compartilhar a pasta
2. Fazer backup seguro
3. Criptografar se necessário
4. Seguir LGPD/regulamentações aplicáveis

---

## 📝 Exemplo de Output do Script

```
🚀 Iniciando ETL DATASUS
📁 Resultados serão salvos em: /app/src/json/execucao-1728219876543

[Processamento...]

📊 Processando metadados dos 3 arquivos JSON...

   ✅ [1/3] PAPA2501.json - 12.543 registros (45.23 MB)
   ✅ [2/3] PAPE2501.json - 18.934 registros (67.89 MB)
   ✅ [3/3] PATD2501.json - 14.201 registros (52.14 MB)

✅ ETL concluído com sucesso!
📊 Total de arquivos .dbc processados: 3

📈 Estatísticas:
   - Arquivos .dbc: 3
   - Total de registros: 45.678
   - Média por arquivo: 15.226
   - Colunas (max): 92

📋 Resumo por arquivo:
   1. PAPA2501.dbc: 12.543 registros (45.23 MB) → PAPA2501.json
   2. PAPE2501.dbc: 18.934 registros (67.89 MB) → PAPE2501.json
   3. PATD2501.dbc: 14.201 registros (52.14 MB) → PATD2501.json

📁 Arquivos salvos em: /app/src/json/execucao-1728219876543
📄 Índice completo: /app/src/json/execucao-1728219876543/_indice.json

✨ Processamento finalizado!
```


