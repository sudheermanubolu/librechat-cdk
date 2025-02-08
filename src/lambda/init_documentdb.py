import json
import os
import boto3
from pymongo import MongoClient
import urllib.request
from datetime import datetime
import urllib.parse

def download_ca_certificate():
    ca_file_path = '/tmp/global-bundle.pem'
    url = 'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem'
    urllib.request.urlretrieve(url, ca_file_path)
    return ca_file_path

def serialize_mongodb_response(obj):
    """Convert MongoDB response objects to serializable format"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)

def handler(event, context):
    # Set MongoDB client options for faster initialization
    client_options = {
        'retryWrites': True,
        'connectTimeoutMS': 30000,
        'serverSelectionTimeoutMS': 30000,
        'maxPoolSize': 100,
        'minPoolSize': 10
    }
    
    try:
        print("Starting DocumentDB initialization...")
        
        # Download the CA certificate
        ca_file_path = download_ca_certificate()
        print(f"Downloaded CA certificate to: {ca_file_path}")
        
        # Initialize AWS clients
        secrets_client = boto3.client('secretsmanager')
        
        # Get DocDB credentials from Secrets Manager
        admin_secret = secrets_client.get_secret_value(
            SecretId=os.environ['DOCDB_SECRET_ARN']
        )
        admin_creds = json.loads(admin_secret['SecretString'])
        print("Retrieved admin credentials for cluster")
        
        # Get the LibreChat user secret
        librechat_secret = secrets_client.get_secret_value(
            SecretId=os.environ['LIBRECHAT_USER_SECRET_ARN']
        )
        app_creds = json.loads(librechat_secret['SecretString'])
        print("Retrieved app user credentials for cluster")
        
        # load DOCDB_CLUSTER_ENDPOINT env variable
        host = os.environ['DOCDB_CLUSTER_ENDPOINT']
        
        # URL encode admin username and password
        encoded_username = urllib.parse.quote_plus(admin_creds['username'])
        encoded_password = urllib.parse.quote_plus(admin_creds['password'])
        # Generate secure password for new user
        app_password = app_creds['password']
        encoded_app_password = urllib.parse.quote_plus(app_creds['password'])
        
        # Construct connection string using the correct format
        connection_string = (
            f"mongodb://{encoded_username}:{encoded_password}@"
            f"{host}:27017/"
            "?tls=true"
            "&tlsCAFile=/tmp/global-bundle.pem"
            "&replicaSet=rs0"
            "&readPreference=secondaryPreferred"
            "&retryWrites=false"
        )

        print(f"Attempting to connect to DocumentDB at {host}...")
        
        try:
            client = MongoClient(
                connection_string,
                tlsAllowInvalidCertificates=True,
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=10000,
            )
            
            # Test connection
            print("Testing connection with ping...")
            result = client.admin.command('ping')
            print("Ping successful:", json.dumps(result, default=serialize_mongodb_response))
            
        except Exception as conn_error:
            print(f"Connection error details: {str(conn_error)}")
            print(f"Connection string (without password): {connection_string.replace(encoded_password, '****')}")
            raise Exception(f"Failed to connect to DocumentDB: {str(conn_error)}")

        # Create LibreChat database
        print("Creating LibreChat database...")
        db = client.LibreChat

        # Check if user exists
        admin_db = client.admin
        user_exists = False
        try:
            user_list = admin_db.command('usersInfo')
            user_exists = any(user['user'] == 'librechat-dbuser' for user in user_list['users'])
            print("Checked user existence:", "exists" if user_exists else "does not exist")
        except Exception as e:
            print(f"Error checking user existence: {str(e)}")
            raise

        # Create user only if it doesn't exist
        if not user_exists:
            try:
                # Create user with readWrite role
                print("Creating database user 'librechat-dbuser'...")
                result = client.admin.command(
                    "createUser",
                    "librechat-dbuser",
                    pwd=app_password, 
                    roles=[
                        {"role": "readWrite", "db": "LibreChat"},
                        {"role": "read", "db": "admin"}
                    ]
                )
                print("Create user command result:", json.dumps(result, default=serialize_mongodb_response))

                # Store new user credentials in Secrets Manager
                print("Storing new credentials in Secrets Manager...")
                new_secret = {
                    'username': 'librechat-dbuser',
                    'password': app_password,
                    'host': host,
                    'port': 27017,
                    'dbname': 'LibreChat',
                    'MONGO_URI': (
                        f"mongodb://librechat-dbuser:{encoded_app_password}@"
                        f"{host}:27017/LibreChat"
                        "?authSource=admin"
                        "&authMechanism=SCRAM-SHA-1"
                        "&tls=true"
                        "&tlsCAFile=/app/librechat/config/global-bundle.pem"
                        "&replicaSet=rs0"
                        "&readPreference=secondaryPreferred"
                        "&retryWrites=false"
                    )
                }
                secrets_client.update_secret(
                    SecretId=os.environ['LIBRECHAT_USER_SECRET_ARN'],
                    SecretString=json.dumps(new_secret)
                )
                print("New credentials stored in Secrets Manager")
                client.close()
                print('Successfully initialized DocumentDB')
                
            except Exception as user_error:
                print(f"User creation error: {str(user_error)}")
                raise
        else:
            print("User 'librechat-dbuser' already exists, skipping creation")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'DocumentDB initialization completed successfully'
            })
        }
        
    except Exception as e:
        print(f'Error initializing DocumentDB: {str(e)}')
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }
    finally:
        if 'client' in locals():
            client.close()
            print("MongoDB connection closed")
