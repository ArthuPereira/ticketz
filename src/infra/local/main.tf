# Ambiente LOCAL (MiniStack). Aqui ficam só o Terraform e o provider.
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region     = var.aws_region
  access_key = "test"
  secret_key = "test"

  # O emulador não tem conta/credenciais reais: pula as validações da AWS.
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3          = var.aws_endpoint
    sqs         = var.aws_endpoint
    sns         = var.aws_endpoint
    dynamodb    = var.aws_endpoint
    rds         = var.aws_endpoint
    elasticache = var.aws_endpoint
    ec2         = var.aws_endpoint
    iam         = var.aws_endpoint
    sts         = var.aws_endpoint
  }
}
