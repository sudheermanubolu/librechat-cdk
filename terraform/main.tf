provider "aws" {
  region = var.aws_region
}

terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
  backend "s3" {
    # Configure your backend as needed
  }
}

# Network Module
module "vpc" {
  source = "./modules/network"
  # Variables will be defined in variables.tf
  environment = var.environment
  project     = var.project_name
}

# Database Modules
module "documentdb" {
  source = "./modules/database/documentdb"
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  environment = var.environment
  project     = var.project_name
}

module "postgres" {
  source = "./modules/database/postgres"
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  environment = var.environment
  project     = var.project_name
}

# Storage Modules
module "s3" {
  source = "./modules/storage/s3"
  environment = var.environment
  project     = var.project_name
}

module "efs" {
  source = "./modules/storage/efs"
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  environment = var.environment
  project     = var.project_name
}

# Compute Module
module "ecs_cluster" {
  source = "./modules/compute"
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  environment = var.environment
  project     = var.project_name
}

# Services
module "librechat" {
  source = "./modules/services/librechat"
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  environment = var.environment
  project     = var.project_name
}

module "meilisearch" {
  source = "./modules/services/meilisearch"
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  environment = var.environment
  project     = var.project_name
}