#!/usr/bin/env bash

set -euo pipefail

required_variables=(
  CLOUDFRONT_DISTRIBUTION_ID
  FRONTEND_BUCKET
  VITE_API_URL
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Defina ${variable_name} antes de publicar." >&2
    exit 1
  fi
done

if [[ "${VITE_API_URL}" != https://* ]]; then
  echo "VITE_API_URL deve usar HTTPS na publicação." >&2
  exit 1
fi

if [[ "${VITE_API_URL}" == *localhost* || "${VITE_API_URL}" == *127.0.0.1* ]]; then
  echo "VITE_API_URL não pode apontar para um endereço local." >&2
  exit 1
fi

for command_name in aws npm node; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "O comando ${command_name} não está disponível." >&2
    exit 1
  fi
done

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
frontend_directory="$(cd -- "${script_directory}/.." && pwd)"
cd "${frontend_directory}"

export VITE_SHOW_CACHE_DEBUG="${VITE_SHOW_CACHE_DEBUG:-false}"

aws sts get-caller-identity >/dev/null
npm run build:production

aws s3 sync \
  dist/assets \
  "s3://${FRONTEND_BUCKET}/assets" \
  --cache-control "public,max-age=31536000,immutable" \
  --delete

aws s3 sync \
  dist \
  "s3://${FRONTEND_BUCKET}" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --delete \
  --exclude "assets/*"

aws cloudfront create-invalidation \
  --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
  --paths "/*" \
  >/dev/null

echo "Frontend publicado. Aguarde a conclusão da invalidação do CloudFront."
