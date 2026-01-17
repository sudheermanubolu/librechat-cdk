import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface EcrRepositoriesProps {
  removalPolicy?: cdk.RemovalPolicy;
}

export class EcrRepositories extends Construct {
  public readonly libreChatRepo: ecr.IRepository;
  public readonly meilisearchRepo: ecr.IRepository;
  public readonly ragApiRepo: ecr.IRepository;

  constructor(scope: Construct, id: string, props?: EcrRepositoriesProps) {
    super(scope, id);

    // Import existing ECR repositories (created manually)
    this.libreChatRepo = ecr.Repository.fromRepositoryName(
      this,
      'LibreChatRepo',
      'librechat/librechat'
    );

    this.meilisearchRepo = ecr.Repository.fromRepositoryName(
      this,
      'MeilisearchRepo',
      'librechat/meilisearch'
    );

    this.ragApiRepo = ecr.Repository.fromRepositoryName(
      this,
      'RagApiRepo',
      'librechat/rag-api'
    );

    // Outputs
    new cdk.CfnOutput(this, 'LibreChatRepoUri', {
      value: this.libreChatRepo.repositoryUri,
      description: 'LibreChat ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'MeilisearchRepoUri', {
      value: this.meilisearchRepo.repositoryUri,
      description: 'Meilisearch ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'RagApiRepoUri', {
      value: this.ragApiRepo.repositoryUri,
      description: 'RAG API ECR Repository URI',
    });
  }
}
