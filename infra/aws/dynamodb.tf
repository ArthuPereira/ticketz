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

  tags = {
    Name = "${var.project}-action-logs"
  }
}

