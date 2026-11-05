provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Application = "AfroChop"
      Environment = "development"
      ManagedBy   = "Terraform"
      Purpose     = "public-seller-photos"
    }
  }
}

locals {
  name = "afrochop-photos-dev-${var.aws_account_id}-us-east-1"
}

resource "aws_s3_bucket" "photos" {
  bucket        = local.name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "photos" {
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "photos" {
  bucket = aws_s3_bucket.photos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket     = aws_s3_bucket.photos.id
  depends_on = [aws_s3_bucket_versioning.photos]

  rule {
    id     = "cleanup-incomplete-and-old-versions"
    status = "Enabled"
    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    expiration {
      expired_object_delete_marker = true
    }
  }
}

resource "aws_cloudfront_origin_access_control" "photos" {
  name                              = local.name
  description                       = "Signed access to private AfroChop development seller photos"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "photos" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "AfroChop development public seller photos"
  price_class         = "PriceClass_100"
  http_version        = "http2"
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.photos.bucket_regional_domain_name
    origin_id                = "seller-photos"
    origin_access_control_id = aws_cloudfront_origin_access_control.photos.id
    s3_origin_config {
      origin_access_identity = ""
    }
  }

  default_cache_behavior {
    target_origin_id       = "seller-photos"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
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

data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "AllowOnlyThisCloudFrontDistribution"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.photos.arn}/sellers/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.photos.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.photos.arn, "${aws_s3_bucket.photos.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "photos" {
  bucket     = aws_s3_bucket.photos.id
  policy     = data.aws_iam_policy_document.bucket.json
  depends_on = [aws_s3_bucket_public_access_block.photos]
}

data "aws_iam_policy_document" "uploader" {
  statement {
    sid       = "ManageSellerPhotoObjects"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.photos.arn}/sellers/*"]
  }
}

resource "aws_iam_policy" "uploader" {
  name        = "${local.name}-uploader"
  description = "API upload and deletion of development seller photos only"
  policy      = data.aws_iam_policy_document.uploader.json
}
