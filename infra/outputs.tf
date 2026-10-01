# valores para colocar no .env após o ´terraform output´

output "s3_bucket" {
  value = aws_s3_bucket.files.bucket
}

output "db_host" {
  value = aws_db_instance.main.address
}

output "db_port" {
  value = aws_db_instance.main.port
}

output "cache_host" {
  value = aws_elasticache_cluster.cache.cache_nodes[0].address
}

output "cache_port" {
  value = aws_elasticache_cluster.cache.cache_nodes[0].port
}

output "sns_topic_arn" {
  value = aws_sns_topic.file_uploaded.arn
}

output "sqs_queue_url" {
  value = aws_sqs_queue.processing.url
}

output "dynamodb_table" {
  value = aws_dynamodb_table.action_logs.name
}
