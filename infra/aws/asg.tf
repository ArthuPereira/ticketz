# Launch Template para as instâncias gerenciadas pelo ASG
resource "aws_launch_template" "app" {
  name_prefix   = "${var.project}-lt-"
  image_id      = var.ami_id
  instance_type = var.ec2_instance_type

  # Obrigatório no AWS Academy: usa o profile existente com permissões de Lab
  iam_instance_profile {
    name = "LabInstanceProfile"
  }

  # Monitoramento detalhado de 1 min essencial para o alarme de period=60s
  monitoring {
    enabled = true
  }

  vpc_security_group_ids = [aws_security_group.ec2.id]

  # User data codificado em base64 com as credenciais e endpoints dos recursos
  user_data = base64encode(templatefile("${path.module}/user_data.sh.tftpl", {
    aws_region     = var.aws_region
    db_host        = aws_db_instance.postgres.address
    db_name        = var.db_name
    db_user        = var.db_username
    db_password    = var.db_password
    cache_host     = aws_elasticache_cluster.redis.cache_nodes[0].address
    s3_bucket      = local.s3_bucket_name
    dynamodb_table = aws_dynamodb_table.action_logs.name
    sns_topic_arn  = aws_sns_topic.compra.arn
    sqs_queue_url  = aws_sqs_queue.fila.url
    jwt_secret_key = var.jwt_secret_key
  }))

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project}-asg-instance"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Auto Scaling Group (ASG) distribuindo instâncias nas subnets da Default VPC
resource "aws_autoscaling_group" "app" {
  name_prefix         = "${var.project}-asg-"
  vpc_zone_identifier = data.aws_subnets.asg.ids
  target_group_arns   = [aws_lb_target_group.api.arn]

  min_size         = var.asg_min_size
  max_size         = var.asg_max_size
  desired_capacity = var.asg_desired_capacity

  # O ASG substitui instâncias quando o Health Check do ALB (/health) falhar
  health_check_type         = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_db_instance.postgres,
    aws_elasticache_cluster.redis,
    aws_dynamodb_table.action_logs,
    aws_sns_topic.compra,
    aws_sqs_queue.fila,
    aws_lb_listener.http
  ]
}

# --- Políticas de Escala e Alarmes CloudWatch (Elasticidade Horizontal) ---

# Requisito (c): Scale Out (+1 instância se CPU média > 70% por mais de 1 minuto, até max 3)
resource "aws_autoscaling_policy" "scale_out" {
  name                   = "${var.project}-asg-scale-out-cpu-high"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 120
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "SimpleScaling"
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.project}-cpu-high-70"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 60 # 1 minuto (60 segundos)
  statistic           = "Average"
  threshold           = 70

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }

  alarm_description = "Dispara Scale Out (+1 instancia) se a media de CPU exceder 70% por mais de 1 minuto"
  alarm_actions     = [aws_autoscaling_policy.scale_out.arn]
}

# Requisito (d): Scale In (-1 instância se CPU média < 25% por mais de 1 minuto, até min 1)
resource "aws_autoscaling_policy" "scale_in" {
  name                   = "${var.project}-asg-scale-in-cpu-low"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 120
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "SimpleScaling"
}

resource "aws_cloudwatch_metric_alarm" "cpu_low" {
  alarm_name          = "${var.project}-cpu-low-25"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 60 # 1 minuto (60 segundos)
  statistic           = "Average"
  threshold           = 25

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.app.name
  }

  alarm_description = "Dispara Scale In (-1 instancia) se a media de CPU ficar abaixo de 25% por mais de 1 minuto"
  alarm_actions     = [aws_autoscaling_policy.scale_in.arn]
}

