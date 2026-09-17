from django.urls import re_path

from apps.chat.consumers import ConversationConsumer, InboxConsumer


websocket_urlpatterns = [
    re_path(r'^ws/chat/inbox/$', InboxConsumer.as_asgi()),
    re_path(r'^ws/chat/(?P<conversation_id>[0-9a-f-]+)/$', ConversationConsumer.as_asgi()),
]