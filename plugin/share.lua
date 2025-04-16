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
    -- getpos 返回 [bufnum, lnum, col, off]
    -- 我们需要行号和列号 (索引 2 和 3)
    -- Vim 列号是基于字节的，我们需要字符列号，但 denops 端会处理
    -- 注意：Vim 的列号是 1-based，与 API 保持一致
    -- Denops 端期望 endCol + 1，这里直接传递原始列号，让 denops 处理
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
  denops_notify("start")
end, {})

vim.api.nvim_create_user_command('ShareEditStop', function()
  denops_notify("stop")
end, {})

print("Vicode Lua plugin loaded")
