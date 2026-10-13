#!/bin/bash
set -euo pipefail

echo "=========================================================="
echo "  Setup da Golden AMI para o Ticketz (FastAPI + Worker)   "
echo "  Executado via SSH na instância EC2 temporária (Builder) "
echo "=========================================================="

echo "[1/6] Atualizando pacotes do sistema operacional..."
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip python3-venv git curl libpq-dev build-essential

echo "[2/6] Instalando uv (gerenciador rápido de dependências Python)..."
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

echo "[3/6] Preparando diretório da aplicação em /opt/ticketz..."
sudo mkdir -p /opt/ticketz
sudo chown -R ubuntu:ubuntu /opt/ticketz

# Detecta de onde copiar o código-fonte
if [ -d "/tmp/ticketz" ]; then
    echo "Copiando arquivos de /tmp/ticketz para /opt/ticketz..."
    cp -r /tmp/ticketz/* /opt/ticketz/
elif [ -d "$HOME/ticketz" ]; then
    echo "Copiando arquivos de $HOME/ticketz para /opt/ticketz..."
    cp -r $HOME/ticketz/* /opt/ticketz/
elif [ -f "./pyproject.toml" ]; then
    echo "Copiando arquivos do diretório atual ($PWD) para /opt/ticketz..."
    cp -r ./* /opt/ticketz/
else
    echo "ERRO: Código do Ticketz não encontrado em /tmp/ticketz, $HOME/ticketz ou diretório atual."
    echo "Envie os arquivos antes via: scp -i chave.pem -r . ubuntu@<IP>:/tmp/ticketz"
    exit 1
fi

if [ -d "/opt/ticketz/frontend/dist" ]; then
    echo "Frontend compilado (dist) detectado com sucesso em /opt/ticketz/frontend/dist"
else
    echo "AVISO: /opt/ticketz/frontend/dist não encontrado. Compile o frontend (npm run build) antes de empacotar para servi-lo pelo ALB."
fi

echo "[4/6] Configurando ambiente virtual Python e instalando dependências com uv..."
cd /opt/ticketz
$HOME/.local/bin/uv venv /opt/ticketz/.venv --python python3
/opt/ticketz/.venv/bin/pip install --upgrade pip
/opt/ticketz/.venv/bin/pip install -e .

echo "[5/6] Configurando unidades do Systemd (API e Worker)..."
sudo tee /etc/systemd/system/ticketz-api.service > /dev/null << 'EOF'
[Unit]
Description=Ticketz FastAPI Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/ticketz
EnvironmentFile=/opt/ticketz/.env
ExecStart=/opt/ticketz/.venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/ticketz-worker.service > /dev/null << 'EOF'
[Unit]
Description=Ticketz SQS Async Worker
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/ticketz
EnvironmentFile=/opt/ticketz/.env
ExecStart=/opt/ticketz/.venv/bin/python -m worker
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ticketz-api.service
sudo systemctl enable ticketz-worker.service

echo "[6/6] Limpeza de arquivos residuais, caches e histórico..."
sudo rm -rf /opt/ticketz/.env /opt/ticketz/.git /tmp/ticketz
rm -f ~/.bash_history
history -c || true

echo "=========================================================="
echo " Instalação concluída com sucesso!                        "
echo " A máquina está pronta para o snapshot da Golden AMI.     "
echo " No seu terminal local, execute:                          "
echo " aws ec2 create-image --instance-id <ID> ...              "
echo "=========================================================="
