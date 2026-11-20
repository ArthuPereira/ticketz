# Ticketz Frontend

Interface web do Ticketz, desenvolvida com React, TypeScript e Vite.

## Configuração local

1. Copie `.env.example` para `.env`.
2. Instale as dependências com `npm install`.
3. Inicie o ambiente local com `npm run dev`.

A URL da API é definida por `VITE_API_URL`. Quando vazio (`VITE_API_URL=""`), o frontend utiliza a mesma origem (`window.location.origin`), que é o comportamento padrão quando servido diretamente pelo container `ticketz-api` no Docker Compose.

## Verificações

```bash
npm run lint
npm run test:all
npm run build
```

## Execução via Docker Compose

O `Dockerfile` na raiz do projeto executa um *multi-stage build* que compila o frontend automaticamente (`npm ci && npm run build`) e copia `frontend/dist` para dentro da imagem do backend FastAPI, servindo a SPA e a API REST na porta `8000`.
