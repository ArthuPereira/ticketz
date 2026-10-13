variable "aws_region" {
  description = "Região da AWS padrão no Academy"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Identificador do projeto"
  type        = string
  default     = "ticketz"
}

variable "ami_id" {
  description = "ID da Golden AMI criada previamente (ex: ami-xxxxxxxxxxxx)"
  type        = string
  default     = "ami-07f911e773c8a8485"
}

variable "ec2_instance_type" {
  description = "Tipo da instância EC2"
  type        = string
  default     = "t3.micro"
}

# --- Configurações do Auto Scaling Group ---
variable "asg_min_size" {
  description = "Quantidade mínima de instâncias no ASG"
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Quantidade máxima de instâncias no ASG"
  type        = number
  default     = 3
}

variable "asg_desired_capacity" {
  description = "Capacidade desejada inicial de instâncias no ASG (requisito a: 1 instância inicial)"
  type        = number
  default     = 1
}

# --- Banco de Dados Relacional (RDS PostgreSQL) ---
variable "db_name" {
  description = "Nome do banco de dados relacional"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "Usuário mestre do banco de dados"
  type        = string
  default     = "appuser"
}

variable "db_password" {
  description = "Senha mestre do banco de dados"
  type        = string
  sensitive   = true
  default     = "TicketzSecurePassword2026!"
}

# --- Autenticação & JWT ---
variable "jwt_secret_key" {
  description = "Segredo para geração de tokens JWT"
  type        = string
  sensitive   = true
  default     = "ticketz-super-secret-key-change-in-production-min-32-chars"
}
