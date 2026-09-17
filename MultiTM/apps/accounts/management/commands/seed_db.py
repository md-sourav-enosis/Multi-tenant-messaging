from django.core.management.base import BaseCommand
from django.db import transaction
from apps.accounts.models import Tenant, User
from apps.chat.models import Conversation, ConversationParticipant, Message


class Command(BaseCommand):
    help = "Seeds the database with tenants, users, and initial cross-tenant conversations."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Clearing existing data..."))
        Message.objects.all().delete()
        ConversationParticipant.objects.all().delete()
        Conversation.objects.all().delete()
        User.objects.all().delete()
        Tenant.objects.all().delete()

        self.stdout.write(self.style.SUCCESS("Creating Tenants..."))
        acme = Tenant.objects.create(name="Acme Corp")
        globex = Tenant.objects.create(name="Globex Corp")

        self.stdout.write(self.style.SUCCESS("Creating Users..."))
        default_password = "Password123!"

        # Acme Corp Users
        alice = User.objects.create_user(
            username="alice",
            email="alice@acme.com",
            password=default_password,
            first_name="Alice",
            last_name="Smith",
            tenant=acme,
        )
        bob = User.objects.create_user(
            username="bob",
            email="bob@acme.com",
            password=default_password,
            first_name="Bob",
            last_name="Jones",
            tenant=acme,
        )

        # Globex Corp Users
        charlie = User.objects.create_user(
            username="charlie",
            email="charlie@globex.com",
            password=default_password,
            first_name="Charlie",
            last_name="Brown",
            tenant=globex,
        )
        david = User.objects.create_user(
            username="david",
            email="david@globex.com",
            password=default_password,
            first_name="David",
            last_name="Miller",
            tenant=globex,
        )

        self.stdout.write(
            self.style.SUCCESS("Creating Cross-Tenant Conversation...")
        )
        first, second = sorted([alice, charlie], key=lambda user: str(user.pk))
        conv = Conversation.objects.create(
            participant_one=first,
            participant_two=second,
        )

        ConversationParticipant.objects.create(
            conversation=conv, user=alice, is_starred=True
        )
        ConversationParticipant.objects.create(
            conversation=conv, user=charlie, is_starred=False
        )

        msg1 = Message.objects.create(
            conversation=conv,
            sender=alice,
            text="Hello Charlie! This is a cross-tenant message from Acme Corp.",
        )
        msg2 = Message.objects.create(
            conversation=conv,
            sender=charlie,
            text="Hi Alice! Message received loud and clear at Globex Corp.",
        )

        conv.last_message = msg2
        conv.save()

        self.stdout.write(self.style.SUCCESS("Database successfully seeded!"))
        self.stdout.write("Created Tenants: Acme Corp, Globex Corp")
        self.stdout.write(
            "Created Users: alice (Acme), bob (Acme), charlie (Globex), david (Globex)"
        )
        self.stdout.write(f"Default password for all users: {default_password}")