# Visão geral do Projeto (Ticketz)
Esse é um sistema de compra de ingressos gratuitos. A plataforma deve suportar alta concorrência, garantindo a consistência das reservas e a rápida resposta aos usuários através de processamento assíncrono e cache.

# Stack de Tecnologias Base
- Linguagem: Python 3.13
- Gerenciador de pacotes e ambiente: `uv`
- Framework Web: FastAPI
- Banco de dados: PostgreSQL (via AsyncPG e SQLAlchemy)
- Migrations: Alembic
- Mensageria: RabbitMQ
- Cache: Redis
- Storage: Solução S3-compatible (Garage)
- Infraestrutura: Docker

# Regras Globais Inegociáveis
1. **Overselling:** Operações de reserva e compra nunca podem confiar apenas em validação em memória no Python; o controle de concorrência deve ser garantido de forma atômica no banco de dados ou no cache.
2. **Configuração Externa:** Todo endereço de serviço (Postgres, Redis, RabbitMQ, Garage) e credencial deve vir obrigatoriamente de variáveis de ambiente.
3. **Código Estrito:** Todo código Python deve ser tipado rigorosamente (`Type Hints`).
4. **Assincronismo:** I/O bloqueante é estritamente proibido. Todas as chamadas de banco, cache, storage ou filas devem usar bibliotecas assíncronas nativas.
5. **Idioma:** Código (variáveis, classes, métodos e comentários) estritamente em Inglês.
6. **Execução:** Sempre execute scripts e ferramentas Python usando uv run.

# Limites do Agente
1. **Dependências:** Nunca adicione novas dependências via `uv add` sem minha aprovação
2. **Migrations:** Nunca execute `alembic revision` ou `alembic upgrade` sem minha aprovação