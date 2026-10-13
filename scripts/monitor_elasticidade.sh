#!/usr/bin/env bash
set -euo pipefail

ASG_NAME="${1:-ticketz-asg}"
TG_ARN="${2:-}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "================================================================="
echo " Monitor de Elasticidade em Tempo Real - Ticketz (AWS Academy)   "
echo " ASG: $ASG_NAME | Região: $REGION"
echo " Pressione Ctrl+C para encerrar."
echo "================================================================="

# Se o nome exato não for fornecido, busca o prefixo do ASG
REAL_ASG=$(aws autoscaling describe-auto-scaling-groups \
  --region "$REGION" \
  --query "AutoScalingGroups[?starts_with(AutoScalingGroupName, '$ASG_NAME')].AutoScalingGroupName | [0]" \
  --output text)

if [[ -z "$REAL_ASG" || "$REAL_ASG" == "None" ]]; then
  echo "Aviso: ASG iniciando com '$ASG_NAME' ainda não foi encontrado."
  REAL_ASG="$ASG_NAME"
fi

echo "Monitorando ASG: $REAL_ASG"
echo "Hora     | Desired | Atual | Healthy | Alarme High (70%) | Alarme Low (25%)"
echo "---------+---------+-------+---------+-------------------+-----------------"

while true; do
  TS=$(date +%H:%M:%S)
  
  # Consulta capacidade e instâncias do ASG
  ASG_DATA=$(aws autoscaling describe-auto-scaling-groups \
    --region "$REGION" \
    --auto-scaling-group-names "$REAL_ASG" \
    --query "AutoScalingGroups[0].[DesiredCapacity, length(Instances)]" \
    --output text 2>/dev/null || echo "- -")
  
  DESIRED=$(echo "$ASG_DATA" | awk '{print $1}')
  INSTANCES=$(echo "$ASG_DATA" | awk '{print $2}')
  
  # Consulta instâncias saudáveis no Target Group
  if [[ -n "$TG_ARN" ]]; then
    HEALTHY=$(aws elbv2 describe-target-health \
      --region "$REGION" \
      --target-group-arn "$TG_ARN" \
      --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" \
      --output text 2>/dev/null || echo "-")
  else
    HEALTHY="N/A"
  fi
  
  # Consulta status dos alarmes do CloudWatch
  ALARM_HIGH=$(aws cloudwatch describe-alarms \
    --region "$REGION" \
    --alarm-names "ticketz-cpu-high-70" \
    --query "MetricAlarms[0].StateValue" \
    --output text 2>/dev/null || echo "INSUFFICIENT_DATA")

  ALARM_LOW=$(aws cloudwatch describe-alarms \
    --region "$REGION" \
    --alarm-names "ticketz-cpu-low-25" \
    --query "MetricAlarms[0].StateValue" \
    --output text 2>/dev/null || echo "INSUFFICIENT_DATA")

  printf "%-8s | %-7s | %-5s | %-7s | %-17s | %-16s\n" \
    "$TS" "$DESIRED" "$INSTANCES" "$HEALTHY" "$ALARM_HIGH" "$ALARM_LOW"
  
  sleep 10
done
