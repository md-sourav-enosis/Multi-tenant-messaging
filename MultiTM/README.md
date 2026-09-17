# Multi-Tenant Messaging

This is the backend for a 1:1 chat app. Every user belongs to a tenant (Acme, Globex, etc.), but they can still message people in other tenants once they pick that person from search.

Conversations are always between two people. The same pair never gets a second thread. Star and unread counts are per user, so Alice starring a chat does not star it for Charlie.

Postgres is the source of truth. Redis caches the inbox for about 45 seconds and also runs Channels + Celery. Celery builds a JSON export of your conversations in the background.

This repo is the API only. The UI is a separate React app (CORS allows `http://localhost:5173`). All / unread / starred filters and inbox search happen in the client using the inbox payload.

Auth is JWT from MiniStack (local Cognito on port `4566`). Django does not have a `/login` endpoint. You get a token from MiniStack, then send it to the API.

## Setup

You only need Docker and Docker Compose. Config is in `.env` at the project root.

1. Start everything: First copy the .env.example and make a new file named .env & paste everything from .env.example. Then Enter your DB password and then run below command.

```bash
docker compose up -d
```

That brings up:

- `web` — API + websockets, `http://localhost:8000`
- `celery` — export worker
- `db` — Postgres on `localhost:5433`
- `redis` — `localhost:6379`
- `ministack` — Cognito on `localhost:4566`

2. Create the Cognito user pool and app client (this prints the ids you need):

```bash
docker compose exec web python manage.py setup_cognito
```

Copy **ACTIVE USER POOL ID** and **ACTIVE CLIENT ID** from the output into `.env`:

```
COGNITO_USER_POOL=<pool id>
COGNITO_AUDIENCE=<client id>
```

Restart the API so it picks up the new env:

```bash
docker compose restart web
```

3. Migrate, then seed sample tenants/users/chats:

```bash
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_db
```

`seed_db` deletes existing users, tenants, and messages first. Don’t run it on data you care about.

4. Sync those seeded users into Cognito and grab a token:

```bash
docker compose exec web python manage.py setup_cognito
```

It prints an access token for `alice@acme.com`. Use it on every authenticated request:

```
Authorization: Bearer <token>
```

WebSockets use the same token as `?token=<token>` on the URL. There is still no Django login — MiniStack issued that token.

## Project

`apps.accounts` is tenants, users, register, and JWT checks. `apps.chat` is inbox, messages, websockets, and export.

Send `Authorization: Bearer <token>` on HTTP. You only see conversations you are in. Starring another user’s row is blocked (403). User search never returns passwords or tokens.

### Seeded users

Password for all of them: `Password123!`

| Tenant | Name | Email |
| --- | --- | --- |
| Acme Corp | Alice Smith | `alice@acme.com` |
| Acme Corp | Bob Jones | `bob@acme.com` |
| Globex Corp | Charlie Brown | `charlie@globex.com` |
| Globex Corp | David Miller | `david@globex.com` |

Alice and Charlie already have a cross-tenant thread. Alice has it starred; Charlie does not.

### Endpoints

Base URL: `http://localhost:8000`

Protected routes need the Bearer token unless noted.

**`GET /api/accounts/tenants/`** (public)

List of orgs for the register dropdown.

```json
[{ "id": "...", "name": "Acme Corp" }]
```

**`POST /api/accounts/register/`** (public)

Creates the user in Cognito and Postgres.

Body: `email`, `password`, `first_name`, `last_name`, and either `tenant_mode: "join"` + `tenant_id`, or `tenant_mode: "create"` + `tenant_name`.

```json
{
  "message": "User registered successfully.",
  "user": {
    "id": "...",
    "username": "alice",
    "email": "alice@acme.com",
    "first_name": "Alice",
    "last_name": "Smith",
    "tenant": { "id": "...", "name": "Acme Corp" }
  }
}
```

**`GET /api/accounts/me/`**

