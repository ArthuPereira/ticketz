import uuid
from locust import HttpUser, LoadTestShape, between, events, task


class Comprador(HttpUser):
    wait_time = between(0.02, 0.08)

    def on_start(self):
        """Cadastra usuário único e obtém JWT no início da sessão."""
        unique_id = uuid.uuid4().hex[:8]
        self.email = f"load_{unique_id}@ticketz.com"
        self.senha = "senhaforte123"

        # 1. Cadastro
        reg_payload = {
            "nome": f"Load User {unique_id}",
            "email": self.email,
            "senha": self.senha,
            "papel": "user",
        }
        res_reg = self.client.post("/auth/register", json=reg_payload)
        if res_reg.status_code not in (201, 409):
            res_reg.failure(f"Falha ao registrar: {res_reg.status_code}")
            return

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
            self.headers = {}

    @task(10)
    def listar_vitrine(self):
        """Consulta vitrine pública (exercita cache Redis e banco)."""
        self.client.get("/eventos", headers=self.headers, name="/eventos")

    @task(5)
    def detalhe_evento(self):
        """Consulta detalhes do evento (exercita cache-aside Redis)."""
        self.client.get("/eventos/1", headers=self.headers, name="/eventos/[id]")

    @task(3)
    def comprar_ingresso(self):
        """Tenta comprar ingresso para o evento 1 (exercita transação RDS, lock e SNS)."""
        with self.client.post(
            "/eventos/1/ingressos",
            headers=self.headers,
            name="/eventos/[id]/ingressos (compra)",
            catch_response=True,
        ) as response:
            # 201 Created ou 409 (já possui ingresso / esgotado) são esperados sob carga
            if response.status_code in (201, 409):
                response.success()
            else:
                response.failure(f"Status inesperado na compra: {response.status_code}")

    @task(2)
    def meus_ingressos(self):
        """Lista os ingressos do usuário."""
        self.client.get("/ingressos", headers=self.headers, name="/ingressos")

    @task(1)
    def health_check(self):
        """Liveness check do Load Balancer."""
        self.client.get("/health", name="/health")


# NOTA: Quando uma classe LoadTestShape esta ativa no arquivo, o Locust desativa os
# campos de "Number of users" e "Spawn rate" na interface Web (pois assume controle programatico).
# Para permitir que voce preencha manualmente "250 usuarios" e "25 spawn rate" na interface Web
# (conforme descrito no ROTEIRO_GRAVACAO_PARTE2.md), mantemos a classe comentada abaixo.
#
# Caso queira rodar o teste de forma 100% automatizada via CLI/headless, basta descomentar a classe abaixo.
#
# class AutoScalingShape(LoadTestShape):
#     """Shape com perfil calibrado para elevar a CPU da t3.micro acima de 70% por > 1 minuto
#     e disparar o scale out de 1 para 2 instâncias no ASG.
#     """
# 
#     etapas = [
#         # (tempo_acumulado_segundos, usuarios, taxa_spawn)
#         (30, 50, 10),    # Aquecimento inicial (0 a 30s)
#         (360, 250, 25),  # Carga de pico contínua: 250 usuários mantendo CPU > 70% por vários minutos
#         (540, 0, 25),    # Redução da carga para observar estabilização / scale in
#     ]
# 
#     def tick(self):
#         run_time = self.get_run_time()
#         for fim_tempo, usuarios, taxa in self.etapas:
#             if run_time < fim_tempo:
#                 return (usuarios, taxa)
#         return None

