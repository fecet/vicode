local M = {}

-- Default configuration
M.defaults = {
  -- Server configuration
  server = {
    host = "localhost",
    -- Port will be dynamically assigned
  },

  -- Connection settings
  connection = {
    max_attempts = 20,       -- Maximum connection attempts to denops
    attempt_interval = 200,  -- Interval between attempts (ms)
  },

  -- Command execution settings
  command = {
    default_timeout = 5000,  -- Default timeout for sync commands (ms)
  },

  -- VSCode launch settings
  vscode = {
    force_new = true,        -- Force new VSCode window
    executable = "code",     -- VSCode executable path
  },

  -- Debug settings
  debug = {
    log_level = vim.log.levels.WARN, -- Default log level
  },
}

M.options = {}

-- Initialize configuration with user options
function M.setup(opts)
  M.options = vim.tbl_deep_extend("force", {}, M.defaults, opts or {})
  return M.options
end

return M
