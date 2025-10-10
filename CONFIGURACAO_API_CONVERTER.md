# 🔌 Configuração da API de Conversão DBC

## 📋 Visão Geral

O ETL precisa de uma API externa que converte arquivos `.dbc` (formato DATASUS) para JSON. A URL dessa API é configurável através da variável de ambiente `CONVERTER_API_URL`.

---

## 🐳 Cenários de Uso

### 1️⃣ Rodando o ETL DENTRO do Docker (via `docker-compose up`)

**Situação:** O script `run-etl.ts` está rodando dentro do container `etl_job` e precisa acessar um serviço na sua máquina host.

**Solução:** Use `host.docker.internal` para acessar serviços do host:

```bash
# No arquivo .env ou como variável de ambiente
CONVERTER_API_URL=http://host.docker.internal:5000/converter
```

**Por quê?**
- Containers Docker têm sua própria rede isolada
- `localhost` dentro do container se refere ao próprio container, não ao host
- `host.docker.internal` é um hostname especial que aponta para o IP da máquina host

---

### 2️⃣ Rodando o ETL FORA do Docker (desenvolvimento local)

**Situação:** Você está executando `npm run start:dev` ou similar diretamente no terminal.

**Solução:** Use `localhost` normalmente:

```bash
# No arquivo .env
CONVERTER_API_URL=http://localhost:5000/converter
```

---

### 3️⃣ API Conversor em outro Container Docker

**Situação:** A API de conversão também está definida no `docker-compose.yml`.

**Solução:** Use o nome do serviço Docker:

```yaml
# docker-compose.yml
services:
  converter_api:
    image: seu-conversor-dbc:latest
    ports:
      - "5000:5000"
  
  etl_job:
    environment:
      CONVERTER_API_URL: http://converter_api:5000/converter
```

---

## ✅ Como Verificar

### 1. Confirme que a API está rodando:

```bash
# Na sua máquina host
curl http://localhost:5000/converter
# ou
curl http://localhost:5000/health  # se houver endpoint de health
```

### 2. Teste a conexão do container:

```bash
# Entre no container
docker exec -it etl_job sh

# Teste a conectividade
wget -O- http://host.docker.internal:5000/converter
# ou
curl http://host.docker.internal:5000/converter
```

---

## 🔧 Comandos Úteis

### Verificar o IP da sua máquina na rede Docker:

```bash
# No host
ip addr show docker0

# Ou via Docker
docker network inspect bridge | grep Gateway
```

### Ver os logs do ETL:

```bash
docker-compose logs -f etl_job
```

### Rebuildar após mudanças:

```bash
docker-compose down
docker-compose build
docker-compose up
```

---

## ❌ Erros Comuns

### `ECONNREFUSED` ou `connect ETIMEDOUT`

**Problema:** O container não consegue acessar a API.

**Soluções:**
1. Verifique se a API está realmente rodando na porta 5000
2. Confirme que está usando `host.docker.internal:5000` (não `localhost:5000`)
3. No Linux, `host.docker.internal` pode não funcionar. Use:
   ```bash
   # Opção 1: Use o IP da bridge Docker (geralmente 172.17.0.1)
   CONVERTER_API_URL=http://172.17.0.1:5000/converter
   
   # Opção 2: Adicione no docker-compose.yml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```

### `Cannot read property 'length' of undefined`

**Problema:** A API retornou uma resposta inesperada ou vazia.

**Soluções:**
1. Verifique se a API está retornando JSON válido
2. Teste manualmente com `curl` ou Postman
3. Veja os logs da API de conversão

---

## 📝 Exemplo Completo

### `.env` (ou variáveis de ambiente):

```bash
# Para Docker
CONVERTER_API_URL=http://host.docker.internal:5000/converter

# Para desenvolvimento local
# CONVERTER_API_URL=http://localhost:5000/converter
```

### Executar o ETL:

```bash
# Com Docker
docker-compose up

# Desenvolvimento local
npm run start:dev
```

---

## 🎯 Conclusão

- **Docker → Host:** `http://host.docker.internal:5000`
- **Host → Host:** `http://localhost:5000`
- **Container → Container:** `http://nome_servico:5000`

Se ainda tiver problemas, verifique:
1. ✅ API está rodando e acessível
2. ✅ Porta 5000 está mapeada corretamente
3. ✅ Firewall não está bloqueando a conexão
4. ✅ Variável de ambiente está sendo lida corretamente











