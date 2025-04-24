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
  print("ShareEdit: Starting WebSocket server...")

  -- 获取vicode模块
  local vicode = require('vicode')

  -- 定义最大尝试次数和间隔
  local max_attempts = 10
  local attempt_interval = 500 -- 毫秒
  local current_attempt = 0

  -- 创建一个递归函数来等待Denops加载
  local function wait_for_denops_and_start()
    current_attempt = current_attempt + 1

    -- 检查Denops是否已加载
    if vicode.is_denops_loaded() then
      print("ShareEdit: Denops is loaded, starting server...")

      -- 尝试启动服务器
      local success = denops_notify("start")
      if success then
        print("ShareEdit: Server start request sent successfully")
        -- 延迟一段时间后检查服务器状态
        vim.defer_fn(function()
          print("ShareEdit: Checking server status...")
          -- 这里可以添加检查逻辑，例如检查配置文件是否已创建
        end, 2000) -- 2秒后检查
      else
        print("ShareEdit: Failed to send server start request")
      end
    else
      -- 如果还没加载完成且未超过最大尝试次数，继续等待
      if current_attempt < max_attempts then
        print(string.format("ShareEdit: Waiting for Denops to load... (attempt %d/%d)",
                           current_attempt, max_attempts))
        vim.defer_fn(wait_for_denops_and_start, attempt_interval)
      else
        print("ShareEdit: Timed out waiting for Denops to load. Please try again later.")
        print("ShareEdit: You can check Denops status with :checkhealth denops")
      end
    end
  end

  -- 开始等待过程
  wait_for_denops_and_start()
end, {})

vim.api.nvim_create_user_command('ShareEditStop', function()
  print("ShareEdit: Stopping WebSocket server...")

  -- 获取vicode模块
  local vicode = require('vicode')

  -- 定义最大尝试次数和间隔
  local max_attempts = 5
  local attempt_interval = 300 -- 毫秒
  local current_attempt = 0

  -- 创建一个递归函数来等待Denops加载
  local function wait_for_denops_and_stop()
    current_attempt = current_attempt + 1

    -- 检查Denops是否已加载
    if vicode.is_denops_loaded() then
      print("ShareEdit: Denops is loaded, stopping server...")

      -- 尝试停止服务器
      local success = denops_notify("stop")
      if success then
        print("ShareEdit: Server stop request sent successfully")
      else
        print("ShareEdit: Failed to send server stop request")
      end
    else
      -- 如果还没加载完成且未超过最大尝试次数，继续等待
      if current_attempt < max_attempts then
        print(string.format("ShareEdit: Waiting for Denops to load... (attempt %d/%d)",
                           current_attempt, max_attempts))
        vim.defer_fn(wait_for_denops_and_stop, attempt_interval)
      else
        print("ShareEdit: Timed out waiting for Denops to load. Please try again later.")
      end
    end
  end

  -- 开始等待过程
  wait_for_denops_and_stop()
end, {})

print("Vicode Lua plugin loaded")
