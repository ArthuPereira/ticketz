# Usa a Default VPC pré-existente no Learner Lab (evita custos de NAT Gateway)
data "aws_vpc" "default" {
  default = true
}

# Obtém as subnets da Default VPC para RDS e ElastiCache
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Subnets compatíveis com instâncias EC2 t3.micro (us-east-1e não suporta t3.micro)
data "aws_subnets" "asg" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "availability-zone"
    values = ["us-east-1a", "us-east-1b", "us-east-1c", "us-east-1d", "us-east-1f"]
  }
}
