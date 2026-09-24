# Ambiente local (MiniStack + Terraform)

Emulação local dos serviços da AWS usados no trabalho (S3, RDS, ElastiCache, DynamoDB, SNS/SQS) para desenvolver sem gastar créditos do Academy. O Terraform roda em container, então não precisa instalar nada além do Docker.

## Estrutura

```
├── docker-compose.yml
├── .env.example
└── src
    └── infra
        ├── local/     # recursos emulados no MiniStack (um arquivo por serviço)
        └── academy/   # recursos na AWS Academy (main.tf por enquanto)
```

## Pré-requisitos

- Docker e Docker Compose

## Configuração

```bash
cp .env.example .env
```

O `.env` é lido automaticamente pelo `docker compose` e **não** vai para o git. As variáveis principais:

| Variável | Para quê |
| --- | --- |
| `AWS_REGION` | Região usada pelo emulador e pelo Terraform |
| `MINISTACK_HOST` | Host que a aplicação usa para alcançar o emulador e os bancos (`localhost` se a app roda fora do Docker) |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Credenciais do Postgres criado pelo Terraform |
| `AWS_ENDPOINT_URL` | **Para a aplicação**: faz os SDKs da AWS falarem com o emulador sem mudar código. Na nuvem, não defina |

## Subindo o ambiente

### 1. Emulador

```bash
docker compose up -d ministack
docker compose ps
curl http://localhost:4566/_ministack/health
```

Esperado: `ministack` como `healthy` e o curl devolvendo um JSON com os serviços.

### 2. Init e plan

```bash
docker compose run --rm terraform init
docker compose run --rm terraform plan
```

Esperado: `Plan: 9 to add, 0 to change, 0 to destroy`.

### 3. Apply

```bash
docker compose run --rm terraform apply -auto-approve
```

O RDS e o ElastiCache demoram mais na primeira vez, porque o MiniStack baixa as imagens do Postgres e do Redis. Em outro terminal, `docker ps` deve mostrar dois containers novos além do `ministack`.

### 4. Outputs

```bash
docker compose run --rm terraform output
```

Anote `db_port` e `cache_port` e copie os valores para o `.env` da aplicação. O `db_host` deve ser `localhost` (ou o valor de `MINISTACK_HOST`), **não** um IP interno tipo `172.x.x.x`. Se vier IP interno, a variável `MINISTACK_RDS_PUBLIC_ENDPOINT` não foi aplicada.

### 5. Alcançabilidade dos bancos

```bash
nc -zv localhost <db_port>
nc -zv localhost <cache_port>
```

Esperado: `succeeded` nos dois. Para testar de verdade (nomes dos containers no `docker ps`):

```bash
docker exec -it <container-postgres> psql -U appuser -d appdb -c "select 1"
docker exec -it <container-redis> redis-cli ping
```

### 6. S3, SNS/SQS e DynamoDB

O AWS CLI roda em container (serviço `aws` do compose), já apontado para o emulador. Se preferir, crie um alias: `alias awsl='docker compose run --rm aws'`.

```bash
# S3 (o arquivo precisa estar dentro da pasta do projeto)
echo "oi" > teste.txt
docker compose run --rm aws s3 cp teste.txt s3://cloudapp-files-local/teste.txt
docker compose run --rm aws s3 ls s3://cloudapp-files-local/
rm teste.txt

# SNS -> SQS (desacoplamento)
docker compose run --rm aws sns publish --topic-arn <sns_topic_arn> --message "arquivo novo"
docker compose run --rm aws sqs receive-message --queue-url <sqs_queue_url>

# DynamoDB (log de ações)
docker compose run --rm aws dynamodb put-item --table-name cloudapp-action-logs \
  --item '{"log_id":{"S":"1"},"action":{"S":"CREATE"}}'
docker compose run --rm aws dynamodb scan --table-name cloudapp-action-logs
```

O que confirma o desacoplamento: a mensagem publicada no SNS aparece no `receive-message` do SQS. Como a assinatura usa `raw_message_delivery`, o `Body` deve ser exatamente `arquivo novo`, sem o envelope JSON do SNS.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| `init` diz que não há arquivos `.tf` | O volume do serviço `terraform` no compose não aponta para `./src/infra/local` |
| Apply travado no RDS | Veja `docker logs ministack` (pode ser a checagem de disponibilidade contra o host publicado) |
| `db_host` com IP `172.x.x.x` | `MINISTACK_RDS_PUBLIC_ENDPOINT` não está ativa no serviço `ministack` |
| Terraform diz que recursos existem, mas o emulador não os conhece | Você fez `docker compose down` sem limpar o state (veja abaixo) |
| `sqs receive-message` volta vazio | A URL da fila vem do `terraform output` e pode ter `localhost`; se falhar, use `docker compose run --rm aws sqs list-queues` para pegar a URL certa |
| Arquivos `.terraform/` e `tfstate` com dono root (Linux) | Adicione `user: "<seu-uid>:<seu-gid>"` ao serviço `terraform` |

## Limpeza

**A ordem importa.** O emulador guarda o estado em memória e o Terraform guarda o dele em `terraform.tfstate`. Se derrubar o emulador primeiro, os dois ficam dessincronizados e os containers de Postgres/Redis podem sobrar.

### Limpeza normal (fim do dia)

```bash
# 1. Destrói os recursos (inclui os containers de Postgres e Redis)
docker compose run --rm terraform destroy -auto-approve

# 2. Derruba o emulador
docker compose down
```

### Reset completo (recomeçar do zero)

Se já fez `docker compose down` sem o `destroy`, ou quer partir de um estado limpo:

```bash
docker compose down

# Apaga o state do Terraform (ele descreve recursos que não existem mais)
rm -f src/infra/local/terraform.tfstate*

# Procura containers órfãos de Postgres/Redis criados pelo MiniStack
docker ps -a
docker rm -f <ids-dos-containers-postgres-e-redis>
```

Depois é só repetir a partir do passo 1.

### Faxina pesada (opcional)

Remove também o cache do provider e as imagens baixadas:

```bash
rm -rf src/infra/local/.terraform
docker image rm ministackorg/ministack hashicorp/terraform:1.10 amazon/aws-cli
docker image prune
```

Mantenha o `.terraform.lock.hcl` no git: ele trava a versão do provider para todo o grupo.

## Ambiente Academy

Os arquivos em `src/infra/academy` usam a AWS real. As credenciais **não** ficam no código: copie-as do painel *AWS Details* do Learner Lab para variáveis de ambiente (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`). Elas expiram quando a sessão do lab termina. No Academy não é possível criar IAM roles; use a `LabRole` e o `LabInstanceProfile` que já existem.

O Auto Scaling Group e o Load Balancer da Parte 2 são configurados pelo console.