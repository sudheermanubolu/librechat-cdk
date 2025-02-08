resource "aws_docdb_cluster" "main" {
  cluster_identifier      = "${var.project}-${var.environment}"
  engine                 = "docdb"
  master_username        = var.master_username
  master_password        = var.master_password
  db_subnet_group_name   = aws_docdb_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.docdb.id]

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}

resource "aws_docdb_cluster_instance" "cluster_instances" {
  count              = var.instance_count
  identifier         = "${var.project}-${var.environment}-${count.index}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.instance_class
}

resource "aws_docdb_subnet_group" "main" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = var.subnet_ids

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}

# Add security group and other resources as needed