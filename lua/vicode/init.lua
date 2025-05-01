local M = {}

local plugin_name = "vicode"
local is_loaded_cache = nil

-- Load config module
local config = require("vicode.config")

-- Server information (updated from config in setup)
M.server = {
	port = nil,
	host = nil,
	address = nil,
}

-- Load API module
local api = require("vicode.api")

-- Export API functions
M.action = api.action
M.call = api.call
M.eval = api.eval
M.eval_async = api.eval_async

function M.is_denops_loaded()
	if is_loaded_cache == true then
		return true
	end

	if vim.fn["denops#plugin#is_loaded"] == nil then
		return false
	end

	local status, result = pcall(vim.fn["denops#plugin#is_loaded"], plugin_name)

	if status and result == 1 then
		is_loaded_cache = true
		return true
	end

	return false
end

function M.denops_notify(method, params)
	local status, _ = pcall(vim.fn["denops#notify"], plugin_name, method, params or {})
	if not status then
		return false
	end
	return true
end

-- Call denops method and get the result
function M.denops_request(method, params)
	if not M.is_denops_loaded() then
		vim.notify("Vicode: Denops is not loaded yet", vim.log.levels.ERROR)
		return nil
	end

	local status, result = pcall(vim.fn["denops#request"], plugin_name, method, params or {})
	if not status then
		vim.notify("Vicode: Error calling denops#request: " .. tostring(result), vim.log.levels.ERROR)
		return nil
	end

	return result
end

function M.execute_vscode_command(command, args)
	if type(command) ~= "string" or command == "" then
		print("Vicode Error: command must be a non-empty string.")
		return
	end
	M.denops_notify("executeVSCodeCommand", { command, args })
end

-- Initialize plugin with user configuration (main entry point for lazy.nvim)
function M.setup(opts)
	local options = config.setup(opts)
	M.server.host = options.server.host
	return M
end

function M.wait_for_denops_and_notify(method, max_attempts, attempt_interval)
	-- Use config values if not provided
	max_attempts = max_attempts or config.options.connection.max_attempts
	attempt_interval = attempt_interval or config.options.connection.attempt_interval

	local current_attempt = 0

	local function wait_and_notify()
		current_attempt = current_attempt + 1

		if M.is_denops_loaded() then
			print("Vicode: Denops is loaded, calling method: " .. method)
			M.denops_notify(method)
		else
			if current_attempt < max_attempts then
				vim.notify(
					string.format(
						"Vicode: Waiting for Denops to load... (attempt %d/%d)",
						current_attempt,
						max_attempts
					),
					config.options.debug.log_level
				)
				vim.defer_fn(wait_and_notify, attempt_interval)
			else
				vim.notify(
					"Vicode: Timed out waiting for Denops to load. Please try again later.",
					vim.log.levels.WARN
				)
				vim.notify("Vicode: You can check Denops status with :checkhealth denops", vim.log.levels.INFO)
			end
		end
	end

	wait_and_notify()
end

-- Start WebSocket server and get port number (blocking version)
-- Blocks until server is started and port is obtained
-- Returns: port number on success, nil on failure
function M.start_server_and_get_port_blocking(max_attempts, attempt_interval)
	-- Use config values if not provided
	max_attempts = max_attempts or config.options.connection.max_attempts
	attempt_interval = attempt_interval or config.options.connection.attempt_interval

	-- Wait for denops to load first
	local denops_loaded = false
	local denops_attempt = 0

	print("Vicode: Waiting for Denops to load...")

	while not denops_loaded and denops_attempt < max_attempts do
		denops_attempt = denops_attempt + 1
		denops_loaded = M.is_denops_loaded()

		if denops_loaded then
			print("Vicode: Denops loaded successfully after " .. denops_attempt .. " attempts")
		elseif denops_attempt % 5 == 0 then -- Log every 5 attempts to avoid spam
			print(string.format("Vicode: Still waiting for Denops (attempt %d/%d)...", denops_attempt, max_attempts))
		end

		if not denops_loaded and denops_attempt < max_attempts then
			-- Use vim.wait for blocking sleep with a positive count value
			vim.wait(attempt_interval, function()
				return false
			end)
		end
	end

	if not denops_loaded then
		vim.notify("Vicode: Timed out waiting for Denops to load. Please try again later.", vim.log.levels.ERROR)
		print("Vicode: You can check Denops status with :checkhealth denops")
		return nil
	end

	print("Vicode: Starting WebSocket server...")
	local result = M.denops_request("start")

	if result and result.success and result.port then
		M.server.port = result.port -- Update server port
		M.server.host = M.server.host or config.options.server.host -- Use config host if not set
		M.server.address = M.server.host .. ":" .. M.server.port -- Update full address

		-- Verify server is ready by sending a ping
		local ping_result = M.denops_request("ping")
		if ping_result and ping_result.success then
			print("Vicode: Server started and verified on " .. M.server.address)
			return M.server.port
		else
			vim.notify("Vicode: Server started but verification failed. Connection may be unstable.", vim.log.levels.WARN)
			return M.server.port -- Still return the port, but with a warning
		end
	else
		local error_msg = result and result.error or "Unknown error when starting server"
		vim.notify("Vicode: Failed to start server: " .. error_msg, vim.log.levels.ERROR)
		return nil
	end
end

return M
