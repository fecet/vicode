-- 防止重复加载
if vim.g.loaded_shareedit then
  return
end
vim.g.loaded_shareedit = 1

local denops_notify = require('vicode').denops_notify

-- 同步光标位置
local function sync_cursor_position()
  local current_mode = vim.fn.mode()
  -- 在非可视模式和插入模式之外同步
  if current_mode ~= 'v' and current_mode ~= 'V' and current_mode ~= 'i' and current_mode ~= 'I' then
    denops_notify("syncCursorPos")
  end
end

-- 同步可视模式选择
local function sync_visual_selection()
  local current_mode = vim.fn.mode()
  if current_mode == 'v' or current_mode == 'V' then
    local start_pos = vim.fn.getpos("v")
    local end_pos = vim.fn.getpos(".")
    denops_notify("syncSelectionPos", { start_pos[2], start_pos[3], end_pos[2], end_pos[3] + 1 })
  end
end

-- 创建自动命令组
local augroup = vim.api.nvim_create_augroup('ShareEdit', { clear = true })

-- 设置自动命令
vim.api.nvim_create_autocmd({ "CursorMoved", "VimResized" }, {
  group = augroup,
  pattern = "*",
  callback = sync_visual_selection
})

vim.api.nvim_create_autocmd({ "CursorMoved", "CursorHold", "InsertLeave" }, {
  group = augroup,
  pattern = "*",
  callback = sync_cursor_position
})

-- 创建用户命令
vim.api.nvim_create_user_command('ShareEditStart', function()
  print("ShareEdit: Starting WebSocket server...")
  local vicode = require('vicode')
  vicode.wait_for_denops_and_notify(
    "start",
    10, -- max_attempts
    500 -- attempt_interval (ms)
  )
end, {})

vim.api.nvim_create_user_command('ShareEditStop', function()
  print("ShareEdit: Stopping WebSocket server...")
  local vicode = require('vicode')
  vicode.wait_for_denops_and_notify(
    "stop",
    5, -- max_attempts
    300 -- attempt_interval (ms)
  )
end, {})

print("Vicode Lua plugin loaded")
