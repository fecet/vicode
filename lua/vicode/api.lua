local M = {}

-- Load config module
local config = require("vicode.config")

-- 存储请求状态
local REQUEST_STATE = {
  id = 0,
  callbacks = {},
}

-- 添加回调函数并返回ID
local function add_callback(callback)
  REQUEST_STATE.id = REQUEST_STATE.id + 1
  REQUEST_STATE.callbacks[REQUEST_STATE.id] = callback
  return REQUEST_STATE.id
end

-- 调用回调函数，由VSCode响应触发
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

--- 异步执行VSCode命令
---@param name string 命令名称，通常是VSCode命令ID
---@param opts? table 可选参数表，所有字段都是可选的
--- - args: (table) 命令的可选参数
--- - callback: (function(err: string|nil, ret: any))
---   可选的回调函数处理命令结果。
---   第一个参数是错误消息，第二个是结果。
---   如果没有提供回调，任何错误消息都会在VSCode中显示为通知。
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

  -- 使用vicode模块发送命令
  local vicode = require("vicode")

  -- 检查denops是否已加载
  if not vicode.is_denops_loaded() then
    local error_msg = "Vicode: Denops is not loaded yet, cannot execute command"
    vim.notify(error_msg, vim.log.levels.ERROR)
    if opts.callback then
      opts.callback(error_msg, nil)
    end
    return
  end

  -- 创建参数数组，而不是对象
  local params = {
    name,
    opts.args or {},
    callback_id
  }

  -- 记录命令执行
  vim.notify("Vicode: Executing command: " .. name, config.options.debug.log_level)

  -- 发送命令
  local success = vicode.denops_notify("executeVSCodeCommandAsync", params)

  if not success and opts.callback then
    local error_msg = "Vicode: Failed to send command to VSCode"
    vim.notify(error_msg, vim.log.levels.ERROR)
    opts.callback(error_msg, nil)
  end
end

--- 同步执行VSCode命令
---@param name string 命令名称，通常是VSCode命令ID
---@param opts? table 可选参数表，所有字段都是可选的
--- - args: (table) 命令的可选参数
---@param timeout? number 超时时间（毫秒）。默认值为5000（5秒）。
---
---@return any: 命令执行结果
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

  -- 使用vicode模块发送同步请求
  local vicode = require("vicode")

  -- 检查denops是否已加载
  if not vicode.is_denops_loaded() then
    local error_msg = "Vicode: Denops is not loaded yet, cannot execute command"
    vim.notify(error_msg, vim.log.levels.ERROR)
    error(error_msg)
  end

  -- 记录命令执行
  vim.notify(string.format("Vicode: Executing command synchronously: %s (timeout: %dms)", name, timeout), config.options.debug.log_level)

  -- 创建参数数组，而不是对象
  local params = {
    name,
    opts.args or {},
    timeout
  }

  -- 发送同步请求
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

--- 在VSCode中执行JavaScript代码并返回结果
---@param code string 要执行的JavaScript代码
---@param opts? table 可选参数表，所有字段都是可选的
--- - args: (any) 可选参数，可在JavaScript代码中通过args变量访问
---@param timeout? number 超时时间（毫秒）。默认值为5000（5秒）。
---
---@return any: 执行JavaScript代码的结果
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

--- 异步执行JavaScript代码
---@param code string 要执行的JavaScript代码
---@param opts? table 可选参数表，所有字段都是可选的
--- - args: (any) 可选参数，可在JavaScript代码中通过args变量访问
--- - callback: (function(err: string|nil, ret: any))
---   可选的回调函数处理执行结果。
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
