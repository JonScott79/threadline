# Threadline API Reference

## Base URL
```
http://localhost:3001/api
```

---

## Search Endpoints

### `GET /api/threadlines/:id/search`
Executes either simple deterministic search or AI contextual exchange search across message archives.

#### Query Parameters:
| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | String | Yes | Query text, natural language query, or keywords |
| `mode` | String | No | `"simple"` (default) or `"ai"` |
| `page` | Integer | No | Batch page index for AI search (default: 1) |
| `batchSize` | Integer | No | Candidate batch size for AI search (default: 10, max: 12) |
| `aiProvider` | String | No | `"ollama"` (default) or `"groq"` (requires key) |
| `day` | String | No | Day filter in format `YYYY-MM-DD` |
| `start` | Integer | No | Start timestamp (Unix milliseconds) |
| `end` | Integer | No | End timestamp (Unix milliseconds) |
| `conversations` | String | No | Comma-separated list of conversation IDs to isolate |

#### Headers:
| Header | Description |
|---|---|
| `x-user-uid` | Authenticated user ID (default: `local`) |
| `x-groq-api-key` | Groq Cloud API key (required when `aiProvider="groq"`) |

#### Response Structure (`mode="ai"`):
```json
{
  "status": "success",
  "mode": "ai",
  "query": "Find times she refused parenting time",
  "archiveCoverage": {
    "totalEligibleExchanges": 271,
    "evaluatedCount": 10,
    "remainingCount": 261,
    "batchIndex": 1,
    "batchSize": 10,
    "totalPages": 28,
    "hasMore": true,
    "isCompleteArchiveEvaluated": false
  },
  "aiDiagnostics": {
    "provider": "ollama",
    "model": "llama3:latest",
    "candidatesSubmitted": 10,
    "evaluationsReturned": 10,
    "elapsedMs": 14200,
    "fallback": null
  },
  "results": [
    {
      "id": "chk_89bcbaf58520046b",
      "type": "event_cluster",
      "conversationId": "conv_123",
      "conversationTitle": "Darcy Gilleo",
      "dateString": "Jan 9, 2025",
      "timeSpan": { "start": 1736438400000, "end": 1736442000000, "dateString": "Jan 9, 2025" },
      "finalCategory": "explicit_refusal",
      "aiClassification": {
        "outcomeCategory": "explicit_refusal",
        "confidence": 0.95,
        "explanation": "The counterparty refused transportation and parenting time.",
        "keyQuote": "No, you refused in court when we asked you"
      },
      "messages": [ ... ]
    }
  ]
}
```

---

## Other Core Endpoints

- `GET /api/threadlines` — List all threadlines and archives for the active user.
- `POST /api/import` — Universal file ingestion (XML, JSON, TXT, PDF, ZIP) with SHA-256 auditing.
- `GET /api/threadlines/:id/timeline` — Fetch swimlane timeline events and message clusters.
- `GET /api/threadlines/:id/participants` — Fetch participants, aliases, and identity links.
