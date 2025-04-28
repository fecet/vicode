if vim.g.loaded_vicode then
	return
end
vim.g.loaded_vicode = 1

local denops_notify = require("vicode").denops_notify
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

	local vicode = require("vicode")

	-- Use the blocking version to ensure server is started before proceeding
	local port = vicode.start_server_and_get_port_blocking(10, 500)

	-- Check if server started successfully
	if not port then
		vim.notify("Vicode: Failed to start server. Cannot launch VSCode.", vim.log.levels.ERROR)
		return
	end

	print("Vicode: Server started successfully on " .. tostring(vicode.server.address))

	local force_new = true

	local result = vim.fn.system(
		"git -C " .. vim.fn.shellescape(vim.fn.expand("%:p:h")) .. " rev-parse --show-toplevel 2>/dev/null"
	)
	local git_root = vim.v.shell_error ~= 0 and nil or result:gsub("\n", "")

	local cursor_args = { "code-insiders" }

	if force_new then
		table.insert(cursor_args, "-n")
	elseif git_root then
		table.insert(cursor_args, "-r")
	end

	if git_root then
		table.insert(cursor_args, git_root)
	end

	table.insert(cursor_args, "-g")
	table.insert(cursor_args, string.format("%s:%s:%s", vim.fn.expand("%:p"), vim.fn.line("."), vim.fn.col(".")))

	-- Now we can be sure that vicode.server.address is set correctly
	vim.system(cursor_args, { detach = false, env = { VICODE_ADDRESS = vicode.server.address } })
end, {})

vim.api.nvim_create_user_command("VicodeStop", function()
	print("Vicode: Stopping WebSocket server and removing autocommands...")
	local vicode = require("vicode")
	vicode.wait_for_denops_and_notify(
		"stop",
		5, -- max_attempts
		300 -- attempt_interval (ms)
	)
	-- Remove autocommands here
	vim.api.nvim_clear_autocmds({ group = augroup_name })

	-- Clear server information in the module
	vicode.server.port = nil
	vicode.server.address = nil
end, {})

-- 为了向后兼容，保留旧命令但重定向到新命令
vim.api.nvim_create_user_command("ShareEditStart", function()
	vim.notify("ShareEdit has been renamed to Vicode. Please use :VicodeStart instead.", vim.log.levels.WARN)
	vim.cmd("VicodeStart")
end, {})

vim.api.nvim_create_user_command("ShareEditStop", function()
	vim.notify("ShareEdit has been renamed to Vicode. Please use :VicodeStop instead.", vim.log.levels.WARN)
	vim.cmd("VicodeStop")
end, {})

print("Vicode Lua plugin loaded")
