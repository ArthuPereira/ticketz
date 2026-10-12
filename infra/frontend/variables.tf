variable "aws_region" {
  description = "Região usada pelo bucket S3. O CloudFront é um serviço global."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Ambiente identificado nas tags dos recursos."
  type        = string
  default     = "production"
}

variable "frontend_bucket_name" {
  description = "Nome globalmente único do bucket privado que receberá frontend/dist."
  type        = string

  validation {
    condition = (
      length(var.frontend_bucket_name) >= 3 &&
      length(var.frontend_bucket_name) <= 63 &&
      can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.frontend_bucket_name))
    )
    error_message = "Use um nome S3 de 3 a 63 caracteres, com letras minúsculas, números, pontos ou hífens."
  }
}

variable "price_class" {
  description = "Classe de preço do CloudFront. PriceClass_100 reduz o custo da demonstração."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition = contains(
      ["PriceClass_100", "PriceClass_200", "PriceClass_All"],
      var.price_class,
    )
    error_message = "A classe deve ser PriceClass_100, PriceClass_200 ou PriceClass_All."
  }
}

variable "project" {
  description = "Nome do projeto usado em recursos e tags."
  type        = string
  default     = "ticketz"
}

variable "extra_tags" {
  description = "Tags adicionais aplicadas aos recursos compatíveis."
  type        = map(string)
  default     = {}
}
