import jwt
import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django_cognito_jwt import JSONWebTokenAuthentication
from django_cognito_jwt.validator import TokenValidator
from rest_framework import exceptions

User = get_user_model()

class LocalTokenValidator(TokenValidator):
    def validate(self, token):
        headers = jwt.get_unverified_header(token)
        kid = headers.get("kid")

        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        iss = unverified_payload.get("iss", "")
        pool_id = iss.rstrip("/").split("/")[-1]

        url = f"{settings.MINISTACK_URL}/{pool_id}/.well-known/jwks.json"
        try:
            res = requests.get(url, timeout=5)
            res.raise_for_status()
            jwks = res.json()
        except Exception as e:
            raise exceptions.AuthenticationFailed(f"Could not fetch JWKS from Ministack: {e}")

        key_data = next((k for k in jwks.get("keys", []) if k["kid"] == kid), None)
        if not key_data:
            raise exceptions.AuthenticationFailed("Matching public key not found in JWKS.")

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

        try:
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={
                    "verify_signature": True,
                    "verify_aud": False,
                    "verify_exp": True,
                },
            )
            return payload
        except jwt.PyJWTError as e:
            raise exceptions.AuthenticationFailed(f"JWT signature verification failed: {e}")


class CustomCognitoAuthentication(JSONWebTokenAuthentication):
    def get_token_validator(self, request):
        return LocalTokenValidator(
            settings.COGNITO_AWS_REGION,
            getattr(settings, "COGNITO_USER_POOL", "us-east-1_mockpool"),
            getattr(settings, "COGNITO_AUDIENCE", "mockclientid"),
        )

    def authenticate(self, request):
        jwt_token = self.get_jwt_token(request)
        if jwt_token is None:
            return None

        token_validator = self.get_token_validator(request)
        try:
            jwt_payload = token_validator.validate(jwt_token)
        except exceptions.AuthenticationFailed:
            raise
        except Exception as e:
            raise exceptions.AuthenticationFailed(str(e))

        user = self.get_user(jwt_payload)
        return (user, jwt_token)

    def get_user(self, jwt_payload):
        email = jwt_payload.get("email") or jwt_payload.get("username")

        if not email:
            raise exceptions.AuthenticationFailed("Invalid token payload: missing email.")

        try:
            user = User.objects.select_related("tenant").get(email=email)
            return user
        except User.DoesNotExist:
            raise exceptions.AuthenticationFailed(f"No database user found matching email: {email}")