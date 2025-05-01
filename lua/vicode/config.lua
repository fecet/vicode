local M = {}

-- Default configuration
M.defaults = {
  -- Server configuration
  server = {
    host = "localhost",
    -- port will be dynamically assigned
  },
  
  -- Connection settings
  connection = {
    max_attempts = 10,       -- Maximum number of attempts to connect to denops
    attempt_interval = 500,  -- Interval between connection attempts (ms)
  },
  
  -- Command execution settings
  command = {
    default_timeout = 5000,  -- Default timeout for synchronous commands (ms)
  },
  
  -- VSCode launch settings
  vscode = {
    force_new = true,        -- Force new VSCode window
    executable = "code", -- VSCode executable to use
  },
  
  -- Debug settings
  debug = {
    log_level = vim.log.levels.WARN, -- Default log level
  },
}

-- The active configuration (will be populated in setup)
M.options = {}

-- Setup function to initialize the configuration
function M.setup(opts)
  -- Merge user options with defaults
  M.options = vim.tbl_deep_extend("force", {}, M.defaults, opts or {})
  
  -- Return the merged options
  return M.options
end

return M
