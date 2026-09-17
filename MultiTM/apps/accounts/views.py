import boto3
from django.conf import settings
from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework import status, generics
from rest_framework.throttling import ScopedRateThrottle
from apps.accounts.models import Tenant
from apps.accounts.serializers import TenantSerializer, RegisterSerializer, UserSerializer
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.serializers import UserProfileSerializer

User = get_user_model()

class TestUserListView(ListAPIView):
    # AllowAny means we don't need a token to test this endpoint
    permission_classes = [AllowAny]
    queryset = User.objects.select_related('tenant').all()
    serializer_class = UserSerializer

class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)

class PublicTenantListView(generics.ListAPIView):
    """Public endpoint to list existing tenants for registration dropdown."""
    queryset = Tenant.objects.all().order_by('name')
    serializer_class = TenantSerializer
    permission_classes = [AllowAny]

class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'register'

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email = data['email']
        password = data['password']
        first_name = data['first_name']
        last_name = data['last_name']
        mode = data['tenant_mode']

        ministack_url = getattr(settings, 'MINISTACK_URL', 'http://ministack:4566')
        region = getattr(settings, 'COGNITO_AWS_REGION', 'us-east-1')
        user_pool_id = getattr(settings, 'COGNITO_USER_POOL_ID', '')

        cognito = boto3.client(
            "cognito-idp",
            endpoint_url=ministack_url,
            region_name=region,
            aws_access_key_id="mock_key",
            aws_secret_access_key="mock_secret",
        )

        # 1. Provision user in Cognito first (External service)
        try:
            cognito.admin_create_user(
                UserPoolId=user_pool_id,
                Username=email,
                UserAttributes=[
                    {"Name": "email", "Value": email},
                    {"Name": "email_verified", "Value": "true"},
                ],
                MessageAction="SUPPRESS",
            )
            cognito.admin_set_user_password(
                UserPoolId=user_pool_id,
                Username=email,
                Password=password,
                Permanent=True,
            )
        except Exception as e:
            return Response(
                {"detail": f"Failed to provision user in authentication service: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # 2. Create PostgreSQL records atomically (Local DB)
        try:
            with transaction.atomic():
                if mode == 'create':
                    tenant = Tenant.objects.create(name=data['tenant_name'].strip())
                else:
                    tenant = Tenant.objects.get(id=data['tenant_id'])

                base_username = email.split('@')[0]
                username = base_username
                count = 1
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}{count}"
                    count += 1

                user = User.objects.create_user(
                    username=username,
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name,
                    tenant=tenant
                )
                user.set_unusable_password()
                user.save()
        except Exception as e:
            # Rollback Cognito if local DB creation fails
            cognito.admin_delete_user(UserPoolId=user_pool_id, Username=email)
            return Response(
                {"detail": f"Failed to create local database records: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {
                "message": "User registered successfully.",
                "user": UserSerializer(user).data
            },
            status=status.HTTP_201_CREATED
        )
