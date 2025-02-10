import json
import os
import boto3
import psycopg2
from datetime import datetime

def handler(event, context):
    try:
        print("Starting PostgreSQL initialization...")
        
        # Initialize AWS clients
        secrets_client = boto3.client('secretsmanager')
        
        # Get PostgreSQL credentials from Secrets Manager
        secret = secrets_client.get_secret_value(
            SecretId=os.environ['POSTGRES_SECRET_ARN']
        )
        db_creds = json.loads(secret['SecretString'])
        print("Retrieved credentials for database")

        # get rag user creds from secrets manager
        rag_secret = secrets_client.get_secret_value(
            SecretId=os.environ['BEDROCK_USER_SECRET_ARN']
        )
        rag_creds = json.loads(rag_secret['SecretString'])
        print("Retrieved credentials for rag user")

        database_name = os.environ['DATABASE_NAME']

        # Connect to the database
        conn = psycopg2.connect(
            host=os.environ['POSTGRES_CLUSTER_ENDPOINT'],
            port=int(os.environ['POSTGRES_PORT']),
            database=database_name,
            user=db_creds['username'],
            password=db_creds['password']
        )
        conn.autocommit = True
        
        try:

            # Create database objects
            with conn.cursor() as cur:
                #Install pgvector extension (as master user)
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                print("Created pgvector extension")

                # Check if role exists before creating
                cur.execute("SELECT 1 FROM pg_roles WHERE rolname='rag'")
                role_exists = cur.fetchone() is not None

                if not role_exists:
                    # Create bedrock_user role
                    cur.execute("""
                        CREATE ROLE rag WITH  
                        CREATEDB  
                        LOGIN 
                        INHERIT
                        PASSWORD %s;
                    """, (rag_creds['POSTGRES_PASSWORD'],))
                    print("Created rag role")
                else:
                    print("Role 'rag' already exists")

                # Grant privileges
                cur.execute(f"GRANT rds_superuser TO rag;")
                print("Granted privileges to rag role")

        except psycopg2.Error as e:
            print(f"Database error: {str(e)}")
            raise e
            
        print('Successfully initialized PostgreSQL')
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'PostgreSQL initialization completed successfully'
            })
        }
        
    except Exception as e:
        print(f'Error initializing PostgreSQL: {str(e)}')
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }
    finally:
        if 'conn' in locals():
            conn.close()
            print("PostgreSQL connection closed")
