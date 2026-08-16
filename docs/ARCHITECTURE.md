> [!NOTE]
> **Historical / Planning Document**
> This document reflects initial project planning and may not represent the current verified architecture.

# Architecture

## Design Principles

- One responsibility per module.
- Routes contain no business logic.
- Services orchestrate workflows.
- Parsers normalize data.
- Engines transform data.
- Models describe data.
- UI never communicates directly with storage.

## Import Pipeline

Upload

?

Detector

?

Parser

?

Conversation Builder

?

Import Service

?

Database

?

Timeline

?

Reports

?

AI

## Folder Responsibilities

api/
Receives requests.

services/
Business logic.

parsers/
Reads external file formats.

engines/
Transforms normalized data.

models/
Defines application objects.

database/
Persistence layer.

utilities/
Reusable helper functions.

