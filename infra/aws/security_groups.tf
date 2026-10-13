# Security Group do Application Load Balancer (ALB)
resource "aws_security_group" "alb" {
  name        = "${var.project}-alb-sg"
  description = "Acesso publico HTTP ao Load Balancer"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP publico"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Encaminha trafego para as instancias do ASG"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-alb-sg"
  }
}

# Security Group das Instâncias EC2 (gerenciadas pelo Auto Scaling Group)
resource "aws_security_group" "ec2" {
  name        = "${var.project}-ec2-sg"
  description = "Controle de acesso para as instancias da aplicacao Ticketz"
  vpc_id      = data.aws_vpc.default.id

  # Porta HTTP do FastAPI (permitida EXCLUSIVAMENTE a partir do ALB)
  ingress {
    description     = "FastAPI inbound apenas do ALB"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Porta SSH (para manutencao ou depuracao)
  ingress {
    description = "SSH inbound"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Saida irrestrita (SQS, SNS, S3, DynamoDB, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-ec2-sg"
  }
}

# Security Group do RDS PostgreSQL (permite apenas conexões originadas na EC2)
resource "aws_security_group" "rds" {
  name        = "${var.project}-rds-sg"
  description = "Permite acesso ao PostgreSQL apenas a partir das instancias EC2"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "PostgreSQL inbound from EC2"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-rds-sg"
  }
}

# Security Group do ElastiCache Redis (permite apenas conexões originadas na EC2)
resource "aws_security_group" "elasticache" {
  name        = "${var.project}-elasticache-sg"
  description = "Permite acesso ao Redis apenas a partir das instancias EC2"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Redis inbound from EC2"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-elasticache-sg"
  }
}
