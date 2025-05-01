# Vicode

A VS Code extension that enables real-time cursor position synchronization between VS Code and Vim editors, making it easier to collaborate or switch between editors seamlessly.

## Features

- Real-time cursor position synchronization between VS Code and Vim
- Text selection synchronization
- Multi-session support for different projects
- Automatic reconnection handling
- Debounced cursor updates for better performance
- Support for both Windows and Unix-based systems

## Requirements

- Visual Studio Code
- Vim with Vicode plugin installed

## Installation

1. Install this extension from the VS Code marketplace
2. Install the Vicode plugin in Vim
3. Install the Vicode extension in VSCode

### Using with lazy.nvim

If you're using [lazy.nvim](https://github.com/folke/lazy.nvim) as your Neovim plugin manager, you can add Vicode to your configuration:

```lua
return {
  "fecet/vicode",
  dependencies = {
    "vim-denops/denops.vim",
  },
}
```

## Usage

1. Start a Vicode session in Vim using the `:VicodeStart` command
2. In VS Code:
   - Open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Run the "Connect to Vicode" command
   - Select the active session from the quick pick menu
3. Your cursor positions will now be synchronized between VS Code and Vim. Try moving the cursor in one editor and see it move in the other.

### Using Environment Variables

You can set the server address using environment variables to bypass the session selection dialog:

```bash
# Set the server address in the format "host:port" (either variable works)
export VICODE_SERVER="localhost:8080"
# OR
export VICODE_ADDRESS="localhost:8080"
```

When either of these environment variables is set, the extension will connect directly to the specified server without prompting for session selection. The extension checks for `VICODE_SERVER` first, then falls back to `VICODE_ADDRESS` if the former is not set.

You can also set the `VICODE_AUTOCONNECT` environment variable to automatically connect on startup:

```bash
# Set to 1, true, or yes to enable auto-connect
export VICODE_AUTOCONNECT=1
```

Note that if `VICODE_ADDRESS` is detected, the extension will automatically connect without needing to set `VICODE_AUTOCONNECT`.

For backward compatibility, the legacy environment variables `SHAREEDIT_SERVER`, `SHAREEDIT_ADDRESS`, and `SHAREEDIT_AUTOCONNECT` are also supported.

### Command Line Launcher

This extension includes a shell script that makes it easy to launch VSCode with Vicode automatically connected. The script:

1. Checks for an existing Vicode server address in the environment
2. If not found, tries to read it from the session file
3. Sets the auto-connect flag
4. Launches VSCode with all your command line arguments

To use the launcher:

```bash
# Make the script executable (first time only)
chmod +x /path/to/vicode-vscode.sh

# Launch VSCode with auto-connect
/path/to/vicode-vscode.sh [your-vscode-arguments]
```

You can create an alias for convenience:

```bash
# Add to your .bashrc or .zshrc
alias vsc='/path/to/vicode-vscode.sh'

# Then use it like this
vsc /path/to/your/project
```

#### Automatic Environment Variable Setting in Vim

When you start a Vicode session in Vim using the `:VicodeStart` command, the plugin will automatically:

1. Start the WebSocket server
2. Get the port number
3. Set the `VICODE_ADDRESS` environment variable to `localhost:<port>` (which will be detected by the VSCode extension)
4. Store the server information in the Lua module

This means any VSCode instance launched from this Vim session will automatically connect to the correct server without prompting.

You can check the current server address with the `:VicodeShowServer` command in Vim.

#### Accessing Server Information and API Functions

You can access the server information and use API functions directly from Lua scripts:

```lua
-- Get the vicode module
local vicode = require("vicode")

-- Access server information
local server_info = vicode.server
print("Server host:", server_info.host)
print("Server port:", server_info.port)
print("Server address:", server_info.address)

-- Execute VSCode commands asynchronously
vicode.action("workbench.action.files.newUntitledFile")

-- Execute VSCode commands synchronously
local result = vicode.call("workbench.action.files.save")

-- Execute JavaScript in VSCode
local vscode_version = vicode.eval("vscode.version")
```

This is useful for integrating with other plugins or scripts that need to interact with VSCode.

## Breaking changes

- The plugin has been renamed from ShareEdit to Vicode. Old commands are still available for backward compatibility but will show deprecation warnings.
- Configuration directories have been moved from `~/.config/shareedit` to `~/.config/vicode` (Unix) and from `%APPDATA%\shareedit` to `%APPDATA%\vicode` (Windows).

## Available Commands

### VSCode Commands

- `Connect to Vicode`: Connect to a Vicode session
- `Disconnect from Vicode`: Disconnect from the current session

### Vim Commands

- `:VicodeStart`: Start the WebSocket server and set environment variable
- `:VicodeStop`: Stop the WebSocket server and clear environment variable
- `:VicodeShowServer`: Display the current server address in the environment variable
- `:VicodeGetPort`: Get the current server port (useful for scripting)

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

  -- VSCode launch settings
  vscode = {
    force_new = true,        -- Force new VSCode window
    executable = "code-insiders", -- VSCode executable to use
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
      executable = "code", -- Use stable VSCode instead of Insiders
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

## Notes

- The extension automatically detects active Vicode sessions
- Sessions are stored in:
  - Windows: `%APPDATA%\vicode\sessions.json`
  - Unix: `~/.config/vicode\sessions.json`

## Troubleshooting

If you encounter connection issues:

1. Ensure the Vicode plugin is properly installed and running
2. Check if the WebSocket server is running on the specified port
3. Try disconnecting and reconnecting to the session

## License

This extension is open-sourced under the MIT License - see the [LICENSE](LICENSE) file for details.
