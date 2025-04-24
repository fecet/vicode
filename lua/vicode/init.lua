local M = {}

local plugin_name = 'shareedit'
local is_loaded_cache = nil -- 缓存加载状态

function M.is_denops_loaded()
  -- 如果已经确认加载成功，直接返回 true
  if is_loaded_cache == true then
    return true
  end

  -- 检查 denops#plugin#is_loaded 函数是否存在
  if vim.fn['denops#plugin#is_loaded'] == nil then
    -- Denops 或其核心函数不可用
    return false
  end

  -- 调用 denops#plugin#is_loaded 函数检查插件状态
  local status, result = pcall(vim.fn['denops#plugin#is_loaded'], plugin_name)

  -- 如果调用成功且插件已加载 (result == 1)
  if status and result == 1 then
    is_loaded_cache = true -- 缓存结果
    return true
  end

  -- 其他情况（调用失败或插件未加载）
  return false
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

-- 新增函数：带重试逻辑地调用 Denops notify
function M.wait_for_denops_and_notify(method, max_attempts, attempt_interval)
  local current_attempt = 0

  local function wait_and_notify()
    current_attempt = current_attempt + 1

    if M.is_denops_loaded() then
      print("ShareEdit: Denops is loaded, calling method: " .. method)
      M.denops_notify(method)
      -- 不需要打印成功或失败消息
    else
      if current_attempt < max_attempts then
        vim.notify(string.format("ShareEdit: Waiting for Denops to load... (attempt %d/%d)",
                           current_attempt, max_attempts), vim.log.levels.DEBUG)
        vim.defer_fn(wait_and_notify, attempt_interval)
      else
        vim.notify("ShareEdit: Timed out waiting for Denops to load. Please try again later.", vim.log.levels.WARN)
        vim.notify("ShareEdit: You can check Denops status with :checkhealth denops", vim.log.levels.INFO)
      end
    end
  end

  -- 开始等待过程
  wait_and_notify()
end

return M
