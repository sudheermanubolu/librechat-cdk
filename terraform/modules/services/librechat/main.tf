resource "aws_ecs_task_definition" "librechat" {
  family                   = "${var.project}-${var.environment}-librechat"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.cpu
  memory                  = var.memory
  execution_role_arn      = aws_iam_role.ecs_execution_role.arn
  task_role_arn          = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "librechat"
      image = var.container_image
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        # Add environment variables as needed
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.project}-${var.environment}-librechat"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "librechat" {
  name            = "${var.project}-${var.environment}-librechat"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.librechat.arn
  desired_count   = var.desired_count

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [aws_security_group.librechat.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.librechat.arn
    container_name   = "librechat"
    container_port   = 3000
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base             = 1
  }
}

# Add ALB, security groups, IAM roles, and other resources as needed