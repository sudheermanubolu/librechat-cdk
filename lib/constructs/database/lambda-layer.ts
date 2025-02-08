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
      description: 'Lambda layer containing pymongo and psycopg2 packages',
      code: lambda.Code.fromAsset('src/lambda-layers/database-layer', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output/python && ' +
            'cp requirements.txt /asset-output/'
          ],
        },
      }),
    });
  }
}
