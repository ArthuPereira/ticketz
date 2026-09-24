resource "aws_elasticache_cluster" "cache" {
  cluster_id      = "${var.project}-cache"
  engine          = "redis"
  node_type       = "cache.t3.micro"
  num_cache_nodes = 1
  port            = 6379
}
