local M = {}

local plugin_name = "shareedit"
local is_loaded_cache = nil

-- Store server information
M.server = {
	port = nil,
	host = "localhost",
	address = nil,
}

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
		vim.notify("ShareEdit: Denops is not loaded yet", vim.log.levels.ERROR)
		return nil
	end

	local status, result = pcall(vim.fn["denops#request"], plugin_name, method, params or {})
	if not status then
		vim.notify("ShareEdit: Error calling denops#request: " .. tostring(result), vim.log.levels.ERROR)
		return nil
	end

	return result
end

function M.execute_vscode_command(command, args)
	if type(command) ~= "string" or command == "" then
		print("ShareEdit Error: command must be a non-empty string.")
		return
	end
	M.denops_notify("executeVSCodeCommand", { command, args })
end

function M.wait_for_denops_and_notify(method, max_attempts, attempt_interval)
	local current_attempt = 0

	local function wait_and_notify()
		current_attempt = current_attempt + 1

		if M.is_denops_loaded() then
			print("ShareEdit: Denops is loaded, calling method: " .. method)
			M.denops_notify(method)
		else
			if current_attempt < max_attempts then
				vim.notify(
					string.format(
						"ShareEdit: Waiting for Denops to load... (attempt %d/%d)",
						current_attempt,
						max_attempts
					),
					vim.log.levels.DEBUG
				)
				vim.defer_fn(wait_and_notify, attempt_interval)
			else
				vim.notify(
					"ShareEdit: Timed out waiting for Denops to load. Please try again later.",
					vim.log.levels.WARN
				)
				vim.notify("ShareEdit: You can check Denops status with :checkhealth denops", vim.log.levels.INFO)
			end
		end
	end

	wait_and_notify()
end

-- Start the WebSocket server and get the port number (blocking version)
-- This function blocks until the server is started and port is obtained
-- Returns: port number on success, nil on failure
function M.start_server_and_get_port_blocking(max_attempts, attempt_interval)
	-- Wait for denops to load first
	local denops_loaded = false
	local denops_attempt = 0

	while not denops_loaded and denops_attempt < max_attempts do
		denops_attempt = denops_attempt + 1
		denops_loaded = M.is_denops_loaded()

		if not denops_loaded then
			-- Use vim.wait for blocking sleep
			vim.wait(attempt_interval, function()
				return false
			end)
		end
	end

	if not denops_loaded then
		vim.notify("ShareEdit: Timed out waiting for Denops to load. Please try again later.", vim.log.levels.ERROR)
		return nil
	end

	local result = M.denops_request("start")

	if result and result.success and result.port then
		M.server.port = result.port -- Update the module's server port
		M.server.address = M.server.host .. ":" .. M.server.port -- Update the full address
		return M.server.port
	else
		local error_msg = result and result.error or "Unknown error when starting server"
		vim.notify("ShareEdit: Failed to start server: " .. error_msg, vim.log.levels.ERROR)
		return nil
	end
end

return M
