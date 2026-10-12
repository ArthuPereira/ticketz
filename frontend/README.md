# Ticketz Frontend

Interface web do Ticketz, desenvolvida com React, TypeScript e Vite.

## Configuração local

1. Copie `.env.example` para `.env`.
2. Instale as dependências com `npm install`.
3. Inicie o ambiente local com `npm run dev`.

A URL da API é definida exclusivamente por `VITE_API_URL`. O indicador de cache
para a demonstração pode ser habilitado com `VITE_SHOW_CACHE_DEBUG=true`.

## Verificações

```bash
npm run lint
npm run test:all
npm run build
```

## Build de produção

O build publicado deve apontar para o DNS HTTPS do Application Load Balancer.
Não use `localhost`, IP privado ou uma URL HTTP, pois o navegador bloqueará a
comunicação de um frontend HTTPS com uma API HTTP.

```bash
export VITE_API_URL="https://api.example.com"
export VITE_SHOW_CACHE_DEBUG="false"
npm run build:production
```

Além de gerar `dist`, o comando confirma que:

- `dist/index.html` existe;
- a URL HTTPS da API foi incorporada ao bundle;
- não restou nenhum endereço local nos arquivos publicados.

O arquivo `.env.production.example` documenta as variáveis sem armazenar o
endereço real ou qualquer credencial.

## Publicação no S3 e CloudFront

Primeiro provisione o módulo em `../infra/frontend`. Depois exporte os outputs
do Terraform e a URL HTTPS do backend:

```bash
export FRONTEND_BUCKET="ticketz-frontend-nome-unico"
export CLOUDFRONT_DISTRIBUTION_ID="E1234567890"
export VITE_API_URL="https://api.example.com"
npm run deploy:aws
```

O script:

1. valida as variáveis e a identidade da sessão AWS;
2. gera e verifica o build de produção;
3. publica arquivos versionados de `assets/` com cache imutável;
4. publica `index.html` e demais arquivos sem cache persistente;
5. solicita uma invalidação do CloudFront.

O domínio HTTPS do CloudFront deve ser incluído em
`CORS_ALLOWED_ORIGINS` no ambiente do backend. Credenciais, `.env` reais e
arquivos `terraform.tfvars` nunca devem ser versionados.
