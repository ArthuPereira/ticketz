import logging
import os
import random
import uuid
import requests
from locust import HttpUser, LoadTestShape, between, events, task

logger = logging.getLogger("ticketz.locust")

# Pool compartilhado de eventos conhecidos
KNOWN_EVENT_IDS: list[int] = [1, 2, 3, 6, 7]


def _seed_high_capacity_events(base_url: str):
    """Garante que existam múltiplos eventos com estoque alto para o teste de carga."""
    try:
        resp = requests.get(f"{base_url}/eventos?limit=50", timeout=10)
        if resp.status_code != 200:
            return

        items = resp.json().get("items", [])
        active_events = [e for e in items if e.get("ativo", True)]
        total_tickets = sum(e.get("ingressos_disponiveis", 0) for e in active_events)

        global KNOWN_EVENT_IDS
        if active_events:
            KNOWN_EVENT_IDS = [e["id"] for e in active_events]

        logger.info(
            "Eventos ativos encontrados: %d (Estoque total disponível: %d)",
            len(active_events),
            total_tickets,
        )

        # Se o estoque total disponível for menor que 5.000 ingressos, cria eventos adicionais
        if total_tickets < 5000:
            logger.info("Estoque baixo para teste de carga. Criando novos eventos com alta capacidade...")
            organizer_email = f"load_org_{uuid.uuid4().hex[:6]}@ticketz.com"
            organizer_pass = "SenhaForte123!"

            requests.post(
                f"{base_url}/auth/register",
                json={
                    "nome": "Organizador Carga",
                    "email": organizer_email,
                    "senha": organizer_pass,
                    "papel": "organizer",
                },
                timeout=10,
            )

            log_res = requests.post(
                f"{base_url}/auth/login",
                json={"email": organizer_email, "senha": organizer_pass},
                timeout=10,
            )
            if log_res.status_code != 200:
                return

            token = log_res.json().get("access_token")
            headers = {"Authorization": f"Bearer {token}"}

            eventos_para_criar = [
                ("Mega Festival Cloud 2026", "Grande festival distribuído", 15000),
                ("Arena Rock in Cloud 2026", "Shows simultâneos em alta disponibilidade", 15000),
                ("Summit AWS & DevOps UFC", "Conferência de escalabilidade horizontal", 15000),
            ]

            for nome, desc, qtd in eventos_para_criar:
                ev_res = requests.post(
                    f"{base_url}/eventos",
                    headers=headers,
                    json={
                        "nome": nome,
                        "descricao": desc,
                        "local": "Campus Cloud Arena",
                        "data": "2026-12-31T23:59:59Z",
                        "total_ingressos": qtd,
                    },
                    timeout=10,
                )
                if ev_res.status_code == 201:
                    new_id = ev_res.json()["id"]
                    if new_id not in KNOWN_EVENT_IDS:
                        KNOWN_EVENT_IDS.append(new_id)
                    logger.info("Criado evento de carga ID %d (%s) com %d ingressos", new_id, qtd, nome)

    except Exception as exc:
        logger.warning("Falha ao inicializar/semear eventos de carga: %s", exc)


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Executado ao iniciar a suíte Locust."""
    if environment.host:
        _seed_high_capacity_events(environment.host.rstrip("/"))


class Comprador(HttpUser):
    wait_time = between(0.02, 0.08)

    def on_start(self):
        """Cadastra usuário único e obtém JWT no início da sessão."""
        unique_id = uuid.uuid4().hex[:8]
        self.email = f"load_{unique_id}@ticketz.com"
        self.senha = "senhaforte123"
        self.headers: dict[str, str] = {}
        self.eventos_conhecidos: list[dict] = []
        self.eventos_comprados: set[int] = set()
        self.ingressos_ids: list[int] = []

        # 1. Cadastro com tentativa resiliente
        reg_payload = {
            "nome": f"Load User {unique_id}",
            "email": self.email,
            "senha": self.senha,
            "papel": "user",
        }
        res_reg = self.client.post("/auth/register", json=reg_payload)
        if res_reg.status_code not in (201, 409):
            res_reg = self.client.post("/auth/register", json=reg_payload)

        # 2. Login
        login_payload = {
            "email": self.email,
            "senha": self.senha,
        }
        res_login = self.client.post("/auth/login", json=login_payload)
        if res_login.status_code == 200:
            token = res_login.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {token}"}
        else:
            res_login = self.client.post("/auth/login", json=login_payload)
            if res_login.status_code == 200:
                token = res_login.json().get("access_token")
                self.headers = {"Authorization": f"Bearer {token}"}

        # 3. Inicializa eventos disponíveis
        self._atualizar_catalogo()

    def _atualizar_catalogo(self):
        """Consulta vitrine pública e armazena os eventos ativos."""
        resp = self.client.get("/eventos?limit=50", headers=self.headers, name="/eventos")
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            self.eventos_conhecidos = [e for e in items if e.get("ativo", True)]
            if self.eventos_conhecidos:
                global KNOWN_EVENT_IDS
                for e in self.eventos_conhecidos:
                    if e["id"] not in KNOWN_EVENT_IDS:
                        KNOWN_EVENT_IDS.append(e["id"])

    @task(10)
    def listar_vitrine(self):
        """Consulta vitrine pública (exercita cache Redis e atualiza IDs de eventos)."""
        self._atualizar_catalogo()

    @task(6)
    def detalhe_evento(self):
        """Consulta detalhes de um evento aleatório (exercita cache-aside Redis distribuído)."""
        event_id = None
        if self.eventos_conhecidos:
            event_id = random.choice(self.eventos_conhecidos)["id"]
        elif KNOWN_EVENT_IDS:
            event_id = random.choice(KNOWN_EVENT_IDS)

        if event_id:
            self.client.get(f"/eventos/{event_id}", headers=self.headers, name="/eventos/[id]")
        else:
            self.listar_vitrine()

    @task(5)
    def comprar_ingresso(self):
        """Tenta comprar ingresso distribuindo entre todos os eventos com estoque.
        Evita comprar repetidamente do mesmo evento para não forçar erro 409 previsível."""
        # 1. Filtra eventos com estoque que o usuário ainda não comprou
        candidatos = [
            e["id"]
            for e in self.eventos_conhecidos
            if e.get("ingressos_disponiveis", 0) > 0 and e["id"] not in self.eventos_comprados
        ]

        # 2. Se não souber o estoque atualizado, tenta qualquer evento ativo não comprado
        if not candidatos:
            candidatos = [
                e["id"] for e in self.eventos_conhecidos if e["id"] not in self.eventos_comprados
            ]

        # 3. Fallback para a lista global de eventos conhecidos
        if not candidatos and KNOWN_EVENT_IDS:
            candidatos = [eid for eid in KNOWN_EVENT_IDS if eid not in self.eventos_comprados]

        # 4. Se o usuário já comprou todos os eventos, pode tentar qualquer um
        if not candidatos:
            candidatos = [e["id"] for e in self.eventos_conhecidos] or KNOWN_EVENT_IDS

        if not candidatos:
            self.listar_vitrine()
            return

        evento_id = random.choice(candidatos)

        with self.client.post(
            f"/eventos/{evento_id}/ingressos",
            headers=self.headers,
            name="/eventos/[id]/ingressos (compra)",
            catch_response=True,
        ) as response:
            if response.status_code == 201:
                self.eventos_comprados.add(evento_id)
                try:
                    ing_data = response.json()
                    self.ingressos_ids.append(ing_data["id"])
                except Exception:
                    pass
                response.success()
            elif response.status_code == 409:
                # Regra de negócio esperada sob alta concorrência (ESGOTADO ou JA_POSSUI_INGRESSO)
                self.eventos_comprados.add(evento_id)
                response.success()
            elif response.status_code == 404:
                # Evento desativado ou não encontrado
                response.success()
            else:
                response.failure(f"Status inesperado na compra: {response.status_code}")

    @task(3)
    def meus_ingressos(self):
        """Lista os ingressos do usuário logado (exercita joins e consultas no RDS)."""
        self.client.get("/ingressos", headers=self.headers, name="/ingressos")

    @task(2)
    def baixar_ingresso(self):
        """Se o usuário adquiriu ingressos, solicita URL presigned de download (exercita S3 e worker)."""
        if not self.ingressos_ids:
            return

        ingresso_id = random.choice(self.ingressos_ids)
        with self.client.get(
            f"/ingressos/{ingresso_id}/download",
            headers=self.headers,
            name="/ingressos/[id]/download",
            catch_response=True,
        ) as response:
            # 200 = PDF pronto no S3, 409 = worker ainda processando na fila
            if response.status_code in (200, 409):
                response.success()
            else:
                response.failure(f"Status inesperado no download: {response.status_code}")

    @task(1)
    def health_check(self):
        """Liveness check do Load Balancer."""
        self.client.get("/health", name="/health")


# Perfil automatizado de carga para disparar o Auto Scaling (>70% CPU por >1 min).
#
# DICA: No Locust, se uma classe LoadTestShape estiver ativa no código, a interface Web
# desativa a edição dos campos "Number of users" e "Spawn rate" (pois o script assume o controle).
#
# - Para usar a Interface Web preenchendo 250 usuários e 25 spawn rate:
#     uv run locust -f tests/load/locustfile.py --host "$ALB_URL"
#
# - Para rodar o shape automatizado via terminal (headless):
#     USE_AUTO_SCALING_SHAPE=1 uv run locust -f tests/load/locustfile.py --host "$ALB_URL" --headless

if os.getenv("USE_AUTO_SCALING_SHAPE", "0").lower() in ("1", "true"):
    class AutoScalingShape(LoadTestShape):
        """Shape com perfil calibrado para elevar a CPU da t3.micro acima de 70% por > 1 minuto
        e disparar o scale out de 1 para 2 instâncias no ASG.
        """

        etapas = [
            # (tempo_acumulado_segundos, usuarios, taxa_spawn)
            (30, 50, 10),    # Aquecimento inicial (0 a 30s)
            (360, 250, 25),  # Carga de pico contínua: 250 usuários mantendo CPU > 70% por vários minutos
            (540, 0, 25),    # Redução da carga para observar estabilização / scale in
        ]

        def tick(self):
            run_time = self.get_run_time()
            for fim_tempo, usuarios, taxa in self.etapas:
                if run_time < fim_tempo:
                    return (usuarios, taxa)
            return None
