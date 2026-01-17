import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class DatabaseLayer extends Construct {
  public readonly layer: lambda.LayerVersion;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.layer = new lambda.LayerVersion(this, 'DatabaseLayer', {
      compatibleRuntimes: [
        lambda.Runtime.PYTHON_3_9,
        lambda.Runtime.PYTHON_3_10,
        lambda.Runtime.PYTHON_3_11
      ],
      compatibleArchitectures: [lambda.Architecture.X86_64], // Explicitly specify compatible architecture
      description: 'Lambda layer containing pymongo and psycopg2 packages (v2)',
      code: lambda.Code.fromAsset('src/lambda-layers/database-layer', {
        bundling: {
          image: cdk.DockerImage.fromRegistry('public.ecr.aws/sam/build-python3.9'),
          platform: 'linux/amd64', // Force x86_64 architecture
          command: [
            'bash', '-c',
            'pip install --no-cache-dir --platform manylinux2014_x86_64 --implementation cp --python-version 39 --only-binary=:all: -r requirements.txt -t /asset-output/python && ' +
            'cp requirements.txt /asset-output/'
          ],
          environment: {
            PIP_CACHE_DIR: '/tmp/pip-cache',
            PYTHONDONTWRITEBYTECODE: '1',
          },
        },
      }),
    });
  }
}
