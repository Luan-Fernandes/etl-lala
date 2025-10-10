# ⚡ Otimização da API Python - Processamento DBC

## 🐌 Problema Identificado

A API Flask está demorando **muito tempo** para processar arquivos .dbc:
- **29 segundos** para um arquivo de teste pequeno (fake)
- Arquivos reais (.dbc com vários MB) podem demorar **minutos**
- Isso causa timeout e `ECONNRESET` no cliente

## ✅ Soluções Aplicadas no TypeScript

### 1. Timeout aumentado para 30 minutos
- `datasus.service.ts`: timeout de 1.800.000ms (30 minutos)
- `http-client.module.ts`: timeout padrão de 30 minutos
- `docker-compose.yml`: HTTP_TIMEOUT=1800000

Isso **resolve o erro imediato**, mas a API continua lenta.

---

## 🚀 Recomendações para Otimizar a API Python

### Problema 1: Servidor de Desenvolvimento (Werkzeug)

O servidor embutido do Flask **não é otimizado** para produção.

**Solução: Use Gunicorn ou uWSGI**

```bash
# Instalar Gunicorn
pip install gunicorn

# Rodar com Gunicorn
gunicorn --workers 4 --timeout 300 --bind 0.0.0.0:5000 app:app
```

Ou crie um `Dockerfile` para a API Python:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Use Gunicorn em vez do servidor de desenvolvimento
CMD ["gunicorn", "--workers", "4", "--timeout", "300", "--bind", "0.0.0.0:5000", "app:app"]
```

---

### Problema 2: Processamento Síncrono

Cada requisição trava o servidor até terminar.

**Solução A: Limite de registros**

Sua API Python já tem suporte para `limit` via form-data, mas não está sendo usado:

```python
# No seu endpoint /converter
limit = request.form.get('limit', type=int, default=None)

# Ao ler o DBF
contador = 0
for registro in table:
    if limit and contador >= limit:
        break
    registro_limpo = {}
    # ... processar registro ...
    dados_json.append(registro_limpo)
    contador += 1
```

**Solução B: Processamento assíncrono com Celery**

Para arquivos grandes, retorne um job ID e processe em background:

```python
from celery import Celery

celery = Celery('tasks', broker='redis://localhost:6379')

@celery.task
def processar_dbc_async(arquivo_path):
    # Processamento pesado aqui
    return resultado

@app.route('/converter', methods=['POST'])
def converter_dbc():
    # Salva arquivo
    task = processar_dbc_async.delay(temp_path)
    return jsonify({'job_id': task.id, 'status': 'processing'})

@app.route('/status/<job_id>')
def check_status(job_id):
    task = celery.AsyncResult(job_id)
    if task.ready():
        return jsonify({'status': 'done', 'result': task.result})
    return jsonify({'status': 'processing'})
```

---

### Problema 3: Processamento de Arquivos Grandes

Ler todo o arquivo DBF na memória pode ser lento.

**Solução: Streaming/Chunking**

```python
@app.route('/converter', methods=['POST'])
def converter_dbc():
    # ... validações ...
    
    # Processar em chunks
    CHUNK_SIZE = 1000
    dados_json = []
    
    for i, registro in enumerate(table):
        # ... processar registro ...
        dados_json.append(registro_limpo)
        
        # Se chegou ao chunk, envie parcialmente
        if (i + 1) % CHUNK_SIZE == 0:
            # Opcional: salvar em DB parcialmente
            pass
    
    return jsonify({
        'sucesso': True,
        'total_registros': len(dados_json),
        'dados': dados_json  # Ou salvar em DB e não retornar todos
    })
```

**Melhor ainda: Não retorne todos os dados**

Se você tem milhares de registros, não faz sentido retornar todos no JSON. Salve direto no banco de dados:

```python
import psycopg2

@app.route('/converter', methods=['POST'])
def converter_dbc():
    # ... processar DBC ...
    
    # Conectar ao banco
    conn = psycopg2.connect(
        host='postgres',
        database='etl_mult',
        user='postgres',
        password='postgres'
    )
    cursor = conn.cursor()
    
    # Inserir em batch
    for registro in table:
        cursor.execute(
            "INSERT INTO datasus_registros (coluna1, coluna2, ...) VALUES (%s, %s, ...)",
            (valor1, valor2, ...)
        )
    
    conn.commit()
    cursor.close()
    conn.close()
    
    # Retornar apenas metadados
    return jsonify({
        'sucesso': True,
        'arquivo': arquivo.filename,
        'total_registros': total_registros,
        'total_colunas': len(colunas),
        'colunas': colunas,
        # NÃO retorne 'dados' se tiver milhares de registros
    })
