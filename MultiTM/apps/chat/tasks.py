import json
import os
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.db import models

from apps.chat.models import Conversation


@shared_task
def export_conversations(user_id, export_id):
    conversations = Conversation.objects.filter(
        models.Q(participant_one_id=user_id) | models.Q(participant_two_id=user_id)
    ).prefetch_related(
        'participants__user', 'messages__sender'
    ).order_by('-updated_at')

    payload = []
    for conversation in conversations:
        participant = next(
            item for item in conversation.participants.all()
            if str(item.user_id) == str(user_id)
        )
        payload.append({
            'id': str(conversation.id),
            'starred': participant.is_starred,
            'created_at': conversation.created_at.isoformat(),
            'updated_at': conversation.updated_at.isoformat(),
            'participants': [
                {
                    'id': str(item.user_id),
                    'display_name': item.user.get_full_name() or item.user.username,
                }
                for item in conversation.participants.all()
            ],
            'messages': [
                {
                    'id': str(message.id),
                    'sender_id': str(message.sender_id),
                    'sender_name': message.sender.get_full_name() or message.sender.username,
                    'text': message.text,
                    'created_at': message.created_at.isoformat(),
                }
                for message in conversation.messages.all()
            ],
        })

    export_dir = Path(settings.BASE_DIR) / 'exports'
    export_dir.mkdir(parents=True, exist_ok=True)
    temporary_path = export_dir / f'{export_id}.tmp'
    export_path = export_dir / f'{export_id}.json'
    with temporary_path.open('w', encoding='utf-8') as file:
        json.dump({'user_id': str(user_id), 'conversations': payload}, file, indent=2)
    os.replace(temporary_path, export_path)
    return str(export_path)