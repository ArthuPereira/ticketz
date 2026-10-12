output "cloudfront_distribution_id" {
  description = "Identificador usado para invalidar o cache após cada publicação."
  value       = aws_cloudfront_distribution.frontend.id
}

output "frontend_bucket_name" {
  description = "Bucket privado que recebe os arquivos de frontend/dist."
  value       = aws_s3_bucket.frontend.id
}

output "frontend_url" {
  description = "URL HTTPS pública do frontend."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}
