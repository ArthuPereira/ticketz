---
name: docker-ticketz
description: Instruções para utilizar Docker de forma eficaz no ambiente com práticas atuais. Use quando a pessoa precisar rodar containers, criar imagens leves ou gerir um ambiente com docker compose.
---

# Docker para o projeto do Ticketz

## Regras

- O Dockerfile da API deve ser feito utilizando multi-stage build e com `python:3.13-slim` como imagem base. No estágio builder use `uv` para instalar dependências.
- A inicialização da API deve ter uma cláusula de `condition: service_healty` e `depends_on` apontando para o estado de: Postgres, Garage, Redis e RabbitMQ. Para isso, estes devem ter `healtchek`
- Postgres, Garage, Redis e RabbitMQ usam named volumes. A API usa um volume com bind-mount para hot reload.
- Informações de portas e senhas dos serviços devem vir de `.env`, deixando sempre `.env-example` atalizado com chaves de exemplo.
- Nunca usar `tag: latest` ao nomear imagens

## Instruções

1. Ao iniciar o projeto use `docker compose up -d`
2. Imagens devem ser versionadas com uma tag na criação
3. Manter um `.dockerignore` para um projeto Python