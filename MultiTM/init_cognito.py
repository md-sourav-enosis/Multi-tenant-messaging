import boto3

# Connect to the local MiniStack container
client = boto3.client(
    "cognito-idp",
    endpoint_url="http://ministack:4566",
    region_name="us-east-1",
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

print("Creating Local User Pool...")
pool = client.create_user_pool(PoolName="local_dev_pool")
pool_id = pool["UserPool"]["Id"]

print("Creating App Client...")
app_client = client.create_user_pool_client(
    UserPoolId=pool_id,
    ClientName="django_local_client"
)
client_id = app_client["UserPoolClient"]["ClientId"]

print("\n=== SUCCESS ===")
print("Copy these values into your .env file:")
print(f"COGNITO_USER_POOL={pool_id}")
print(f"COGNITO_AUDIENCE={client_id}")