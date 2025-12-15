import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface LibreChatDashboardProps {
  dashboardName: string;
  loadBalancer: elbv2.ApplicationLoadBalancer;
  targetGroup: elbv2.ApplicationTargetGroup;
  libreChatService: ecs.FargateService;
  meilisearchService: ecs.FargateService;
  ragApiService: ecs.FargateService;
  documentDbCluster: docdb.DatabaseCluster;
  postgresCluster: rds.DatabaseCluster;
  region: string;
}

export class LibreChatDashboard extends Construct {
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: LibreChatDashboardProps) {
    super(scope, id);

    // Create dashboard with 3-hour default period and auto-refresh
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: props.dashboardName,
      defaultInterval: cdk.Duration.hours(3),
      periodOverride: cloudwatch.PeriodOverride.AUTO,
    });

    // Get cluster name from LibreChat service
    const clusterName = props.libreChatService.cluster.clusterName;

    // ALB Metrics Section
    const albRequestCountMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'RequestCount',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        LoadBalancer: props.loadBalancer.loadBalancerFullName,
      },
    });

    const albTargetResponseTimeMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'TargetResponseTime',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        LoadBalancer: props.loadBalancer.loadBalancerFullName,
      },
    });

    const alb4xxErrorsMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_4XX_Count',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        LoadBalancer: props.loadBalancer.loadBalancerFullName,
      },
    });

    const alb5xxErrorsMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HTTPCode_Target_5XX_Count',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        LoadBalancer: props.loadBalancer.loadBalancerFullName,
      },
    });

    const albHealthyHostsMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'HealthyHostCount',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        TargetGroup: props.targetGroup.targetGroupFullName,
        LoadBalancer: props.loadBalancer.loadBalancerFullName,
      },
    });

    const albUnhealthyHostsMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApplicationELB',
      metricName: 'UnHealthyHostCount',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        TargetGroup: props.targetGroup.targetGroupFullName,
        LoadBalancer: props.loadBalancer.loadBalancerFullName,
      },
    });

    // ECS Service Metrics - LibreChat
    const libreChatCpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.libreChatService.serviceName,
        ClusterName: clusterName,
      },
    });

    const libreChatMemoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.libreChatService.serviceName,
        ClusterName: clusterName,
      },
    });

    const libreChatTaskCountMetric = new cloudwatch.Metric({
      namespace: 'ECS/ContainerInsights',
      metricName: 'RunningTaskCount',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.libreChatService.serviceName,
        ClusterName: clusterName,
      },
    });

    // ECS Service Metrics - Meilisearch
    const meilisearchCpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.meilisearchService.serviceName,
        ClusterName: clusterName,
      },
    });

    const meilisearchMemoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.meilisearchService.serviceName,
        ClusterName: clusterName,
      },
    });

    const meilisearchTaskCountMetric = new cloudwatch.Metric({
      namespace: 'ECS/ContainerInsights',
      metricName: 'RunningTaskCount',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.meilisearchService.serviceName,
        ClusterName: clusterName,
      },
    });

    // ECS Service Metrics - RAG API
    const ragApiCpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.ragApiService.serviceName,
        ClusterName: clusterName,
      },
    });

    const ragApiMemoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ECS',
      metricName: 'MemoryUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.ragApiService.serviceName,
        ClusterName: clusterName,
      },
    });

    const ragApiTaskCountMetric = new cloudwatch.Metric({
      namespace: 'ECS/ContainerInsights',
      metricName: 'RunningTaskCount',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        ServiceName: props.ragApiService.serviceName,
        ClusterName: clusterName,
      },
    });

    // DocumentDB Metrics
    const docDbCpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/DocDB',
      metricName: 'CPUUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        DBClusterIdentifier: props.documentDbCluster.clusterIdentifier,
      },
    });

    const docDbConnectionsMetric = new cloudwatch.Metric({
      namespace: 'AWS/DocDB',
      metricName: 'DatabaseConnections',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        DBClusterIdentifier: props.documentDbCluster.clusterIdentifier,
      },
    });

    const docDbReadThroughputMetric = new cloudwatch.Metric({
      namespace: 'AWS/DocDB',
      metricName: 'ReadThroughput',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        DBClusterIdentifier: props.documentDbCluster.clusterIdentifier,
      },
    });

    const docDbWriteThroughputMetric = new cloudwatch.Metric({
      namespace: 'AWS/DocDB',
      metricName: 'WriteThroughput',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        DBClusterIdentifier: props.documentDbCluster.clusterIdentifier,
      },
    });

    // Aurora PostgreSQL Metrics
    const postgresCpuMetric = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'CPUUtilization',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        DBClusterIdentifier: props.postgresCluster.clusterIdentifier,
      },
    });

    const postgresConnectionsMetric = new cloudwatch.Metric({
      namespace: 'AWS/RDS',
      metricName: 'DatabaseConnections',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        DBClusterIdentifier: props.postgresCluster.clusterIdentifier,
      },
    });

    // Add widgets to dashboard
    // Row 1: ALB Request Count and Response Time
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ALB Request Count',
        left: [albRequestCountMetric],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Target Response Time',
        left: [albTargetResponseTimeMetric],
        width: 12,
        height: 6,
      })
    );

    // Row 2: ALB Errors and Health
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'ALB HTTP Errors',
        left: [alb4xxErrorsMetric],
        right: [alb5xxErrorsMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: '4XX Errors',
        },
        rightYAxis: {
          label: '5XX Errors',
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'Target Health',
        left: [albHealthyHostsMetric, albUnhealthyHostsMetric],
        width: 12,
        height: 6,
      })
    );

    // Row 3: LibreChat ECS Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'LibreChat - CPU & Memory Utilization',
        left: [libreChatCpuMetric],
        right: [libreChatMemoryMetric],
        width: 16,
        height: 6,
        leftYAxis: {
          label: 'CPU %',
          max: 100,
        },
        rightYAxis: {
          label: 'Memory %',
          max: 100,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'LibreChat - Running Tasks',
        left: [libreChatTaskCountMetric],
        width: 8,
        height: 6,
      })
    );

    // Row 4: Meilisearch ECS Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Meilisearch - CPU & Memory Utilization',
        left: [meilisearchCpuMetric],
        right: [meilisearchMemoryMetric],
        width: 16,
        height: 6,
        leftYAxis: {
          label: 'CPU %',
          max: 100,
        },
        rightYAxis: {
          label: 'Memory %',
          max: 100,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'Meilisearch - Running Tasks',
        left: [meilisearchTaskCountMetric],
        width: 8,
        height: 6,
      })
    );

    // Row 5: RAG API ECS Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'RAG API - CPU & Memory Utilization',
        left: [ragApiCpuMetric],
        right: [ragApiMemoryMetric],
        width: 16,
        height: 6,
        leftYAxis: {
          label: 'CPU %',
          max: 100,
        },
        rightYAxis: {
          label: 'Memory %',
          max: 100,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'RAG API - Running Tasks',
        left: [ragApiTaskCountMetric],
        width: 8,
        height: 6,
      })
    );

    // Row 6: DocumentDB Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DocumentDB - CPU Utilization',
        left: [docDbCpuMetric],
        width: 8,
        height: 6,
        leftYAxis: {
          label: 'CPU %',
          max: 100,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'DocumentDB - Connections',
        left: [docDbConnectionsMetric],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'DocumentDB - Read/Write Throughput',
        left: [docDbReadThroughputMetric],
        right: [docDbWriteThroughputMetric],
        width: 8,
        height: 6,
        leftYAxis: {
          label: 'Read (bytes/sec)',
        },
        rightYAxis: {
          label: 'Write (bytes/sec)',
        },
      })
    );

    // Row 7: Aurora PostgreSQL Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Aurora PostgreSQL - CPU Utilization',
        left: [postgresCpuMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'CPU %',
          max: 100,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'Aurora PostgreSQL - Database Connections',
        left: [postgresConnectionsMetric],
        width: 12,
        height: 6,
      })
    );
  }
}
