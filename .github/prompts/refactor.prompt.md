---
mode: "agent"
tools: ["githubRepo", "codebase", "deepwiki_fetch"]
description: "使用 Connect RPC 替代 WebSocket"
---

- 参考connect-rpc的文档
  - https://connectrpc.com/docs/node/getting-started/
  - https://connectrpc.com/docs/node/implementing-services
- 不要保留前向兼容性, 直接更新现有的proto
- 修改后使用pnpm run buf:generate生成stubs
- 在buf.gen.yaml中坚持使用v2
