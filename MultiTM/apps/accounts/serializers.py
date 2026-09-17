from rest_framework import serializers
from apps.accounts.models import Tenant, User
from django.contrib.auth import get_user_model

class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name']

class UserSerializer(serializers.ModelSerializer):
    # We nest the TenantSerializer so the frontend gets the full tenant object, not just an ID
    tenant = TenantSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'tenant']

class UserProfileSerializer(serializers.ModelSerializer):
    tenant = TenantSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_superuser', 'tenant']

class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)
    
    tenant_mode = serializers.ChoiceField(choices=['join', 'create'], required=True)
    tenant_id = serializers.UUIDField(required=False, allow_null=True)
    tenant_name = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate(self, attrs):
        mode = attrs.get('tenant_mode')
        tenant_id = attrs.get('tenant_id')
        tenant_name = attrs.get('tenant_name')

        if mode == 'join':
            if not tenant_id:
                raise serializers.ValidationError({"tenant_id": "Tenant ID is required when joining an existing organization."})
            if not Tenant.objects.filter(id=tenant_id).exists():
                raise serializers.ValidationError({"tenant_id": "Selected tenant does not exist."})

        elif mode == 'create':
            if not tenant_name or not tenant_name.strip():
                raise serializers.ValidationError({"tenant_name": "Tenant name is required when creating a new organization."})
            if Tenant.objects.filter(name__iexact=tenant_name.strip()).exists():
                raise serializers.ValidationError({"tenant_name": "An organization with this name already exists."})

        return attrs