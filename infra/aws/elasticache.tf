# Subnet group do ElastiCache
resource "aws_elasticache_subnet_group" "ticketz" {
  name       = "${var.project}-cache-subnet-group"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "${var.project}-cache-subnet-group"
  }
}

# Cluster Redis Standalone (Cluster Mode Disabled, 1 Nó)
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project}-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.1"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.ticketz.name
  security_group_ids = [aws_security_group.elasticache.id]

  tags = {
    Name = "${var.project}-redis"
  }
}

