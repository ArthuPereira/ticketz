resource "aws_s3_bucket" "files" {
  bucket        = "${var.project}-files-local"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
