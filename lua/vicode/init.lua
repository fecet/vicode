local M = {}

local plugin_name = 'shareedit'

function M.is_denops_loaded()
  -- 检查 denops#plugin#is_loaded 是否存在并可调用
  if vim.fn['denops#plugin#is_loaded'] == nil then
    return false
  end
  -- 调用 denops#plugin#is_loaded 函数
  local status, result = pcall(vim.fn['denops#plugin#is_loaded'], plugin_name)
  return status and result == 1
end

function M.denops_notify(method, params)
  if not M.is_denops_loaded() then
    -- print("ShareEdit: Denops not loaded or plugin not ready.")
    return
  end
  local status, err = pcall(vim.fn['denops#notify'], plugin_name, method, params or {})
  if not status then
    print("ShareEdit: Error calling denops#notify for " .. method .. ": " .. err)
  end
end

return M
