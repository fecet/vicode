local M = {}

-- Load config module
local config = require("vicode.config")

-- Request state storage
local REQUEST_STATE = {
  id = 0,
  callbacks = {},
}

-- Add callback function and return ID
local function add_callback(callback)
  REQUEST_STATE.id = REQUEST_STATE.id + 1
  REQUEST_STATE.callbacks[REQUEST_STATE.id] = callback
  return REQUEST_STATE.id
end

-- Invoke callback function triggered by VSCode response
function M.invoke_callback(id, result, is_error)
  vim.schedule(function()
    local callback = REQUEST_STATE.callbacks[id]
    REQUEST_STATE.callbacks[id] = nil
    if callback then
      if is_error then
        callback(result, nil)
      else
        callback(nil, result)
      end
    end
  end)
end

--- Execute VSCode command asynchronously
---@param name string Command name, typically a VSCode command ID
---@param opts? table Optional parameters table, all fields are optional
--- - args: (table) Optional command arguments
--- - callback: (function(err: string|nil, ret: any))
---   Optional callback function to handle command result.
---   First parameter is error message, second is result.
---   If no callback is provided, any error messages will be shown as notifications in VSCode.
function M.action(name, opts)
  opts = opts or {}

  vim.validate({
    name = { name, "string" },
    opts = { opts, "table", true },
  })

  vim.validate({
    ["opts.callback"] = { opts.callback, "function", true },
    ["opts.args"] = { opts.args, "table", true },
  })

  if opts.args and not vim.tbl_islist(opts.args) then
    opts.args = { opts.args }
  end

  local callback_id = nil
  if opts.callback then
    callback_id = add_callback(opts.callback)
  end

  -- Use vicode module to send command
  local vicode = require("vicode")

  -- Check if denops is loaded
  if not vicode.is_denops_loaded() then
    local error_msg = "Vicode: Denops is not loaded yet, cannot execute command"
    vim.notify(error_msg, vim.log.levels.ERROR)
    if opts.callback then
      opts.callback(error_msg, nil)
    end
    return
  end

  -- Create parameters array instead of object
  local params = {
    name,
    opts.args or {},
    callback_id
  }

  -- Send command
  local success = vicode.denops_notify("executeVSCodeCommandAsync", params)

  if not success and opts.callback then
    local error_msg = "Vicode: Failed to send command to VSCode"
    vim.notify(error_msg, vim.log.levels.ERROR)
    opts.callback(error_msg, nil)
  end
end

--- Execute VSCode command synchronously
---@param name string Command name, typically a VSCode command ID
---@param opts? table Optional parameters table
--- - args: (table) Optional command arguments
---@param timeout? number Timeout in milliseconds. Default is 5000 (5 seconds).
---
---@return any Command execution result
function M.call(name, opts, timeout)
  opts = opts or {}
  timeout = timeout or config.options.command.default_timeout

  vim.validate({
    name = { name, "string" },
    opts = { opts, "table", true },
    timeout = { timeout, "number", true },
  })

  vim.validate({
    ["opts.args"] = { opts.args, "table", true },
  })

  if opts.args and not vim.tbl_islist(opts.args) then
    opts.args = { opts.args }
  end

  -- Use vicode module to send sync request
  local vicode = require("vicode")

  -- Check if denops is loaded
  if not vicode.is_denops_loaded() then
    local error_msg = "Vicode: Denops is not loaded yet, cannot execute command"
    vim.notify(error_msg, vim.log.levels.ERROR)
    error(error_msg)
  end

  -- Create parameters array
  local params = {
    name,
    opts.args or {},
    timeout
  }

  -- Send synchronous request
  local status, result = pcall(function()
    return vicode.denops_request("executeVSCodeCommandSync", params)
  end)

  if not status then
    local error_msg = string.format("Vicode: Error executing command '%s': %s", name, result)
    vim.notify(error_msg, vim.log.levels.ERROR)
    error(error_msg)
  end

  if not result then
    local error_msg = string.format("Vicode: Command '%s' returned no result", name)
    vim.notify(error_msg, vim.log.levels.ERROR)
    error(error_msg)
  end

  if result.success then
    return result.data
  elseif result.error then
    local error_msg = string.format("Vicode: Command '%s' failed: %s", name, result.error)
    vim.notify(error_msg, vim.log.levels.ERROR)
    error(error_msg)
  else
    local error_msg = string.format("Vicode: Call '%s' failed or timed out.", name)
    vim.notify(error_msg, vim.log.levels.ERROR)
    error(error_msg)
  end
end

--- Execute JavaScript code in VSCode and return result
---@param code string JavaScript code to execute
---@param opts? table Optional parameters table
--- - args: (any) Optional arguments accessible in JavaScript code via args variable
---@param timeout? number Timeout in milliseconds. Default is 5000 (5 seconds).
---
---@return any JavaScript execution result
function M.eval(code, opts, timeout)
  vim.validate({
    code = { code, "string" },
    opts = { opts, "table", true },
    timeout = { timeout, "number", true },
  })

  opts = opts or {}
  opts.args = { code, opts.args }

  return M.call("eval", opts, timeout)
end

--- Execute JavaScript code asynchronously
---@param code string JavaScript code to execute
---@param opts? table Optional parameters table
--- - args: (any) Optional arguments accessible in JavaScript code via args variable
--- - callback: (function(err: string|nil, ret: any))
---   Optional callback function to handle execution result
function M.eval_async(code, opts)
  vim.validate({
    code = { code, "string" },
    opts = { opts, "table", true },
  })

  opts = opts or {}
  opts.args = { code, opts.args }

  M.action("eval", opts)
end

return M
