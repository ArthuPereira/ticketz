resource "aws_s3_bucket" "files" {
  bucket        = "${var.project}-files-local"
  force_destroy = true
}
