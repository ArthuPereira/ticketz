# Desacoplamento: API publica no SNS -> SQS -> worker consome e processa o arquivo.
resource "aws_sns_topic" "file_uploaded" {
  name = "${var.project}-file-uploaded"
}

resource "aws_sqs_queue" "processing_dlq" {
  name = "${var.project}-file-processing-dlq"
}

resource "aws_sqs_queue" "processing" {
  name                       = "${var.project}-file-processing"
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.processing_dlq.arn
    maxReceiveCount     = 3
  })
}

# Permite o tópico SNS entregar mensagens na fila (necessário na AWS real).
resource "aws_sqs_queue_policy" "allow_sns" {
  queue_url = aws_sqs_queue.processing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.processing.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.file_uploaded.arn } }
    }]
  })
}

resource "aws_sns_topic_subscription" "processing" {
  topic_arn            = aws_sns_topic.file_uploaded.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.processing.arn
  raw_message_delivery = true
}
