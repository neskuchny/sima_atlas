window.SIMA_BOOTSTRAP = {
  "data": {
    "projects": [
      {
        "id": "atlas-live",
        "name": "Atlas Live Project",
        "taskKind": "продукт",
        "taskTitle": "Живая схема из Atlas",
        "taskNote": "Блоки, статусы и зависимости берутся из /atlas",
        "created": "2026-05-01",
        "owner": "Cursor/Codex/Claude",
        "canvas": {
          "task": {
            "id": "t1",
            "x": 540,
            "y": 40,
            "w": 420,
            "h": 100,
            "title": "Atlas Live",
            "subtitle": "Схема продукта и статусы из graph.json"
          },
          "sources": [
            {
              "id": "b.ui-control",
              "type": "artifact",
              "x": 120,
              "y": 180,
              "w": 260,
              "h": 130,
              "source": "status: done",
              "title": "UI Control Plane",
              "meta": "b.ui-control",
              "take": "Ключевая цель блока и его значение для устранения рассинхрона.",
              "tags": [
                "#done",
                "#atlas"
              ]
            },
            {
              "id": "b.core-sync",
              "type": "artifact",
              "x": 360,
              "y": 180,
              "w": 260,
              "h": 130,
              "source": "status: done",
              "title": "Sync Engine",
              "meta": "b.core-sync",
              "take": "Ключевая цель блока и его значение для устранения рассинхрона.",
              "tags": [
                "#done",
                "#atlas"
              ]
            },
            {
              "id": "b.db",
              "type": "artifact",
              "x": 600,
              "y": 180,
              "w": 260,
              "h": 130,
              "source": "status: wip",
              "title": "Atlas Database",
              "meta": "b.db",
              "take": "Ключевая цель блока и его значение для устранения рассинхрона.",
              "tags": [
                "#wip",
                "#atlas"
              ]
            },
            {
              "id": "b.agent-orchestrator",
              "type": "artifact",
              "x": 840,
              "y": 180,
              "w": 260,
              "h": 130,
              "source": "status: done",
              "title": "Agent Orchestrator",
              "meta": "b.agent-orchestrator",
              "take": "Ключевая цель блока и его значение для устранения рассинхрона.",
              "tags": [
                "#done",
                "#atlas"
              ]
            },
            {
              "id": "b.docs",
              "type": "artifact",
              "x": 120,
              "y": 350,
              "w": 260,
              "h": 130,
              "source": "status: wip",
              "title": "Docs Builder",
              "meta": "b.docs",
              "take": "Генерирует wiki и ТЗ по блокам.",
              "tags": [
                "#wip",
                "#atlas"
              ]
            },
            {
              "id": "b.semantic-llm",
              "type": "artifact",
              "x": 360,
              "y": 350,
              "w": 260,
              "h": 130,
              "source": "status: wip",
              "title": "Auto: b.semantic-llm",
              "meta": "b.semantic-llm",
              "take": "Автосоздано из смыслов диалога.",
              "tags": [
                "#wip",
                "#atlas"
              ]
            },
            {
              "id": "b.realtime-ingestion",
              "type": "artifact",
              "x": 600,
              "y": 350,
              "w": 260,
              "h": 130,
              "source": "status: wip",
              "title": "Auto: b.realtime-ingestion",
              "meta": "b.realtime-ingestion",
              "take": "Автосоздано из смыслов диалога.",
              "tags": [
                "#wip",
                "#atlas"
              ]
            },
            {
              "id": "b.payments",
              "type": "artifact",
              "x": 840,
              "y": 350,
              "w": 260,
              "h": 130,
              "source": "status: wip",
              "title": "Auto: b.payments",
              "meta": "b.payments",
              "take": "Автосоздано из смыслов диалога.",
              "tags": [
                "#wip",
                "#atlas"
              ]
            },
            {
              "id": "b.crm",
              "type": "artifact",
              "x": 120,
              "y": 520,
              "w": 260,
              "h": 130,
              "source": "status: wip",
              "title": "Auto: b.crm",
              "meta": "b.crm",
              "take": "Автосоздано из смыслов диалога.",
              "tags": [
                "#wip",
                "#atlas"
              ]
            }
          ],
          "links": [
            {
              "id": "b.ui-control_b.core-sync_0",
              "from": "b.ui-control",
              "to": "b.core-sync",
              "label": "b.ui-control depends on b.core-sync",
              "direction": "to-task"
            },
            {
              "id": "b.ui-control_b.agent-orchestrator_1",
              "from": "b.ui-control",
              "to": "b.agent-orchestrator",
              "label": "b.ui-control depends on b.agent-orchestrator",
              "direction": "to-task"
            },
            {
              "id": "b.core-sync_b.db_0",
              "from": "b.core-sync",
              "to": "b.db",
              "label": "b.core-sync depends on b.db",
              "direction": "to-task"
            },
            {
              "id": "b.agent-orchestrator_b.db_0",
              "from": "b.agent-orchestrator",
              "to": "b.db",
              "label": "b.agent-orchestrator depends on b.db",
              "direction": "to-task"
            },
            {
              "id": "b.agent-orchestrator_b.core-sync_1",
              "from": "b.agent-orchestrator",
              "to": "b.core-sync",
              "label": "b.agent-orchestrator depends on b.core-sync",
              "direction": "to-task"
            }
          ]
        },
        "map": {
          "mission": {
            "id": "m.mission",
            "title": "Миссия",
            "value": "Единый контур разработки: чат -> atlas -> схема -> контекст-пак",
            "filled": true
          },
          "idea": {
            "id": "m.idea",
            "title": "Идея и фишка",
            "value": "Каждый блок имеет задачи/KPI/checks и отображается на живой схеме.",
            "filled": true
          },
          "goal": {
            "id": "m.goal",
            "title": "Just-to-be-done",
            "value": "Запуск одной команды обновляет схему, логи и документы.",
            "filled": true
          },
          "audience": {
            "id": "m.audience",
            "title": "Для кого",
            "value": "Solo founder / product+AI workflows",
            "filled": true
          },
          "value": {
            "id": "m.value",
            "title": "Что даст клиенту",
            "value": "Меньше токенов и меньше дрейфа за счёт context-first.",
            "filled": true
          },
          "important": {
            "id": "m.important",
            "title": "Важные элементы (must have)",
            "items": [
              {
                "label": "UI Control Plane (done)",
                "filled": true
              },
              {
                "label": "Sync Engine (done)",
                "filled": true
              },
              {
                "label": "Atlas Database (wip)",
                "filled": true
              },
              {
                "label": "Agent Orchestrator (done)",
                "filled": true
              },
              {
                "label": "Docs Builder (wip)",
                "filled": true
              },
              {
                "label": "Auto: b.semantic-llm (wip)",
                "filled": true
              }
            ]
          },
          "userstory": {
            "id": "m.us",
            "title": "User Story карта",
            "nodes": [
              {
                "id": "b.ui-control",
                "title": "UI Control Plane",
                "kind": "блок",
                "filled": true,
                "body": "Ключевая цель блока и его значение для устранения рассинхрона. · исать контракты вход/выход. · бавить checks.log по первичным тестам. · KPI-1: метрика готовности определена. · KPI-2: есть минимум одна автоматическая проверка.",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.core-sync",
                "title": "Sync Engine",
                "kind": "блок",
                "filled": true,
                "body": "Ключевая цель блока и его значение для устранения рассинхрона. · исать контракты вход/выход. · бавить checks.log по первичным тестам. · KPI-1: метрика готовности определена. · KPI-2: есть минимум одна автоматическая проверка.",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.db",
                "title": "Atlas Database",
                "kind": "блок",
                "filled": true,
                "body": "Ключевая цель блока и его значение для устранения рассинхрона. · исать контракты вход/выход. · бавить checks.log по первичным тестам. · KPI-1: метрика готовности определена. · KPI-2: есть минимум одна автоматическая проверка.",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.agent-orchestrator",
                "title": "Agent Orchestrator",
                "kind": "блок",
                "filled": true,
                "body": "Ключевая цель блока и его значение для устранения рассинхрона. · исать контракты вход/выход. · бавить checks.log по первичным тестам. · KPI-1: метрика готовности определена. · KPI-2: есть минимум одна автоматическая проверка.",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.docs",
                "title": "Docs Builder",
                "kind": "блок",
                "filled": true,
                "body": "Генерирует wiki и ТЗ по блокам. · ghtly smoke e2e task · KPI-1: wiki генерируется из atlas · KPI-2: auto_tz.md генерируется из atlas",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.semantic-llm",
                "title": "Auto: b.semantic-llm",
                "kind": "блок",
                "filled": true,
                "body": "Автосоздано из смыслов диалога. · mantic-refine: подтвердить автогенерацию из диалога · KPI-1: semantic extraction quality >= baseline",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.realtime-ingestion",
                "title": "Auto: b.realtime-ingestion",
                "kind": "блок",
                "filled": true,
                "body": "Автосоздано из смыслов диалога. · mantic-refine: подтвердить автогенерацию из диалога · KPI-1: semantic extraction quality >= baseline",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.payments",
                "title": "Auto: b.payments",
                "kind": "блок",
                "filled": true,
                "body": "Автосоздано из смыслов диалога. · mantic-refine: подтвердить автогенерацию из диалога · KPI-1: semantic extraction quality >= baseline",
                "hasSubschema": false,
                "sources": []
              },
              {
                "id": "b.crm",
                "title": "Auto: b.crm",
                "kind": "блок",
                "filled": true,
                "body": "Автосоздано из смыслов диалога. · mantic-refine: подтвердить автогенерацию из диалога · KPI-1: semantic extraction quality >= baseline",
                "hasSubschema": false,
                "sources": []
              }
            ],
            "links": [
              {
                "from": "b.ui-control",
                "to": "b.core-sync",
                "label": "depends_on"
              },
              {
                "from": "b.ui-control",
                "to": "b.agent-orchestrator",
                "label": "depends_on"
              },
              {
                "from": "b.core-sync",
                "to": "b.db",
                "label": "depends_on"
              },
              {
                "from": "b.agent-orchestrator",
                "to": "b.db",
                "label": "depends_on"
              },
              {
                "from": "b.agent-orchestrator",
                "to": "b.core-sync",
                "label": "depends_on"
              }
            ]
          }
        }
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
          "x": 120,
          "y": 180,
          "owner": "atlas"
        },
        {
          "id": "b.core-sync",
          "title": "Sync Engine",
          "status": "done",
          "x": 360,
          "y": 180,
          "owner": "atlas"
        },
        {
          "id": "b.db",
          "title": "Atlas Database",
          "status": "wip",
          "x": 600,
          "y": 180,
          "owner": "atlas"
        },
        {
          "id": "b.agent-orchestrator",
          "title": "Agent Orchestrator",
          "status": "done",
          "x": 840,
          "y": 180,
          "owner": "atlas"
        },
        {
          "id": "b.docs",
          "title": "Docs Builder",
          "status": "wip",
          "x": 120,
          "y": 350,
          "owner": "atlas"
        },
        {
          "id": "b.semantic-llm",
          "title": "Auto: b.semantic-llm",
          "status": "wip",
          "x": 360,
          "y": 350,
          "owner": "atlas"
        },
        {
          "id": "b.realtime-ingestion",
          "title": "Auto: b.realtime-ingestion",
          "status": "wip",
          "x": 600,
          "y": 350,
          "owner": "atlas"
        },
        {
          "id": "b.payments",
          "title": "Auto: b.payments",
          "status": "wip",
          "x": 840,
          "y": 350,
          "owner": "atlas"
        },
        {
          "id": "b.crm",
          "title": "Auto: b.crm",
          "status": "wip",
          "x": 120,
          "y": 520,
          "owner": "atlas"
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
window.ARCH_BY_PROJECT = Object.assign(window.ARCH_BY_PROJECT || {}, (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.archByProject) || {});
