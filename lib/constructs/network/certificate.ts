import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CertificateProps {
  domainName: string;
}

export class Certificate extends Construct {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: CertificateProps) {
    super(scope, id);

    this.certificate = new acm.Certificate(this, 'SslCertificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(),
    });

    // Output DNS validation records for Cloudflare
    new cdk.CfnOutput(this, 'CertificateValidationRecords', {
      value: 'Check AWS Console ACM for DNS validation records to add to Cloudflare',
      description: 'DNS validation required - add CNAME records to Cloudflare',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM Certificate ARN',
    });
  }
}
