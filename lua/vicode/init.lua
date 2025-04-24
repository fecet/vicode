local M = {}

local plugin_name = "shareedit"
local is_loaded_cache = nil

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
	local status, err = pcall(vim.fn["denops#notify"], plugin_name, method, params or {})
	if not status then
		return false
	end
	return true
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

return M
