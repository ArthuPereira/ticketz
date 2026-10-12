locals {
  origin_id = "${var.project}-frontend-s3"
}

resource "aws_s3_bucket" "frontend" {
  bucket = var.frontend_bucket_name
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project}-frontend-oac"
  description                       = "Acesso privado do CloudFront ao frontend Ticketz"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "html" {
  name        = "${var.project}-frontend-html-no-cache"
  comment     = "Evita manter o index.html antigo entre publicações"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_cache_policy" "assets" {
  name        = "${var.project}-frontend-assets-immutable"
  comment     = "Cache longo para arquivos versionados pelo Vite"
  default_ttl = 31536000
  max_ttl     = 31536000
  min_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.project}-frontend-security-headers"
  comment = "Cabeçalhos de segurança do frontend Ticketz"

  security_headers_config {
    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
      preload                    = true
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "Frontend web do Ticketz"
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  price_class         = var.price_class
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
    origin_id                = local.origin_id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id            = aws_cloudfront_cache_policy.html.id
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
  }

  ordered_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cache_policy_id            = aws_cloudfront_cache_policy.assets.id
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    path_pattern               = "assets/*"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
  }

  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }

  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "frontend" {
  statement {
    sid = "AllowCloudFrontReadOnly"

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}
