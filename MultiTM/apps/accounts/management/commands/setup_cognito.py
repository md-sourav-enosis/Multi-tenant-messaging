import boto3
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Seeds local Ministack Cognito with User Pool, Web Client, and synchronizes all PostgreSQL users."

    def handle(self, *args, **options):
        ministack_url = getattr(
            settings, "MINISTACK_URL", "http://ministack:4566"
        )
        region = getattr(settings, "COGNITO_AWS_REGION", "us-east-1")

        cognito = boto3.client(
            "cognito-idp",
            endpoint_url=ministack_url,
            region_name=region,
            aws_access_key_id="mock_key",
            aws_secret_access_key="mock_secret",
        )

        # 1. Fetch existing pool or create a new pool
        pools = cognito.list_user_pools(MaxResults=10).get("UserPools", [])
        if pools:
            pool_id = pools[0]["Id"]
            self.stdout.write(f"Using existing User Pool: {pool_id}")
        else:
            pool = cognito.create_user_pool(PoolName="MultiTenantUserPool")
            pool_id = pool["UserPool"]["Id"]
            self.stdout.write(
                self.style.SUCCESS(f"Created new User Pool: {pool_id}")
            )

        # 2. Fetch or create Client App
        clients = cognito.list_user_pool_clients(UserPoolId=pool_id).get(
            "UserPoolClients", []
        )
        if clients:
            client_id = clients[0]["ClientId"]
            self.stdout.write(f"Using Client App ID: {client_id}")
        else:
            client_app = cognito.create_user_pool_client(
                UserPoolId=pool_id,
                ClientName="WebClient",
                ExplicitAuthFlows=[
                    "ALLOW_USER_PASSWORD_AUTH",
                    "ALLOW_REFRESH_TOKEN_AUTH",
                    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
                ],
            )
            client_id = client_app["UserPoolClient"]["ClientId"]
            self.stdout.write(
                self.style.SUCCESS(f"Created Client App ID: {client_id}")
            )

        # 3. Synchronize all PostgreSQL users into Cognito
        db_users = User.objects.all()
        target_emails = (
            [u.email for u in db_users if u.email]
            if db_users.exists()
            else [
                "alice@acme.com",
                "bob@acme.com",
                "charlie@globex.com",
                "david@globex.com",
            ]
        )

        default_password = "Password123!"

        for email in target_emails:
            try:
                cognito.admin_create_user(
                    UserPoolId=pool_id,
                    Username=email,
                    UserAttributes=[
                        {"Name": "email", "Value": email},
                        {"Name": "email_verified", "Value": "true"},
                    ],
                    MessageAction="SUPPRESS",
                )
                self.stdout.write(
                    self.style.SUCCESS(f"Created user '{email}' in Cognito")
                )
            except Exception:
                self.stdout.write(
                    f"User '{email}' already exists in Cognito. Updating password..."
                )

            # Set permanent password to bypass FORCE_CHANGE_PASSWORD state
            cognito.admin_set_user_password(
                UserPoolId=pool_id,
                Username=email,
                Password=default_password,
                Permanent=True,
            )

        # 4. Generate a test token for Alice for Postman debugging
        alice_email = "alice@acme.com"
        try:
            response = cognito.initiate_auth(
                ClientId=client_id,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": alice_email,
                    "PASSWORD": default_password,
                },
            )
            token = response["AuthenticationResult"]["AccessToken"]

            self.stdout.write("\n" + "=" * 70)
            self.stdout.write(
                self.style.SUCCESS(f"ACTIVE USER POOL ID: {pool_id}")
            )
            self.stdout.write(
                self.style.SUCCESS(f"ACTIVE CLIENT ID: {client_id}")
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"COGNITO JWT ACCESS TOKEN FOR {alice_email}:"
                )
            )
            self.stdout.write(token)
            self.stdout.write("=" * 70 + "\n")
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(
                    f"Could not generate Postman token for {alice_email}: {e}"
                )
            )