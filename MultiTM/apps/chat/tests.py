from django.urls import reverse
from rest_framework.test import APITestCase

from apps.accounts.models import Tenant, User
from apps.chat.models import Conversation, ConversationParticipant, Message


class ConversationCreationTests(APITestCase):
	def setUp(self):
		self.acme = Tenant.objects.create(name='Acme')
		self.globex = Tenant.objects.create(name='Globex')
		self.alice = User.objects.create_user(
			username='alice', email='alice@acme.test', first_name='Alice',
			last_name='Smith', tenant=self.acme,
		)
		self.charlie = User.objects.create_user(
			username='charlie', email='charlie@globex.test', first_name='Charlie',
			last_name='Brown', tenant=self.globex,
		)
		self.client.force_authenticate(user=self.alice)

	def test_search_returns_cross_tenant_user_without_sensitive_fields(self):
		response = self.client.get(reverse('chat-user-search'), {'q': 'charlie'})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data[0]['tenant_name'], 'Globex')
		self.assertNotIn('password', response.data[0])

	def test_repeated_creation_returns_one_conversation(self):
		url = reverse('conversation-create')

		first_response = self.client.post(url, {'user_id': str(self.charlie.pk)}, format='json')
		second_response = self.client.post(url, {'user_id': str(self.charlie.pk)}, format='json')

		self.assertEqual(first_response.status_code, 200)
		self.assertEqual(second_response.status_code, 200)
		self.assertEqual(first_response.data['id'], second_response.data['id'])
		self.assertEqual(Conversation.objects.count(), 1)
		self.assertEqual(ConversationParticipant.objects.count(), 2)

	def test_user_cannot_start_conversation_with_self(self):
		response = self.client.post(
			reverse('conversation-create'),
			{'user_id': str(self.alice.pk)},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(Conversation.objects.count(), 0)

	def create_conversation(self):
		response = self.client.post(
			reverse('conversation-create'),
			{'user_id': str(self.charlie.pk)},
			format='json',
		)
		return response.data['id']

	def test_inbox_contains_only_conversations_for_current_user(self):
		conversation_id = self.create_conversation()

		response = self.client.get(reverse('chat-inbox'))

		self.assertEqual(response.status_code, 200)
		self.assertEqual([item['id'] for item in response.data], [conversation_id])

	def test_participant_can_send_and_mark_messages_read(self):
		conversation_id = self.create_conversation()
		message_response = self.client.post(
			reverse('conversation-messages', args=[conversation_id]),
			{'text': 'Hello Charlie'},
			format='json',
		)

		self.assertEqual(message_response.status_code, 201)
		self.assertEqual(Message.objects.count(), 1)
		self.assertTrue(message_response.data['is_read'])
		read_response = self.client.post(
			reverse('conversation-read', args=[conversation_id]),
		)
		self.assertEqual(read_response.status_code, 200)

	def test_non_participant_cannot_read_or_send_messages(self):
		conversation_id = self.create_conversation()
		outsider = User.objects.create_user(
			username='outsider', email='outsider@acme.test', tenant=self.acme,
		)
		self.client.force_authenticate(user=outsider)

		read_response = self.client.get(
			reverse('conversation-messages', args=[conversation_id]),
		)
		send_response = self.client.post(
			reverse('conversation-messages', args=[conversation_id]),
			{'text': 'Not allowed'}, format='json',
		)

		self.assertEqual(read_response.status_code, 404)
		self.assertEqual(send_response.status_code, 404)

	def test_star_is_persisted_per_participant(self):
		conversation_id = self.create_conversation()

		star_response = self.client.post(
			reverse('conversation-star', args=[conversation_id])
		)

		self.assertEqual(star_response.status_code, 200)
		self.assertEqual(star_response.data['starred'], True)
		inbox_response = self.client.get(reverse('chat-inbox'))
		self.assertEqual(inbox_response.data[0]['starred'], True)

		self.client.force_authenticate(user=self.charlie)
		other_inbox_response = self.client.get(reverse('chat-inbox'))
		self.assertEqual(other_inbox_response.data[0]['starred'], False)

	def test_unstar_clears_only_current_participant_state(self):
		conversation_id = self.create_conversation()
		self.client.post(reverse('conversation-star', args=[conversation_id]))

		unstar_response = self.client.post(
			reverse('conversation-unstar', args=[conversation_id])
		)

		self.assertEqual(unstar_response.status_code, 200)
		self.assertEqual(unstar_response.data['starred'], False)

	def test_non_participant_cannot_star_conversation(self):
		conversation_id = self.create_conversation()
		outsider = User.objects.create_user(
			username='outsider-star', email='outsider-star@acme.test', tenant=self.acme,
		)
		self.client.force_authenticate(user=outsider)

		response = self.client.post(
			reverse('conversation-star', args=[conversation_id])
		)

		self.assertEqual(response.status_code, 403)
