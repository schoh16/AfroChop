variable "aws_account_id" {
  description = "Only this AWS account may be used for development photo infrastructure."
  type        = string
  default     = "379959319067"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Use a 12-digit AWS account ID."
  }
}
