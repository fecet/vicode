# ShareEdit

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
- Vim with [vim-shareedit](https://github.com/kbwo/vim-shareedit) plugin installed

## Installation

1. Install this extension from the VS Code marketplace
2. Install the vim-shareedit plugin in Vim ( see [vim-shareedit](https://github.com/kbwo/vim-shareedit) for instructions )
3. Install the vscode-shareedit extension in VSCode ( see [Marketplace](https://marketplace.visualstudio.com/items?itemName=kbwo.shareedit) )

## Usage

1. Start a ShareEdit session in Vim using the vim-shareedit plugin
2. In VS Code:
   - Open the command palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Run the "Connect to vim-shareedit" command
   - Select the active session from the quick pick menu
3. Your cursor positions will now be synchronized between VS Code and Vim. Try moving the cursor in one editor and see it move in the other.

### Using Environment Variables

You can set the server address using environment variables to bypass the session selection dialog:

```bash
# Set the server address in the format "host:port" (either variable works)
export SHAREEDIT_SERVER="localhost:8080"
# OR
export SHAREEDIT_ADDRESS="localhost:8080"
```

When either of these environment variables is set, the extension will connect directly to the specified server without prompting for session selection. The extension checks for `SHAREEDIT_SERVER` first, then falls back to `SHAREEDIT_ADDRESS` if the former is not set.

You can also set the `SHAREEDIT_AUTOCONNECT` environment variable to automatically connect on startup:

```bash
# Set to 1, true, or yes to enable auto-connect
export SHAREEDIT_AUTOCONNECT=1
```

Note that if `SHAREEDIT_ADDRESS` is detected, the extension will automatically connect without needing to set `SHAREEDIT_AUTOCONNECT`.

### Command Line Launcher

This extension includes a shell script that makes it easy to launch VSCode with ShareEdit automatically connected. The script:

1. Checks for an existing ShareEdit server address in the environment
2. If not found, tries to read it from the session file
3. Sets the auto-connect flag
4. Launches VSCode with all your command line arguments

To use the launcher:

```bash
# Make the script executable (first time only)
chmod +x /path/to/shareedit-vscode.sh

# Launch VSCode with auto-connect
/path/to/shareedit-vscode.sh [your-vscode-arguments]
```

You can create an alias for convenience:

```bash
# Add to your .bashrc or .zshrc
alias vsc='/path/to/shareedit-vscode.sh'

# Then use it like this
vsc /path/to/your/project
```

#### Automatic Environment Variable Setting in Vim

When you start a ShareEdit session in Vim using the `:ShareEditStart` command, the plugin will automatically:

1. Start the WebSocket server
2. Get the port number
3. Set the `SHAREEDIT_SERVER` environment variable to `localhost:<port>` (which will be detected by the VSCode extension)
4. Store the server information in the Lua module

This means any VSCode instance launched from this Vim session will automatically connect to the correct server without prompting.

You can check the current server address with the `:ShareEditShowServer` command in Vim.

#### Accessing Server Information in Lua

You can access the server information directly from Lua scripts:

```lua
-- Get the vicode module
local vicode = require("vicode")

-- Access server information
local port = vicode.get_server_port()
local address = vicode.get_server_address()

-- Or access the server table directly
local server_info = vicode.server
print("Server host:", server_info.host)
print("Server port:", server_info.port)
print("Server address:", server_info.address)
```

This is useful for integrating with other plugins or scripts that need to know the server address.

## Breaking changes

- From v0.0.8, you no longer need to manually enter ports. You can now select from a list of active ports and their associated directories. Please update vim-shareedit to the latest version to use this feature.

## Available Commands

### VSCode Commands

- `Connect to vim-shareedit`: Connect to a ShareEdit session
- `Disconnect from vim-shareedit`: Disconnect from the current session

### Vim Commands

- `:ShareEditStart`: Start the WebSocket server and set environment variable
- `:ShareEditStop`: Stop the WebSocket server and clear environment variable
- `:ShareEditShowServer`: Display the current server address in the environment variable
- `:ShareEditGetPort`: Get the current server port (useful for scripting)

## Notes

- The extension automatically detects active ShareEdit sessions
- Sessions are stored in:
  - Windows: `%APPDATA%\shareedit\sessions.json`
  - Unix: `~/.config/shareedit/sessions.json`

## Troubleshooting

If you encounter connection issues:

1. Ensure the vim-shareedit plugin is properly installed and running
2. Check if the WebSocket server is running on the specified port
3. Try disconnecting and reconnecting to the session

## License

This extension is open-sourced under the MIT License - see the [LICENSE](LICENSE) file for details.
