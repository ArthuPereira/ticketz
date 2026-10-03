# Log das ações de CRUD. Cada item guarda:
#   entidade (PK: evento#12), sk (SK: 2026-10-03...#uuid), acao, usuario_id, dados, timestamp
resource "aws_dynamodb_table" "action_logs" {
  name         = "${var.project}-action-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "entidade"
  range_key    = "sk"

  attribute {
    name = "entidade"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}

