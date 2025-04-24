local M = {}

local plugin_name = 'shareedit'

function M.is_denops_loaded()
  -- 检查 denops#plugin#is_loaded 是否存在并可调用
  if vim.fn['denops#plugin#is_loaded'] == nil then
    -- 检查 denops 是否已安装
    local has_denops = vim.fn.exists('g:loaded_denops') == 1
    if not has_denops then
      -- 只在第一次检查时打印，避免日志过多
      if not M._denops_check_logged then
        print("ShareEdit: Denops plugin is not installed or not loaded")
        M._denops_check_logged = true
      end
    else
      -- 检查 denops 服务器状态
      if vim.fn.exists('*denops#server#status') == 1 then
        local server_status = vim.fn['denops#server#status']()
        if not M._denops_status_logged or M._last_denops_status ~= server_status then
          print("ShareEdit: Denops server status: " .. server_status)
          M._denops_status_logged = true
          M._last_denops_status = server_status
        end
      end
    end
    return false
  end

  -- 调用 denops#plugin#is_loaded 函数
  local status, result = pcall(vim.fn['denops#plugin#is_loaded'], plugin_name)

  -- 记录结果（但避免重复日志）
  if not M._plugin_load_status_logged or M._last_plugin_load_status ~= (status and result == 1) then
    if status then
      if result == 1 then
        print("ShareEdit: Plugin '" .. plugin_name .. "' is loaded")
      else
        print("ShareEdit: Plugin '" .. plugin_name .. "' is not loaded yet")
      end
    else
      print("ShareEdit: Error checking plugin load status: " .. tostring(result))
    end
    M._plugin_load_status_logged = true
    M._last_plugin_load_status = (status and result == 1)
  end

  return status and result == 1
end

function M.denops_notify(method, params)
  if not M.is_denops_loaded() then
    print("ShareEdit: Denops not loaded or plugin not ready. Cannot execute: " .. method)
    return false
  end

  print("ShareEdit: Calling denops#notify for method: " .. method)
  local status, err = pcall(vim.fn['denops#notify'], plugin_name, method, params or {})

  if not status then
    print("ShareEdit: Error calling denops#notify for " .. method .. ": " .. err)
    return false
  end

  print("ShareEdit: Successfully called denops#notify for method: " .. method)
  return true
end

-- 新增函数：执行 VS Code 命令
-- @param command (string) 要执行的 VS Code 命令 ID
-- @param args (any|table|nil) 命令的参数，可以是单个值或一个包含多个参数的表
function M.execute_vscode_command(command, args)
  if type(command) ~= "string" or command == "" then
    print("ShareEdit Error: command must be a non-empty string.")
    return
  end
  -- 将参数包装在 table 中传递给 denops_notify
  M.denops_notify("executeVSCodeCommand", { command, args })
end

return M
