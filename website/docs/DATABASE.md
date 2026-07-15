# Database Design

## Users

Represents authenticated accounts.

## Cases

A workspace containing one investigation.

## Conversations

A collection of messages involving one or more participants.

## Messages

Normalized communication records.

## Attachments

Files associated with messages.

## Relationships

User

+-- Cases

Case

+-- Conversations

Conversation

+-- Messages

Message

+-- Attachments