```

---

### Problema 4: Biblioteca `pyreaddbc` pode ser lenta

A função `dbc2dbf()` pode ser o gargalo.

**Solução: Investigate ou troque a biblioteca**

```python
import time

@app.route('/converter', methods=['POST'])
def converter_dbc():
    # ... código anterior ...
    
    start = time.time()
    dbc2dbf(temp_path, temp_dbf_path)
    dbc_time = time.time() - start
    print(f"⏱️ dbc2dbf levou {dbc_time:.2f}s")
    
    start = time.time()
    table = dbfread.DBF(temp_dbf_path, encoding='latin1')
    dbf_time = time.time() - start
    print(f"⏱️ dbfread levou {dbf_time:.2f}s")
    
    # ... resto do código ...
```

Veja qual parte está mais lenta e otimize.

---

## 🐳 Docker Compose para a API Python

Adicione a API Python no seu `docker-compose.yml`:

```yaml
services:
  # ... postgres, redis, etl_job ...
  
  converter_api:
    build:
      context: ./converter-api  # Pasta com Dockerfile da API Python
    container_name: converter_api
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - GUNICORN_WORKERS=4
      - GUNICORN_TIMEOUT=300
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/"]
      interval: 30s
      timeout: 10s
      retries: 3
```

E então no `etl_job`, use o nome do serviço:

```yaml
etl_job:
  environment:
    CONVERTER_API_URL: http://converter_api:5000/converter
```

---

## 📊 Monitoramento

Adicione logs detalhados para identificar gargalos:

```python
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/converter', methods=['POST'])
def converter_dbc():
    start_total = time.time()
    
    try:
        logger.info(f"📥 Recebendo arquivo: {arquivo.filename}")
        
        # Salvar arquivo
        start = time.time()
        arquivo.save(temp_path)
        logger.info(f"⏱️ Salvar arquivo: {time.time() - start:.2f}s")
        
        # Conversão DBC -> DBF
        start = time.time()
        dbc2dbf(temp_path, temp_dbf_path)
        logger.info(f"⏱️ dbc2dbf: {time.time() - start:.2f}s")
        
        # Leitura DBF
        start = time.time()
        table = dbfread.DBF(temp_dbf_path, encoding='latin1')
        logger.info(f"⏱️ Abrir DBF: {time.time() - start:.2f}s")
        
        # Processamento
        start = time.time()
        dados_json = []
        for registro in table:
            # ... processar ...
            dados_json.append(registro_limpo)
        logger.info(f"⏱️ Processar registros: {time.time() - start:.2f}s")
        
        logger.info(f"✅ Total: {time.time() - start_total:.2f}s - {len(dados_json)} registros")
        
        return jsonify({...})
    
    except Exception as e:
        logger.error(f"❌ Erro após {time.time() - start_total:.2f}s: {str(e)}")
        raise
```

---

## 🎯 Resumo das Ações

### ✅ Já Feito (TypeScript)
- [x] Timeout aumentado para 30 minutos
- [x] Configurações no docker-compose
- [x] Tratamento de erros melhorado

### 🔧 Fazer na API Python (Recomendado)
1. **Urgente:** Trocar Werkzeug por Gunicorn
2. **Importante:** Adicionar logs de performance
3. **Performance:** Implementar limite de registros
4. **Arquitetura:** Não retornar todos os dados no JSON (salvar no DB)
5. **Produção:** Dockerizar a API Python
6. **Avançado:** Processamento assíncrono com Celery

---

## 🧪 Teste Após Otimizações

```bash
# Rebuildar
cd /home/luan/Documentos/etl-mult/etl-mult
docker-compose down
docker-compose build
docker-compose up

# Monitorar logs
docker-compose logs -f etl_job
```

Com as otimizações, o processamento deve ficar muito mais rápido! 🚀




