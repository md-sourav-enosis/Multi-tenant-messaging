from django.core.cache import cache
from django.db import IntegrityError, models, transaction
from django.http import FileResponse
from django.shortcuts import render
from django.utils import timezone
import uuid
from celery.result import AsyncResult
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.chat.models import Conversation, ConversationParticipant, Message
from apps.chat.tasks import export_conversations


INBOX_CACHE_TIMEOUT = 45
EXPORT_TASK_CACHE_TIMEOUT = 24 * 60 * 60


def notify_inbox_updates(user_ids, conversation_id):
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    conversation = Conversation.objects.select_related(
        'participant_one__tenant', 'participant_two__tenant', 'last_message',
    ).prefetch_related('participants', 'messages').get(id=conversation_id)
    channel_layer = get_channel_layer()
    for user_id in user_ids:
        request = type('InboxRequest', (), {'user': User.objects.get(id=user_id)})()
        async_to_sync(channel_layer.group_send)(
            f'user_{user_id}',
            {
                'type': 'inbox.update',
                'conversation': ConversationSerializer(
                    conversation, context={'request': request}
                ).data,
            },
        )


def inbox_cache_key(user_id):
    return f'chat:inbox:{user_id}'


def invalidate_inbox(*user_ids):
    cache.delete_many([inbox_cache_key(user_id) for user_id in user_ids])


class UserSearchSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'display_name', 'email', 'tenant_name']

    def get_display_name(self, user):
        return user.get_full_name() or user.username


class ConversationSerializer(serializers.ModelSerializer):
    participants = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    starred = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'participants', 'last_message', 'unread_count', 'starred',
            'created_at', 'updated_at',
        ]

    def get_participants(self, conversation):
        users = [conversation.participant_one, conversation.participant_two]
        return UserSearchSerializer(users, many=True).data

    def get_last_message(self, conversation):
        message = conversation.last_message
        if not message:
            return None
        return {
            'id': str(message.id),
            'text': message.text,
            'sender_id': str(message.sender_id),
            'created_at': message.created_at.isoformat(),
        }

    def get_unread_count(self, conversation):
        user = self.context.get('request').user
        participant = next(
            (item for item in conversation.participants.all() if item.user_id == user.id),
            None,
        )
        if not participant:
            return 0
        return conversation.messages.filter(
            created_at__gt=participant.last_read_at,
        ).exclude(sender_id=user.id).count()

    def get_starred(self, conversation):
        user = self.context.get('request').user
        participant = next(
            (item for item in conversation.participants.all() if item.user_id == user.id),
            None,
        )
        return bool(participant and participant.is_starred)


class UserSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if len(query) < 2:
            return Response([])

        users = (
            User.objects.select_related('tenant')
            .filter(
                models.Q(first_name__icontains=query)
                | models.Q(last_name__icontains=query)
                | models.Q(username__icontains=query)
                | models.Q(email__icontains=query)
            )
            .exclude(pk=request.user.pk)
            .order_by('first_name', 'last_name', 'email')[:20]
        )
        return Response(UserSearchSerializer(users, many=True).data)


class ConversationCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        target_id = request.data.get('user_id')
        try:
            target = User.objects.select_related('tenant').get(pk=target_id)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response(
                {'detail': 'Selected user does not exist.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot start a conversation with yourself.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        first, second = sorted([request.user, target], key=lambda user: str(user.pk))
        try:
            with transaction.atomic():
                conversation, _ = Conversation.objects.get_or_create(
                    participant_one=first,
                    participant_two=second,
                )
                ConversationParticipant.objects.get_or_create(
                    conversation=conversation, user=first
                )
                ConversationParticipant.objects.get_or_create(
                    conversation=conversation, user=second
                )
                invalidate_inbox(first.id, second.id)
        except IntegrityError:
            conversation = Conversation.objects.get(
                participant_one=first, participant_two=second
            )

        return Response(ConversationSerializer(conversation, context={'request': request}).data)


class InboxView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cached = cache.get(inbox_cache_key(request.user.id))
        if cached is not None:
            return Response(cached)

        conversations = (
            Conversation.objects.filter(
                models.Q(participant_one=request.user)
                | models.Q(participant_two=request.user),
            )
            .select_related(
                'participant_one__tenant', 'participant_two__tenant', 'last_message',
            )
            .prefetch_related('participants', 'messages')
            .order_by('-updated_at')
        )
        data = ConversationSerializer(
            conversations, many=True, context={'request': request}
        ).data
        cache.set(
            inbox_cache_key(request.user.id), data, timeout=INBOX_CACHE_TIMEOUT
        )
        return Response(data)


class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_conversation(self, request, conversation_id):
        return Conversation.objects.filter(
            models.Q(participant_one=request.user)
            | models.Q(participant_two=request.user),
            id=conversation_id,
        ).select_related(
            'participant_one__tenant', 'participant_two__tenant', 'last_message'
        ).prefetch_related('participants', 'messages').first()

    def get(self, request, conversation_id):
        conversation = self.get_conversation(request, conversation_id)
        if not conversation:
            return Response({'detail': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ConversationSerializer(
            conversation, context={'request': request}
        ).data)


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'conversation', 'sender', 'sender_name', 'text', 'created_at', 'is_read']
        read_only_fields = ['id', 'conversation', 'sender', 'sender_name', 'created_at', 'is_read']

    def get_sender_name(self, message):
        return message.sender.get_full_name() or message.sender.username

    def get_is_read(self, message):
        request = self.context.get('request')
        if not request or message.sender_id == request.user.id:
            return True
        participant = ConversationParticipant.objects.filter(
            conversation=message.conversation, user=request.user
        ).first()
        return bool(participant and message.created_at <= participant.last_read_at)


class MessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get_conversation(self, request, conversation_id):
        return Conversation.objects.filter(
            models.Q(participant_one=request.user)
            | models.Q(participant_two=request.user),
            id=conversation_id,
        ).first()

    def get(self, request, conversation_id):
        conversation = self.get_conversation(request, conversation_id)
        if not conversation:
            return Response({'detail': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        messages = conversation.messages.select_related('sender').all()
        return Response(MessageSerializer(
            messages, many=True, context={'request': request}
        ).data)

    def post(self, request, conversation_id):
        conversation = self.get_conversation(request, conversation_id)
        if not conversation:
            return Response({'detail': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        text = str(request.data.get('text', '')).strip()
        if not text:
            return Response({'text': 'Message text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        message = Message.objects.create(
            conversation=conversation, sender=request.user, text=text
        )
        conversation.last_message = message
        conversation.save(update_fields=['last_message', 'updated_at'])
        participant_ids = list(
            conversation.participants.values_list('user_id', flat=True)
        )
        invalidate_inbox(*participant_ids)
        notify_inbox_updates(participant_ids, conversation.id)
        return Response(
            MessageSerializer(message, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class MarkConversationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id, user=request.user
        ).first()
        if not participant:
            return Response({'detail': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        participant.last_read_at = timezone.now()
        participant.save(update_fields=['last_read_at'])
        invalidate_inbox(request.user.id)
        notify_inbox_updates([request.user.id], conversation_id)
        return Response({'status': 'read'})


class SetConversationStarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id, starred):
        participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id, user=request.user
        ).first()
        if not participant:
            return Response(
                {'detail': 'You are not a participant in this conversation.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        participant.is_starred = starred
        participant.save(update_fields=['is_starred'])
        invalidate_inbox(request.user.id)
        notify_inbox_updates([request.user.id], conversation_id)
        return Response({
            'conversation_id': str(conversation_id),
            'starred': starred,
        })


class ConversationExportRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        export_id = str(uuid.uuid4())
        cache.set(
            f'chat:export:{export_id}',
            {'user_id': str(request.user.id)},
            timeout=EXPORT_TASK_CACHE_TIMEOUT,
        )
        export_conversations.apply_async(
            args=[str(request.user.id), export_id], task_id=export_id
        )
        return Response(
            {
                'task_id': export_id,
                'status_url': f'/api/chat/exports/{export_id}/',
                'download_url': f'/api/chat/exports/{export_id}/download/',
            },
            status=status.HTTP_202_ACCEPTED,
        )


class ConversationExportStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        metadata = cache.get(f'chat:export:{task_id}')
        if not metadata or metadata['user_id'] != str(request.user.id):
            return Response({'detail': 'Export not found.'}, status=status.HTTP_404_NOT_FOUND)

        result = AsyncResult(str(task_id))
        response = {'task_id': str(task_id), 'status': result.status}
        if result.successful():
            response['download_url'] = f'/api/chat/exports/{task_id}/download/'
        elif result.failed():
            response['detail'] = 'Export failed.'
        return Response(response)


class ConversationExportDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        metadata = cache.get(f'chat:export:{task_id}')
        if not metadata or metadata['user_id'] != str(request.user.id):
            return Response({'detail': 'Export not found.'}, status=status.HTTP_404_NOT_FOUND)

        result = AsyncResult(str(task_id))
        if not result.successful():
            return Response(
                {'detail': 'Export is not ready.'}, status=status.HTTP_409_CONFLICT
            )

        export_path = result.get(propagate=False)
        if not export_path:
            return Response({'detail': 'Export file is unavailable.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            response = FileResponse(
                open(export_path, 'rb'), content_type='application/json'
            )
        except FileNotFoundError:
            return Response({'detail': 'Export file is unavailable.'}, status=status.HTTP_404_NOT_FOUND)
        response['Content-Disposition'] = 'attachment; filename="conversations.json"'
        return response


def index(request):
    return render(request, 'index.html')
