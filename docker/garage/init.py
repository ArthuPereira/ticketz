import json
import os
import sys
import time
import urllib.error
import urllib.request

ADMIN_URL = os.environ.get("GARAGE_ADMIN_URL", "http://garage:3903")
ADMIN_TOKEN = os.environ.get("GARAGE_ADMIN_TOKEN", "ticketz-garage-admin-token")
ACCESS_KEY = os.environ.get("S3_ACCESS_KEY_ID", "GK0102030405060708090a0b0c")
SECRET_KEY = os.environ.get(
    "S3_SECRET_ACCESS_KEY",
    "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
)
BUCKET_NAME = os.environ.get("S3_BUCKET", "ticketz-files-local")


def api_request(method: str, path: str, body: dict | list | None = None):
    url = f"{ADMIN_URL.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} em {method} {path}: {err_body}") from e


def wait_for_garage(timeout_sec: int = 30) -> dict:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            return api_request("GET", "/v1/status")
        except Exception:
            time.sleep(1)
    raise RuntimeError("Timeout aguardando Garage Admin API responder.")


def main() -> None:
    print("Aguardando Garage Admin API...")
    status = wait_for_garage()
    node_id = status["node"]
    print(f"Garage online. Node ID: {node_id}")

    # 1. Configurar e aplicar layout se necessário
    layout = api_request("GET", "/v1/layout")
    if not layout.get("roles"):
        print("Atribuindo layout single-node (dc1, 1GB)...")
        api_request(
            "POST",
            "/v1/layout",
            [
                {
                    "id": node_id,
                    "zone": "dc1",
                    "capacity": 1073741824,
                    "tags": ["dev"],
                }
            ],
        )
        next_version = layout.get("version", 0) + 1
        api_request("POST", "/v1/layout/apply", {"version": next_version})
        print(f"Layout versão {next_version} aplicado.")
    else:
        print("Layout já configurado.")

    # 2. Importar chave S3 se não existir
    try:
        api_request("GET", f"/v1/key?id={ACCESS_KEY}")
        print(f"Chave de acesso {ACCESS_KEY} já existe.")
    except Exception:
        print(f"Importando chave de acesso {ACCESS_KEY}...")
        api_request(
            "POST",
            "/v1/key/import",
            {
                "accessKeyId": ACCESS_KEY,
                "secretAccessKey": SECRET_KEY,
                "name": "ticketz-key",
            },
        )

    # 3. Criar bucket se não existir
    bucket_id = None
    try:
        b_info = api_request("GET", f"/v1/bucket?globalAlias={BUCKET_NAME}")
        bucket_id = b_info["id"]
        print(f"Bucket '{BUCKET_NAME}' já existe (id={bucket_id}).")
    except Exception:
        print(f"Criando bucket '{BUCKET_NAME}'...")
        b_info = api_request("POST", "/v1/bucket", {"globalAlias": BUCKET_NAME})
        bucket_id = b_info["id"]

    # 4. Conceder permissões de leitura/escrita/owner para a chave no bucket
    print(f"Concedendo permissões no bucket '{BUCKET_NAME}' para {ACCESS_KEY}...")
    api_request(
        "POST",
        "/v1/bucket/allow",
        {
            "bucketId": bucket_id,
            "accessKeyId": ACCESS_KEY,
            "permissions": {"read": True, "write": True, "owner": True},
        },
    )
    print("Inicialização do Garage concluída com sucesso!")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Erro ao inicializar Garage: {exc}", file=sys.stderr)
        sys.exit(1)
