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

## Publicação e Hospedagem na AWS

A interface Web pode ser entregue de duas formas:

### 1. Entrega Direta via Load Balancer (Recomendada / Arquitetura Alvo)
Atende ao **Requisito 1 da especificação** (*"A aplicação deve possuir uma interface Web (...) executada em uma instância na EC2"*).
Os arquivos compilados de `dist/` são incorporados à Golden AMI e servidos diretamente pelo FastAPI nas instâncias EC2 sob o ALB:

- **URL única**: `http://<ALB_DNS_NAME>/`
- **Zero certificados**: funciona diretamente em HTTP padrão na porta 80.
- **Zero CORS / Mixed Content**: frontend e API compartilham a mesma origem (`window.location.origin`).

Para compilar para mesma origem:
```bash
npm run build
```

### 2. (Legado / Opcional) Hospedagem Estática em S3 + CloudFront
Caso desejado para CDN global com HTTPS dedicado, o módulo em `../infra/frontend` pode ser provisionado:
```bash
export FRONTEND_BUCKET="ticketz-frontend-nome-unico"
export CLOUDFRONT_DISTRIBUTION_ID="E1234567890"
export VITE_API_URL="https://api.example.com"
npm run deploy:aws
```
