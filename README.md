# Vicode

A VS Code extension that enables real-time cursor position synchronization between VS Code and Neovim editors, making it easier to collaborate or switch between editors seamlessly.

## Features

- Real-time cursor position synchronization from Neovim to VS Code
- Text selection synchronization
- Automatic connection when launched from Neovim
- Execute VS Code commands directly from Neovim
- Debounced cursor updates for better performance
- Support for both Windows and Unix-based systems

## Requirements

- Visual Studio Code
- Neovim with denops.vim plugin
- Vicode plugin installed in both VS Code and Neovim

## Installation

### Neovim Installation

If you're using [lazy.nvim](https://github.com/folke/lazy.nvim) as your Neovim plugin manager, add Vicode to your configuration:

```lua
return {
  "fecet/vicode",
  build = "pixi run pnpm run package && code-insiders --install-extension vicode.vsix",
  dependencies = {
    "vim-denops/denops.vim",
  },
}
```

### VS Code Installation

Install the Vicode extension from the VS Code marketplace.

## Usage

1. Start a Vicode server in Neovim using the `:VicodeStart` command
2. In VS Code:
   - Open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Run the "Connect to Vicode" command
3. Your cursor positions will now be synchronized from Neovim to VS Code. Try moving the cursor in Neovim and see it move in VS Code.

### Automatic Connection

When you start a Vicode session in Neovim using the `:VicodeStart` command, the plugin will automatically:

1. Start the WebSocket server
2. Get the port number
3. Set the `VICODE_ADDRESS` environment variable to `localhost:<port>`

Any VS Code instance launched from this Neovim session will automatically connect to the server without prompting.

You can check the current server address by accessing the `vicode.server.address` variable in Lua:

```lua
:lua print(require("vicode").server.address)
```

### Environment Variables

The extension uses environment variables for connection:

```bash
# Set the server address in the format "host:port"
export VICODE_ADDRESS="localhost:8080"
# OR
export VICODE_SERVER="localhost:8080"  # Alternative name
```

When either of these environment variables is set, the extension will connect directly to the specified server.

You can also set the `VICODE_AUTOCONNECT` environment variable to automatically connect on startup:

```bash
# Set to 1, true, or yes to enable auto-connect
export VICODE_AUTOCONNECT=1
```

Note that if `VICODE_ADDRESS` is detected, the extension will automatically connect without needing to set `VICODE_AUTOCONNECT`.

### Executing VS Code Commands from Neovim

You can execute VS Code commands directly from Neovim using the Lua API:

```lua
-- Get the vicode module
local vicode = require("vicode")

-- Execute VS Code commands asynchronously
vicode.action("workbench.action.files.newUntitledFile")

-- Execute VS Code commands synchronously with a result
local result = vicode.call("workbench.action.files.save")

-- Execute JavaScript in VS Code
local vscode_version = vicode.eval("vscode.version")
```

This is useful for integrating with other plugins or scripts that need to interact with VS Code.

## Available Commands

### VS Code Commands

- `vicode.connect`: Connect to a Vicode server
- `vicode.disconnect`: Disconnect from the current server

### Neovim Commands

- `:VicodeStart`: Start the WebSocket server and set environment variable
- `:VicodeStop`: Stop the WebSocket server and clear environment variable

## Configuration

Vicode supports configuration through lazy.nvim's standard `opts` or `config` options. Here are the available configuration options with their default values:

```lua
{
  -- Server configuration
  server = {
    host = "localhost", -- Server host
  },

  -- Connection settings
  connection = {
    max_attempts = 10,       -- Maximum number of attempts to connect to denops
    attempt_interval = 500,  -- Interval between connection attempts (ms)
  },

  -- Command execution settings
  command = {
    default_timeout = 5000,  -- Default timeout for synchronous commands (ms)
  },

  -- VS Code launch settings
  vscode = {
    force_new = true,        -- Force new VS Code window
    executable = "code",     -- VS Code executable to use
  },

  -- Debug settings
  debug = {
    log_level = vim.log.levels.WARN, -- Default log level
  },
}
```

### Configuration Examples

#### Basic Configuration with opts

```lua
return {
  "fecet/vicode",
  dependencies = {
    "vim-denops/denops.vim",
  },
  opts = {
    vscode = {
      executable = "code", -- Use stable VS Code
    },
  },
}
```

#### Advanced Configuration with setup function

```lua
return {
  "fecet/vicode",
  dependencies = {
    "vim-denops/denops.vim",
  },
  config = function()
    require("vicode").setup({
      vscode = {
        executable = "code",
      },
      connection = {
        max_attempts = 20,
        attempt_interval = 1000,
      },
      debug = {
        log_level = vim.log.levels.DEBUG, -- Enable debug logging
      },
    })

    -- You can add additional initialization code here
  end,
}
```

## Breaking changes

- The plugin has been renamed from ShareEdit to Vicode. Old commands are still available for backward compatibility but will show deprecation warnings.
- Configuration directories have been moved from `~/.config/shareedit` to `~/.config/vicode` (Unix) and from `%APPDATA%\shareedit` to `%APPDATA%\vicode` (Windows).
- Multi-session support has been removed in favor of environment variable-based connection.
- Buffer synchronization is now one-way from Neovim to VS Code.

## Troubleshooting

If you encounter connection issues:

1. Ensure the Vicode plugin is properly installed in both Neovim and VS Code
2. Check if the WebSocket server is running with `:VicodeShowServer` in Neovim
3. Verify that the environment variables are correctly set
4. Try disconnecting and reconnecting to the server

## License

This extension is open-sourced under the MIT License - see the [LICENSE](LICENSE) file for details.
