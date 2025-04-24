if vim.g.loaded_shareedit then
  return
end
vim.g.loaded_shareedit = 1

local denops_notify = require('vicode').denops_notify
local augroup_name = 'ShareEdit' -- Define augroup name globally

local function sync_cursor_position()
  local current_mode = vim.fn.mode()
  if current_mode ~= 'v' and current_mode ~= 'V' and current_mode ~= 'i' and current_mode ~= 'I' then
    denops_notify("syncCursorPos")
  end
end

local function sync_visual_selection()
  local current_mode = vim.fn.mode()
  if current_mode == 'v' or current_mode == 'V' then
    local start_pos = vim.fn.getpos("v")
    local end_pos = vim.fn.getpos(".")
    denops_notify("syncSelectionPos", { start_pos[2], start_pos[3], end_pos[2], end_pos[3] + 1 })
  end
end

vim.api.nvim_create_user_command('ShareEditStart', function()
  print("ShareEdit: Starting WebSocket server and registering autocommands...")
  -- Create augroup and register autocommands here
  vim.api.nvim_create_augroup(augroup_name, { clear = true })
  vim.api.nvim_create_autocmd({ "CursorMoved", "VimResized" }, {
    group = augroup_name,
    pattern = "*",
    callback = sync_visual_selection
  })
  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorHold", "InsertLeave" }, {
    group = augroup_name,
    pattern = "*",
    callback = sync_cursor_position
  })
  -- Also add TextChanged if needed later
  -- vim.api.nvim_create_autocmd({ "TextChanged", "TextChangedI" }, {
  --   group = augroup_name,
  --   pattern = "*",
  --   callback = function() denops_notify("syncText") end
  -- })

  local vicode = require('vicode')
  vicode.wait_for_denops_and_notify(
    "start",
    10, -- max_attempts
    500 -- attempt_interval (ms)
  )
end, {})

vim.api.nvim_create_user_command('ShareEditStop', function()
  print("ShareEdit: Stopping WebSocket server and removing autocommands...")
  local vicode = require('vicode')
  vicode.wait_for_denops_and_notify(
    "stop",
    5, -- max_attempts
    300 -- attempt_interval (ms)
  )
  -- Remove autocommands here
  vim.api.nvim_clear_autocmds({ group = augroup_name })
  print("ShareEdit: Autocommands removed.")
end, {})

print("Vicode Lua plugin loaded")
