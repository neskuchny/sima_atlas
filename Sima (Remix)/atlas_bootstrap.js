window.SIMA_BOOTSTRAP = {
  "data": {
    "projects": [
      {
        "id": "atlas-live",
        "name": "Atlas Live Project",
        "created": "2026-04-30",
        "owner": "Cursor/Codex/Claude"
      }
    ]
  },
  "archByProject": {
    "atlas-live": {
      "blocks": [
        {
          "id": "b.ui-control",
          "title": "UI Control Plane",
          "status": "done",
          "owner": "atlas",
          "x": 120,
          "y": 120
        },
        {
          "id": "b.core-sync",
          "title": "Sync Engine",
          "status": "done",
          "owner": "atlas",
          "x": 340,
          "y": 120
        },
        {
          "id": "b.db",
          "title": "Atlas Database",
          "status": "wip",
          "owner": "atlas",
          "x": 560,
          "y": 120
        },
        {
          "id": "b.agent-orchestrator",
          "title": "Agent Orchestrator",
          "status": "done",
          "owner": "atlas",
          "x": 780,
          "y": 120
        },
        {
          "id": "b.docs",
          "title": "Docs Builder",
          "status": "wip",
          "owner": "atlas",
          "x": 120,
          "y": 280
        },
        {
          "id": "b.semantic-llm",
          "title": "Auto: b.semantic-llm",
          "status": "wip",
          "owner": "atlas",
          "x": 340,
          "y": 280
        },
        {
          "id": "b.realtime-ingestion",
          "title": "Auto: b.realtime-ingestion",
          "status": "wip",
          "owner": "atlas",
          "x": 560,
          "y": 280
        },
        {
          "id": "b.payments",
          "title": "Auto: b.payments",
          "status": "wip",
          "owner": "atlas",
          "x": 780,
          "y": 280
        },
        {
          "id": "b.crm",
          "title": "Auto: b.crm",
          "status": "wip",
          "owner": "atlas",
          "x": 120,
          "y": 440
        }
      ],
      "links": [
        {
          "from": "b.ui-control",
          "to": "b.core-sync",
          "type": "depends"
        },
        {
          "from": "b.ui-control",
          "to": "b.agent-orchestrator",
          "type": "depends"
        },
        {
          "from": "b.core-sync",
          "to": "b.db",
          "type": "depends"
        },
        {
          "from": "b.agent-orchestrator",
          "to": "b.db",
          "type": "depends"
        },
        {
          "from": "b.agent-orchestrator",
          "to": "b.core-sync",
          "type": "depends"
        }
      ]
    }
  }
};
