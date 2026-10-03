# Desacoplamento: API publica no SNS -> SQS -> worker consome e processa o ingresso.
resource "aws_sns_topic" "compra" {
  name = "${var.project}-ticket-purchased"
}

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project}-ticket-processing-dlq"
  message_retention_seconds = 1209600 # 14 dias
}

resource "aws_sqs_queue" "fila" {
  name                       = "${var.project}-ticket-processing"
  visibility_timeout_seconds = 60
  receive_wait_time_seconds  = 20 # long polling por padrão

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

# Permite o tópico SNS entregar mensagens na fila (necessário na AWS real).
resource "aws_sqs_queue_policy" "permite_sns" {
  queue_url = aws_sqs_queue.fila.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.fila.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.compra.arn } }
    }]
  })
}

resource "aws_sns_topic_subscription" "fila" {
  topic_arn            = aws_sns_topic.compra.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.fila.arn
  raw_message_delivery = true
}
