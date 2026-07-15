# Parser Specification

Every parser must return the same normalized objects.

Conversation

- id
- platform
- title
- participants
- messages

Message

- id
- conversationId
- platform
- sender
- recipient
- timestamp
- direction
- body
- attachments
- metadata

Parsers should never write to the database.

Their only job is converting external formats into Threadline models.