The logged-in user, plus `is_superuser` and `tenant`.

**`GET /api/chat/users/?q=charlie`**

Search by name, username, or email (at least 2 characters). Cross-tenant is allowed. Empty list if the query is too short.

```json
[
  {
    "id": "...",
    "display_name": "Charlie Brown",
    "email": "charlie@globex.com",
    "tenant_name": "Globex Corp"
  }
]
```

**`POST /api/chat/conversations/`**

Body: `{ "user_id": "<uuid>" }`. Starts a 1:1 chat, or returns the existing one for that pair.

```json
{
  "id": "...",
  "participants": [
    { "id": "...", "display_name": "Alice Smith", "email": "alice@acme.com", "tenant_name": "Acme Corp" },
    { "id": "...", "display_name": "Charlie Brown", "email": "charlie@globex.com", "tenant_name": "Globex Corp" }
  ],
  "last_message": null,
  "unread_count": 0,
  "starred": false,
  "created_at": "...",
  "updated_at": "..."
}
```

`last_message` looks like `{ "id", "text", "sender_id", "created_at" }` once someone has written.

**`GET /api/chat/inbox/`**

Your conversations only, newest activity first. Same shape as above (array). Use `unread_count` and `starred` in the UI for filters.

**`GET /api/chat/conversations/<id>/`**

One conversation, same object as create. 404 if you are not a participant.

**`GET /api/chat/conversations/<id>/messages/`**

```json
[
  {
    "id": "...",
    "conversation": "...",
    "sender": "...",
    "sender_name": "Alice Smith",
    "text": "Hello Charlie!",
    "created_at": "...",
    "is_read": true
  }
]
```

**`POST /api/chat/conversations/<id>/messages/`**

Body: `{ "text": "hello" }`. Returns that message object (201). 404 if you are not in the chat.

**`POST /api/chat/conversations/<id>/read/`**

`{ "status": "read" }`

**`POST /api/chat/conversations/<id>/star/`** and **`.../unstar/`**

```json
{ "conversation_id": "...", "starred": true }
```

403 if you are not a participant.

**`POST /api/chat/exports/`**

Queues a Celery job (202):

```json
{
  "task_id": "...",
  "status_url": "/api/chat/exports/<task_id>/",
  "download_url": "/api/chat/exports/<task_id>/download/"
}
```

**`GET /api/chat/exports/<task_id>/`**

`{ "task_id", "status" }`. When `SUCCESS`, it also includes `download_url`.

**`GET /api/chat/exports/<task_id>/download/`**

The JSON file (`conversations.json`) once the worker finishes. 409 if it is not ready yet.

## Testing

Unit tests (auth, inbox scoping, idempotent create, star/read):

```bash
docker compose exec web python manage.py test apps.chat
```

### Celery export

Watch the worker:

```bash
docker compose logs -f celery
```

Then, with a Bearer token:

1. `POST /api/chat/exports/`
2. Wait until logs show `export_conversations` succeeded, or poll `GET /api/chat/exports/<task_id>/` until `"status": "SUCCESS"`
3. `GET /api/chat/exports/<task_id>/download/`

The JSON files show up in the project `exports/` folder (for example `exports/<task_id>.json`). You can also download them from the API.

### WebSockets

Daphne serves these on the same port as the API:

- Inbox: `ws://localhost:8000/ws/chat/inbox/?token=<JWT>`
- Thread: `ws://localhost:8000/ws/chat/<conversation_id>/?token=<JWT>`

On the thread socket, send `{ "text": "hello" }`. You get `{ "type": "message", ... }`. The inbox socket gets `{ "type": "inbox_update" }`.

Easiest check: log in as Alice in one client and Charlie in another, open the same conversation, send a message. The other side should see it live, the inbox/unread should move, and a later HTTP refetch should not duplicate the message if the UI keys on message `id`.

Bad token or not a participant → the socket closes with code `4403`.
