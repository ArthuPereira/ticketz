# Hospedagem do frontend na AWS

Esta configuração é exclusiva da publicação real do frontend. A infraestrutura
local em `infra/` continua apontando para o MiniStack e não deve ser usada com
credenciais da AWS Academy.

## Recursos criados

- bucket S3 privado e separado dos banners e ingressos;
- criptografia SSE-S3, versionamento e bloqueio integral de acesso público;
- CloudFront com HTTPS e Origin Access Control (OAC);
- cache longo somente para os arquivos versionados de `assets/`;
- fallback de `403` e `404` para `index.html`, necessário às rotas da SPA;
- cabeçalhos básicos de segurança.

O backend, o ALB, as instâncias EC2, o Auto Scaling Group, o RDS e o
ElastiCache não são criados por este módulo. Eles continuam sendo recursos
obrigatórios da arquitetura principal do trabalho.

## Pré-requisitos

1. Sessão válida da AWS Academy no terminal.
2. Terraform 1.6 ou superior.
3. Um nome de bucket globalmente único.
4. Backend acessível por uma URL HTTPS do ALB.

Nunca coloque credenciais em arquivos `.tf`, `.tfvars` ou no Git.

## Provisionamento

```bash
cd infra/frontend
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Depois da criação, obtenha os dados usados na publicação:

```bash
terraform output -raw frontend_bucket_name
terraform output -raw cloudfront_distribution_id
terraform output -raw frontend_url
```

O arquivo `terraform.tfvars` é ignorado pelo Git porque pode conter valores
específicos da conta. O exemplo permanece versionado.

## Próximo passo

Use os outputs como variáveis do script `frontend/scripts/deploy-aws.sh`. O
domínio retornado em `frontend_url` também deve ser incluído em
`CORS_ALLOWED_ORIGINS` no ambiente do backend.
