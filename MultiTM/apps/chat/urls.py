from django.urls import path

from apps.chat import views

urlpatterns = [
    path('', views.index, name='chat-index'),
    path('users/', views.UserSearchView.as_view(), name='chat-user-search'),
    path('conversations/', views.ConversationCreateView.as_view(), name='conversation-create'),
    path('inbox/', views.InboxView.as_view(), name='chat-inbox'),
    path('conversations/<uuid:conversation_id>/', views.ConversationDetailView.as_view(), name='conversation-detail'),
    path('conversations/<uuid:conversation_id>/messages/', views.MessageListCreateView.as_view(), name='conversation-messages'),
    path('conversations/<uuid:conversation_id>/read/', views.MarkConversationReadView.as_view(), name='conversation-read'),
    path('conversations/<uuid:conversation_id>/star/', views.SetConversationStarView.as_view(), {'starred': True}, name='conversation-star'),
    path('conversations/<uuid:conversation_id>/unstar/', views.SetConversationStarView.as_view(), {'starred': False}, name='conversation-unstar'),
    path('exports/', views.ConversationExportRequestView.as_view(), name='conversation-export-request'),
    path('exports/<uuid:task_id>/', views.ConversationExportStatusView.as_view(), name='conversation-export-status'),
    path('exports/<uuid:task_id>/download/', views.ConversationExportDownloadView.as_view(), name='conversation-export-download'),
]