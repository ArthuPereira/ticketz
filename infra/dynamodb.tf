# Log das ações de CRUD. Cada item guarda:
#   log_id (chave), action (CREATE/READ/UPDATE/DELETE), data (dados manipulados), timestamp
# Só a chave precisa ser declarada; os demais atributos são livres no DynamoDB.
resource "aws_dynamodb_table" "action_logs" {
  name         = "${var.project}-action-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "log_id"

  attribute {
    name = "log_id"
    type = "S"
  }
}
