# Contributing to Vicode

Thank you for your interest in contributing to Vicode! This document provides guidelines for development, testing, and debugging.

## Development Workflow

### VSCode Extension (TypeScript)

1. Start the development server:

   ```bash
   pnpm run watch
   ```

2. Press F5 in VS Code to launch the extension in debug mode


### Protocol Buffers

If you modify any `.proto` files in the `proto` directory:

```bash
pnpm run buf:generate
```

This will regenerate the TypeScript files in both `gen/` and `denops/gen/` directories.

## Code Style

- Follow the existing code style
- Use ESLint and Prettier for TypeScript files
- Use Deno's formatter for Denops files
- Write meaningful commit messages
