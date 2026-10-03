variable "aws_endpoint" {
  description = "URL do emulador. Dentro do compose: http://ministack:4566"
  type        = string
  default     = "http://localhost:4566"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  description = "Prefixo usado nos nomes dos recursos"
  type        = string
  default     = "ticketz"
}

variable "db_name" {
  type    = string
  default = "appdb"
}

variable "db_username" {
  type    = string
  default = "appuser"
}

variable "db_password" {
  type      = string
  default   = "app_password_local"
  sensitive = true
}
