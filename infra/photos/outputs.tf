output "seller_photos_bucket" {
  description = "API SELLER_PHOTOS_BUCKET."
  value       = aws_s3_bucket.photos.id
}

output "seller_photos_region" {
  description = "API SELLER_PHOTOS_REGION."
  value       = "us-east-1"
}

output "seller_photos_public_url" {
  description = "API SELLER_PHOTOS_PUBLIC_URL. Photos under sellers/ are intentionally public."
  value       = "https://${aws_cloudfront_distribution.photos.domain_name}"
}

output "uploader_policy_arn" {
  description = "Attach to a dedicated API identity; this configuration creates no users or credentials."
  value       = aws_iam_policy.uploader.arn
}

output "cloudfront_distribution_id" {
  description = "Distribution for deployment checks and emergency cache invalidations."
  value       = aws_cloudfront_distribution.photos.id
}
