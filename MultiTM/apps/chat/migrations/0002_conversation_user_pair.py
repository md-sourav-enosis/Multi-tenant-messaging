from django.db import migrations, models
import django.db.models.deletion


def populate_participant_columns(apps, schema_editor):
    Conversation = apps.get_model('chat', 'Conversation')
    for conversation in Conversation.objects.prefetch_related('participants').all():
        users = sorted(
            [participant.user_id for participant in conversation.participants.all()],
            key=str,
        )
        if len(users) != 2:
            raise RuntimeError(
                f'Conversation {conversation.pk} must have exactly two participants.'
            )
        conversation.participant_one_id = users[0]
        conversation.participant_two_id = users[1]
        conversation.save(update_fields=['participant_one', 'participant_two'])


class Migration(migrations.Migration):
    dependencies = [('chat', '0001_initial')]

    operations = [
        migrations.AddField(
            model_name='conversation',
            name='participant_one',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='conversations_as_one', to='accounts.user',
            ),
        ),
        migrations.AddField(
            model_name='conversation',
            name='participant_two',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='conversations_as_two', to='accounts.user',
            ),
        ),
        migrations.RunPython(populate_participant_columns, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='conversation', name='participant_one',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='conversations_as_one', to='accounts.user',
            ),
        ),
        migrations.AlterField(
            model_name='conversation', name='participant_two',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='conversations_as_two', to='accounts.user',
            ),
        ),
        migrations.AddConstraint(
            model_name='conversation',
            constraint=models.UniqueConstraint(
                fields=('participant_one', 'participant_two'),
                name='unique_conversation_user_pair',
            ),
        ),
        migrations.AddConstraint(
            model_name='conversation',
            constraint=models.CheckConstraint(
                condition=models.Q(participant_one__lt=models.F('participant_two')),
                name='conversation_participants_are_ordered',
            ),
        ),
    ]