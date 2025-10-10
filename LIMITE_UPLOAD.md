# 📦 Configuração de Limites de Upload

## ✅ Limites Configurados no ETL (Node.js)

### 1. Axios (HTTP Client)
```typescript
// src/axios/http-client.module.ts
maxBodyLength: 150 * 1024 * 1024,    // 150 MB
maxContentLength: 150 * 1024 * 1024,  // 150 MB
timeout: 300000,                      // 5 minutos
```

### 2. Requisições de Conversão DBC
```typescript
// src/datasus/datasus.service.ts
maxBodyLength: 150 * 1024 * 1024,    // 150 MB
maxContentLength: 150 * 1024 * 1024,  // 150 MB
timeout: 300000,                      // 5 minutos
```

---

## ⚠️ Você Também Precisa Configurar Sua API!

Se sua API (localhost:5000) estiver recusando arquivos grandes, você precisa aumentar os limites lá também.

### Python (Flask)

```python
from flask import Flask

app = Flask(__name__)

# Aumentar limite de upload para 150 MB
app.config['MAX_CONTENT_LENGTH'] = 150 * 1024 * 1024  # 150 MB

@app.route('/converter', methods=['POST'])
def converter():
    arquivo = request.files['arquivo']
    # ... processar
```

### Python (FastAPI)

FastAPI não tem limite por padrão, mas se estiver usando um servidor como **Uvicorn** ou **Gunicorn**, você pode precisar configurar:

```bash
# Uvicorn
uvicorn main:app --limit-max-requests 0 --timeout-keep-alive 300

# Ou no código
import uvicorn
uvicorn.run(app, host="0.0.0.0", port=5000, timeout_keep_alive=300)
```

### Node.js (Express)

```javascript
const express = require('express');
const multer = require('multer');

const app = express();

// Configurar multer para aceitar 150 MB
const upload = multer({
  limits: {
    fileSize: 150 * 1024 * 1024  // 150 MB
  }
});

app.post('/converter', upload.single('arquivo'), (req, res) => {
  const arquivo = req.file;
  // ... processar
});
```

### Node.js (NestJS)

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalInterceptors(new FileInterceptor('arquivo', {
    limits: {
      fileSize: 150 * 1024 * 1024  // 150 MB
    }
  }));
  
  await app.listen(5000);
}
```

---

## 🔧 Nginx (Se Estiver Usando)

Se sua API está atrás de um Nginx, você também precisa configurar:

```nginx
http {
    # Aumentar limite de upload
    client_max_body_size 150M;
    
    # Aumentar timeouts
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    proxy_read_timeout 300;
    send_timeout 300;
}
```

---

## 🐳 Docker (Se Estiver Usando)

Se sua API está em Docker, não há limite específico, mas certifique-se que o container tem memória suficiente:

```yaml
# docker-compose.yml
services:
  api:
    image: minha-api
    mem_limit: 2g  # 2 GB de RAM
```

---

## 🧪 Como Testar

### Testar diretamente com curl:

```bash
# Enviar arquivo de 50 MB
curl -X POST http://localhost:5000/converter \
  -F "arquivo=@PAPE2501.dbc" \
  -H "Accept: application/json" \
  --max-time 300
```

### Verificar logs:

Se ainda der erro, verifique os logs da sua API para ver a mensagem exata:

```bash
# Se for Python Flask/FastAPI
tail -f api.log

# Ou rode em modo debug
python app.py
```

---

## 📊 Tamanhos de Arquivos DBC

Arquivos .dbc do DATASUS variam de tamanho:

| Tipo | Tamanho Médio | Tamanho Máximo |
|------|---------------|----------------|
| PA (Produção Ambulatorial) | 30-60 MB | 100 MB |
| ABO (Acompanhamento Obesidade) | 5-15 MB | 30 MB |
| Outros | 1-20 MB | 50 MB |

Por isso configuramos **150 MB** como limite seguro.

---

## ❌ Erros Comuns

### Erro 413: "Request Entity Too Large"

**Causa:** Nginx ou servidor web bloqueando
**Solução:** Configurar `client_max_body_size` no Nginx

### Erro 504: "Gateway Timeout"

**Causa:** Processamento demorando muito
**Solução:** Aumentar timeout no Nginx e na aplicação

### Erro "ECONNRESET" ou "socket hang up"

**Causa:** Conexão caiu durante upload
**Solução:** Aumentar timeout e verificar rede

### Erro "Payload Too Large"

**Causa:** Limite da aplicação (Express/Flask/etc)
**Solução:** Configurar limite na sua API

---

## ✅ Checklist de Configuração

- [ ] Limites do ETL (Node.js) - ✅ JÁ CONFIGURADO
- [ ] Limites da sua API (Python/Node/etc) - ⚠️ VERIFICAR
- [ ] Nginx (se usar) - ⚠️ VERIFICAR  
- [ ] Docker memória (se usar) - ⚠️ VERIFICAR
- [ ] Timeout suficiente (5 minutos) - ✅ JÁ CONFIGURADO

---

## 🔍 Debug

Se ainda der erro após configurar tudo:

```bash
# Ver tamanho exato do arquivo
ls -lh arquivo.dbc

# Testar com arquivo menor primeiro
head -c 10M arquivo.dbc > teste-pequeno.dbc

curl -X POST http://localhost:5000/converter \
  -F "arquivo=@teste-pequeno.dbc" \
  -H "Accept: application/json"
```

---

## 📞 Resumo

**ETL (este projeto):** ✅ Já configurado para 150 MB  
**Sua API:** ⚠️ Você precisa configurar também  
**Nginx/Proxy:** ⚠️ Se usar, precisa configurar  

Configurar os 3 para o processo funcionar completamente! 🚀


