from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache

from apps.accounts.authentication import LocalTokenValidator
from apps.chat.models import Conversation, ConversationParticipant, Message

User = get_user_model()


class ConversationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.room_group_name = f'conversation_{self.conversation_id}'
        self.user = await self.authenticate_from_query_string()
        if not self.user or not await self.is_participant():
            await self.close(code=4403)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        text = str(content.get('text', '')).strip()
        if not text:
            await self.send_json({'type': 'error', 'detail': 'Message text is required.'})
            return
        message, inbox_updates = await self.create_message(text)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'chat.message', 'message': message},
        )
        for participant_id, conversation in inbox_updates.items():
            await self.channel_layer.group_send(
                f'user_{participant_id}',
                {'type': 'inbox.update', 'conversation': conversation},
            )

    async def chat_message(self, event):
        await self.send_json({'type': 'message', **event['message']})

    async def authenticate_from_query_string(self):
        query_string = parse_qs(self.scope.get('query_string', b'').decode())
        token = query_string.get('token', [None])[0]
        if not token:
            return None
        try:
            validator = LocalTokenValidator(
                settings.COGNITO_AWS_REGION,
                getattr(settings, 'COGNITO_USER_POOL', 'us-east-1_mockpool'),
                getattr(settings, 'COGNITO_AUDIENCE', 'mockclientid'),
            )
            payload = await database_sync_to_async(validator.validate)(token)
            email = payload.get('email') or payload.get('username')
            return await database_sync_to_async(
                lambda: User.objects.select_related('tenant').get(email=email)
            )()
        except Exception:
            return None

    @database_sync_to_async
    def is_participant(self):
        return ConversationParticipant.objects.filter(
            conversation_id=self.conversation_id, user=self.user
        ).exists()

    @database_sync_to_async
    def create_message(self, text):
        conversation = Conversation.objects.get(id=self.conversation_id)
        message = Message.objects.create(
            conversation=conversation, sender=self.user, text=text
        )
        conversation.last_message = message
        conversation.save(update_fields=['last_message', 'updated_at'])
        participants = list(conversation.participants.select_related('user'))
        cache.delete_many(
            [f'chat:inbox:{participant.user_id}' for participant in participants]
        )
        inbox_updates = {
            str(participant.user_id): {
                'id': str(conversation.id),
                'participants': [
                    {
                        'id': str(item.user_id),
                        'display_name': item.user.get_full_name() or item.user.username,
                    }
                    for item in participants
                ],
                'last_message': {
                    'id': str(message.id),
                    'text': message.text,
                    'sender_id': str(message.sender_id),
                    'created_at': message.created_at.isoformat(),
                },
                'unread_count': conversation.messages.filter(
                    created_at__gt=participant.last_read_at,
                ).exclude(sender_id=participant.user_id).count(),
                'created_at': conversation.created_at.isoformat(),
                'updated_at': conversation.updated_at.isoformat(),
            }
            for participant in participants
        }
        return {
            'id': str(message.id),
            'conversation_id': str(conversation.id),
            'sender_id': str(self.user.id),
            'sender_name': self.user.get_full_name() or self.user.username,
            'text': message.text,
            'created_at': message.created_at.isoformat(),
        }, inbox_updates


class InboxConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = await self.authenticate_from_query_string()
        if not self.user:
            await self.close(code=4403)
            return

        self.user_group_name = f'user_{self.user.id}'
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'user_group_name'):
            await self.channel_layer.group_discard(
                self.user_group_name, self.channel_name
            )

    async def inbox_update(self, event):
        await self.send_json({'type': 'inbox_update'})

    async def authenticate_from_query_string(self):
        query_string = parse_qs(self.scope.get('query_string', b'').decode())
        token = query_string.get('token', [None])[0]
        if not token:
            return None
        try:
            validator = LocalTokenValidator(
                settings.COGNITO_AWS_REGION,
                getattr(settings, 'COGNITO_USER_POOL', 'us-east-1_mockpool'),
                getattr(settings, 'COGNITO_AUDIENCE', 'mockclientid'),
            )
            payload = await database_sync_to_async(validator.validate)(token)
            email = payload.get('email') or payload.get('username')
            return await database_sync_to_async(
                lambda: User.objects.select_related('tenant').get(email=email)
            )()
        except Exception:
            return None