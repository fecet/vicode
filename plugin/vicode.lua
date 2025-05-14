if vim.g.loaded_vicode then
	return
end
vim.g.loaded_vicode = 1

-- Load vicode module and config
local vicode = require("vicode")
local config = require("vicode.config")

-- Initialize with default config if not already initialized
if vim.tbl_isempty(config.options) then
	config.setup({})
end

local denops_notify = vicode.denops_notify
local augroup_name = "Vicode" -- Define augroup name globally

local function sync_cursor_position()
	local current_mode = vim.fn.mode()
	if current_mode ~= "v" and current_mode ~= "V" and current_mode ~= "i" and current_mode ~= "I" then
		denops_notify("syncCursorPos")
	end
end

local function sync_visual_selection()
	local current_mode = vim.fn.mode()
	if current_mode == "v" or current_mode == "V" then
		local start_pos = vim.fn.getpos("v")
		local end_pos = vim.fn.getpos(".")
		denops_notify("syncSelectionPos", { start_pos[2], start_pos[3], end_pos[2], end_pos[3] + 1 })
	end
end

-- Function to notify VSCode when a buffer is closed in Neovim
local function notify_buffer_close()
	local file_path = vim.fn.expand("%:p")
	if file_path ~= "" then
		print("Vicode: Buffer closed, notifying VSCode to close tab for: " .. file_path)
		denops_notify("closeBuffer", { file_path })
	end
end

vim.api.nvim_create_user_command("VicodeStart", function()
	print("Vicode: Starting WebSocket server and registering autocommands...")

	-- Create augroup and register autocommands here
	vim.api.nvim_create_augroup(augroup_name, { clear = true })
	vim.api.nvim_create_autocmd({ "CursorMoved", "VimResized" }, {
		group = augroup_name,
		pattern = "*",
		callback = sync_visual_selection,
	})
	vim.api.nvim_create_autocmd({ "CursorMoved", "CursorHold", "InsertLeave" }, {
		group = augroup_name,
		pattern = "*",
		callback = sync_cursor_position,
	})

	-- Add autocmd for buffer delete events to sync with VSCode
	vim.api.nvim_create_autocmd("BufDelete", {
		group = augroup_name,
		pattern = "*",
		callback = notify_buffer_close,
	})

	-- Use the blocking version to ensure server is started before proceeding
	local port = vicode.start_server_and_get_port_blocking()

	-- Check if server started successfully
	if not port then
		vim.notify("Vicode: Failed to start server. Cannot launch VSCode.", vim.log.levels.ERROR)
		return
	end

	print("Vicode: Server started successfully on " .. tostring(vicode.server.address))

	-- Wait a moment to ensure server is fully ready
	print("Vicode: Waiting for server to be fully ready...")
	vim.wait(500, function()
		return false
	end)

	-- Get git root directory of current file
	local result = vim.fn.system(
		"git -C " .. vim.fn.shellescape(vim.fn.expand("%:p:h")) .. " rev-parse --show-toplevel 2>/dev/null"
	)
	local git_root = vim.v.shell_error ~= 0 and nil or result:gsub("\n", "")

	-- Prepare VSCode launch arguments
	local cursor_args = { config.options.vscode.executable }

	if config.options.vscode.force_new then
		table.insert(cursor_args, "-n")
	elseif git_root then
		table.insert(cursor_args, "-r")
	end

	if git_root then
		table.insert(cursor_args, git_root)
	end

	table.insert(cursor_args, "-g")
	table.insert(cursor_args, string.format("%s:%s:%s", vim.fn.expand("%:p"), vim.fn.line("."), vim.fn.col(".")))

	-- Set environment variables to ensure VSCode auto-connects
	local env = {
		VICODE_ADDRESS = vicode.server.address,
		VICODE_AUTOCONNECT = "1", -- Ensure auto-connection
	}

	print("Vicode: Launching VSCode with connection address: " .. vicode.server.address)

	-- Launch VSCode
	vim.system(cursor_args, {
		detach = false,
		env = env,
		stderr = function(_, data)
			if data then
				print("Vicode: VSCode launch error: " .. data, vim.log.levels.ERROR)
			end
		end,
	})

	vim.notify("Vicode: VSCode launched successfully", vim.log.levels.INFO)
end, {})

vim.api.nvim_create_user_command("VicodeStop", function()
	print("Vicode: Stopping WebSocket server and removing autocommands...")
	vicode.wait_for_denops_and_notify(
		"stop",
		config.options.connection.max_attempts,
		config.options.connection.attempt_interval
	)
	-- Remove autocommands here
	vim.api.nvim_clear_autocmds({ group = augroup_name })

	-- Clear server information in the module
	vicode.server.port = nil
	vicode.server.address = nil
end, {})

local exec_count = 0
vim.api.nvim_create_user_command("VicodeExecuteCell", function()
	if exec_count == 1 then
		require("vicode").call("workbench.action.navigateRight")
	end
	require("vicode").call("jupyter.runcurrentcell")
	exec_count = exec_count + 1
end, {})

print("Vicode Lua plugin loaded")
