# Subnet group associando subnets da Default VPC (cobrindo múltiplas AZs)
resource "aws_db_subnet_group" "ticketz" {
  name       = "${var.project}-db-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "${var.project}-db-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  identifier        = "${var.project}-postgres"
  engine            = "postgres"
  engine_version    = "15.13"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.ticketz.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  publicly_accessible = false
  skip_final_snapshot = true # Fundamental para permitir destruição sem erro no Academy

  tags = {
    Name = "${var.project}-postgres"
  }
}

