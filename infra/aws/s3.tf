# No AWS Academy, o bucket S3 e suas regras de CORS e bloqueio público são
# gerenciados de forma compatível com as SCPs da organização (evitando a verificação
# automática de GetBucketObjectLockConfiguration do provider da AWS).
locals {
  s3_bucket_name = "ticketz-files-a2e0b36e"
}
