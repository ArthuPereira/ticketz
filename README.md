# Ticketz - Backend de Venda e Emissão de Ingressos

Emulação local dos serviços da AWS (S3, DynamoDB, SNS, SQS) via MiniStack, juntamente com PostgreSQL e Redis via Docker Compose, permitindo desenvolver e testar toda a arquitetura sem custos na nuvem. O Terraform roda em container e provisiona a infraestrutura emulada.

## Estrutura do Projeto

```
├── docker-compose.yml
├── .env.example
├── pyproject.toml
├── alembic.ini
├── migrations/          # Migrações do banco de dados relacional (Alembic)
├── infra/               # Infraestrutura como código Terraform (S3, SNS/SQS, DynamoDB)
├── src/
│   ├── main.py          # Ponto de entrada da API FastAPI
│   ├── core/            # Configurações, banco, cache, AWS e models
│   ├── auth/            # Módulo de autenticação JWT e controle de acesso
│   ├── evento/          # Gestão de eventos, vitrine e upload de banners
│   ├── ingresso/        # Compra atômica, listagem e download de ingressos
│   └── health.py        # Health check (/health/live e /health/ready)
├── worker/
│   ├── __main__.py      # Loop de consumo SQS, retry, DLQ e reconciliação
│   ├── handler.py       # Lógica de processamento e atualização de status
│   └── pdf.py           # Geração do PDF em memória com QR Code
└── tests/               # Suíte completa de testes automatizados
```

## Pré-requisitos

- Python 3.12+ e [uv](https://github.com/astral-sh/uv)
- Docker e Docker Compose

---

## Subindo o Ambiente (Passo a Passo)

### 1. Configurar Variáveis de Ambiente
Copie o arquivo de exemplo para criar o seu `.env`:
```bash
cp .env.example .env
```
O `.env.example` já vem pré-configurado para o ambiente local (conectando em `localhost:5432` para Postgres, `localhost:6379` para Redis e `localhost:4566` para MiniStack).

### 2. Subir os Serviços Básicos no Docker
Inicie os containers do emulador AWS (MiniStack), do banco relacional (PostgreSQL) e do cache (Redis):
```bash
docker compose up -d ministack postgres redis
```

Verifique se todos os containers estão saudáveis (`healthy`):
```bash
docker compose ps
```

### 3. Executar as Migrações do Banco de Dados (Alembic)
Com o PostgreSQL rodando, crie as tabelas no banco de dados (`usuarios`, `eventos`, `ingressos`):
```bash
uv run alembic upgrade head
```

### 4. Provisionar os Recursos AWS com Terraform
O container do Terraform conecta ao MiniStack e provisiona os buckets S3, o tópico SNS, a fila SQS com DLQ e a tabela do DynamoDB:

```bash
docker compose run --rm terraform init
docker compose run --rm terraform plan
docker compose run --rm terraform apply -auto-approve
```

Para conferir os recursos criados e os identificadores:
```bash
docker compose run --rm terraform output
```

Os outputs esperados são:
- `s3_bucket`: `ticketz-files-local`
- `sns_topic_arn`: `arn:aws:sns:us-east-1:000000000000:ticketz-ticket-purchased`
- `sqs_queue_url`: `http://localhost:4566/000000000000/ticketz-ticket-processing`
- `sqs_dlq_url`: `http://localhost:4566/000000000000/ticketz-ticket-processing-dlq`
- `dynamodb_table`: `ticketz-action-logs`

### 5. Subir a Aplicação

Em terminais separados:

#### Terminal 1: API (FastAPI / Uvicorn)
```bash
uv run uvicorn src.main:app --reload
```
A API estará disponível em `http://localhost:8000` e a documentação interativa em `http://localhost:8000/docs`.

#### Terminal 2: Worker Assíncrono
O worker consome mensagens da fila SQS com long polling (20s), gera o PDF com QR Code, faz o upload para o S3 e marca o ingresso como `READY`:
```bash
uv run python -m worker
```

---

## Executando os Testes Automatizados

O projeto possui cobertura completa de testes unitários e de integração (autenticação, eventos, ingressos, serviços AWS e worker):
```bash
uv run pytest -v
```

---

## Verificação e Comandos Úteis com AWS CLI

O AWS CLI roda em container via Docker Compose (serviço `aws`), apontando diretamente para o MiniStack:

```bash
# S3: Listar arquivos no bucket
docker compose run --rm aws s3 ls s3://ticketz-files-local/

# SNS -> SQS: Publicar uma mensagem de teste no tópico SNS
docker compose run --rm aws sns publish \
  --topic-arn "arn:aws:sns:us-east-1:000000000000:ticketz-ticket-purchased" \
  --message '{"ingresso_id": 1}'

# SQS: Ler mensagens da fila de processamento
docker compose run --rm aws sqs receive-message \
  --queue-url "http://localhost:4566/000000000000/ticketz-ticket-processing"

# DynamoDB: Consultar registros de log de ações
docker compose run --rm aws dynamodb scan --table-name ticketz-action-logs
```

---

## Limpeza e Reset do Ambiente

### Parada Normal (Fim do dia)
Para pausar os serviços mantendo os dados persistidos:
```bash
docker compose down
```

### Reset Completo (Recomeçar do zero)
Para recriar todo o estado local (banco, filas, tabelas e buckets):

```bash
# 1. Destrói os recursos do Terraform no MiniStack
docker compose run --rm terraform destroy -auto-approve

# 2. Derruba os containers e apaga os volumes do Postgres e Redis
docker compose down -v

# 3. Limpa o estado local do Terraform (se necessário)
rm -f infra/terraform.tfstate*
```

---

## Ambiente AWS Academy (Produção / Lab)

Para deploy na AWS Academy:
1. Copie as credenciais temporárias fornecidas no painel *AWS Details* do Learner Lab (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`).
2. Não defina a variável `AWS_ENDPOINT_URL` (para que o boto3 se comunique diretamente com a AWS real).
3. Utilize as roles já existentes (`LabRole` e `LabInstanceProfile`).