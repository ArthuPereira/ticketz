# Credenciais: No Learner Lab, abra "AWS Details" > "AWS CLI" 
# e exporte no terminal (elas expiram quando a sessão do lab acaba):
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
#   export AWS_SESSION_TOKEN=...

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  region  = "us-east-1"
  project = "cloudapp"
}

provider "aws" {
  region = local.region

  default_tags {
    tags = {
      Project   = local.project
      ManagedBy = "terraform"
    }
  }
}

# VPC e subnets padrão: serão usadas por RDS, ElastiCache e pelo ASG/ALB.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
