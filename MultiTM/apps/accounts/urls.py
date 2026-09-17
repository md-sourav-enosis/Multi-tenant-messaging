from django.urls import path
from apps.accounts.views import RegisterView, TestUserListView, UserProfileView, PublicTenantListView

urlpatterns = [
    path('users/test/', TestUserListView.as_view(), name='test-user-list'),
    path('me/', UserProfileView.as_view(), name='user-profile'),
    path('register/', RegisterView.as_view(), name='register'),
    path('tenants/', PublicTenantListView.as_view(), name='public-tenant-list'),
]