output "alb_dns_name" {
  description = "DNS público do Application Load Balancer"
  value       = aws_lb.api.dns_name
}

output "api_url" {
  description = "URL base da API através do Load Balancer (Porta 80)"
  value       = "http://${aws_lb.api.dns_name}"
}

output "swagger_docs_url" {
  description = "Documentação interativa Swagger via Load Balancer"
  value       = "http://${aws_lb.api.dns_name}/docs"
}

output "health_check_url" {
  description = "Endpoint de Health Check consumido pelo ALB"
  value       = "http://${aws_lb.api.dns_name}/health"
}

output "readiness_check_url" {
  description = "Endpoint de Readiness Check (validação de RDS, Redis e DynamoDB)"
  value       = "http://${aws_lb.api.dns_name}/health/ready"
}

output "asg_name" {
  description = "Nome do Auto Scaling Group gerado"
  value       = aws_autoscaling_group.app.name
}

output "target_group_arn" {
  description = "ARN do Target Group do Load Balancer"
  value       = aws_lb_target_group.api.arn
}

output "rds_endpoint" {
  description = "Endpoint de conexão do PostgreSQL"
  value       = aws_db_instance.postgres.endpoint
}

output "elasticache_endpoint" {
  description = "Endpoint do nó Redis"
  value       = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
}

output "s3_bucket_name" {
  description = "Bucket S3 de arquivos"
  value       = local.s3_bucket_name
}

output "sqs_queue_url" {
  description = "URL da fila SQS principal"
  value       = aws_sqs_queue.fila.url
}

output "sns_topic_arn" {
  description = "ARN do tópico SNS de compras"
  value       = aws_sns_topic.compra.arn
}
