interface SessionInfo {
  port: number;
  directory: string;
  timestamp: number;
}

export function getConfigDir(): string {
  const platform = Deno.build.os;

  if (platform === "windows") {
    // Windows: %APPDATA%\shareedit
    const appData = Deno.env.get("APPDATA");
    if (!appData) throw new Error("APPDATA environment variable not found");
    return `${appData}\\shareedit`;
  } else {
    // Unix-like (Linux/macOS): ~/.config/shareedit
    const homeDir = Deno.env.get("HOME");
    if (!homeDir) throw new Error("HOME environment variable not found");
    return `${homeDir}/.config/shareedit`;
  }
}

export async function ensureConfigDir(): Promise<void> {
  const configDir = getConfigDir();
  console.log(`ShareEdit: Ensuring config directory exists: ${configDir}`);
  try {
    await Deno.mkdir(configDir, { recursive: true });

    // 验证目录是否已创建
    try {
      const dirInfo = await Deno.stat(configDir);
      if (dirInfo.isDirectory) {
        console.log(`ShareEdit: Config directory verified: ${configDir}`);
      } else {
        console.error(`ShareEdit: Path exists but is not a directory: ${configDir}`);
      }
    } catch (statError) {
      console.error(`ShareEdit: Failed to verify config directory: ${statError}`);
    }
  } catch (error) {
    console.error("ShareEdit: Failed to create config directory:", error);
  }
}

export async function saveSession(port: number): Promise<void> {
  console.log(`ShareEdit: Saving session for port ${port}...`);

  try {
    // 确保配置目录存在
    await ensureConfigDir();
    const configDir = getConfigDir();
    let shareEditFile = `${configDir}/sessions.json`; // 使用let而不是const，因为可能会更改
    const currentDir = Deno.cwd();
    console.log(`ShareEdit: Current directory: ${currentDir}`);
    console.log(`ShareEdit: Session file path: ${shareEditFile}`);

    // 检查配置目录是否可写
    try {
      // 尝试创建一个临时文件来测试写入权限
      const testFile = `${configDir}/test_write_permission.tmp`;
      Deno.writeTextFileSync(testFile, "test");
      Deno.removeSync(testFile);
      console.log(`ShareEdit: Config directory is writable: ${configDir}`);
    } catch (permError) {
      console.error(`ShareEdit: Config directory is not writable: ${configDir}`, permError);
      // 尝试使用临时目录作为备用
      try {
        const tempDir = Deno.makeTempDirSync({ prefix: "shareedit_" });
        console.log(`ShareEdit: Using temporary directory instead: ${tempDir}`);
        // 更新配置文件路径
        shareEditFile = `${tempDir}/sessions.json`; // 更新变量而不是重新声明
      } catch (tempDirError) {
        console.error(`ShareEdit: Failed to create temporary directory:`, tempDirError);
        throw new Error("Cannot create writable directory for session information");
      }
    }

    // 读取现有会话
    let sessions: SessionInfo[] = [];
    try {
      console.log(`ShareEdit: Checking if sessions file exists...`);
      const fileInfo = await Deno.stat(shareEditFile);
      console.log(`ShareEdit: Sessions file exists, size: ${fileInfo.size} bytes`);

      console.log(`ShareEdit: Reading existing sessions...`);
      const content = await Deno.readTextFile(shareEditFile);
      console.log(`ShareEdit: File content length: ${content.length}`);

      try {
        sessions = JSON.parse(content);
        console.log(`ShareEdit: Successfully parsed ${sessions.length} existing sessions`);
      } catch (parseError) {
        console.error(`ShareEdit: Failed to parse sessions JSON: ${parseError}`);
        console.log(`ShareEdit: Content sample: ${content.substring(0, 100)}...`);
        // If JSON parse fails, start with empty array
        sessions = [];
      }
    } catch (fileError) {
      console.log(`ShareEdit: Sessions file does not exist or cannot be read: ${fileError}`);
      // If file doesn't exist or is invalid, start with empty array
    }

    // 创建新会话
    const newSession: SessionInfo = {
      port,
      directory: currentDir,
      timestamp: Date.now(),
    };
    console.log(`ShareEdit: Created new session: ${JSON.stringify(newSession)}`);

    // 添加新会话并写入文件
    sessions.push(newSession);
    console.log(`ShareEdit: Writing ${sessions.length} sessions to file...`);

    // 使用原子写入方式
    try {
      // 先写入临时文件
      const tempFile = `${shareEditFile}.tmp`;
      await Deno.writeTextFile(tempFile, JSON.stringify(sessions, null, 2));

      // 然后重命名临时文件（原子操作）
      try {
        await Deno.rename(tempFile, shareEditFile);
        console.log(`ShareEdit: Successfully wrote sessions to ${shareEditFile}`);
      } catch (renameError) {
        console.error(`ShareEdit: Failed to rename temp file: ${renameError}`);
        // 如果重命名失败，尝试直接写入
        await Deno.writeTextFile(shareEditFile, JSON.stringify(sessions, null, 2));
        console.log(`ShareEdit: Directly wrote sessions to ${shareEditFile}`);
      }

      // 验证文件是否已创建
      try {
        const fileInfo = await Deno.stat(shareEditFile);
        console.log(`ShareEdit: Verified sessions file: ${shareEditFile}, size: ${fileInfo.size} bytes`);
      } catch (statError) {
        console.error(`ShareEdit: Failed to verify sessions file: ${statError}`);
        throw statError;
      }
    } catch (writeError) {
      console.error(`ShareEdit: Failed to write sessions file: ${writeError}`);
      throw writeError;
    }
  } catch (error) {
    console.error("ShareEdit: Failed to write session info:", error);
    throw error; // 重新抛出错误，让调用者知道发生了问题
  }
}

export async function cleanupSessions(): Promise<void> {
  console.log("ShareEdit: Cleaning up sessions...");
  await ensureConfigDir();
  const configDir = getConfigDir();
  const shareEditFile = `${configDir}/sessions.json`;
  console.log(`ShareEdit: Sessions file path: ${shareEditFile}`);

  try {
    // Read existing sessions
    console.log("ShareEdit: Reading existing sessions file...");
    const content = await Deno.readTextFile(shareEditFile);
    console.log(`ShareEdit: Sessions file content length: ${content.length}`);

    let sessions: SessionInfo[] = [];
    try {
      sessions = JSON.parse(content);
      console.log(`ShareEdit: Successfully parsed ${sessions.length} sessions`);
    } catch (parseError) {
      console.error(`ShareEdit: Failed to parse sessions JSON: ${parseError}`);
      // If JSON parse fails, start with empty array
      sessions = [];
    }

    const validSessions: SessionInfo[] = [];
    console.log(`ShareEdit: Checking ${sessions.length} sessions for validity...`);

    // Check each session
    for (const session of sessions) {
      try {
        console.log(`ShareEdit: Checking session on port ${session.port}...`);
        // Try to create a WebSocket connection to test if port is in use
        const ws = new WebSocket(`ws://127.0.0.1:${session.port}`);
        await new Promise((resolve, reject) => {
          ws.onopen = () => {
            console.log(`ShareEdit: Port ${session.port} is active`);
            ws.close();
            resolve(true);
          };
          ws.onerror = () => {
            console.log(`ShareEdit: Port ${session.port} is not active`);
            ws.close();
            reject();
          };
        });
        // Port is in use, keep this session
        validSessions.push(session);
        console.log(`ShareEdit: Keeping session on port ${session.port}`);
      } catch {
        console.log(`ShareEdit: Removing inactive session on port ${session.port}`);
        // Port is not in use, skip this session
      }
    }

    console.log(`ShareEdit: Writing ${validSessions.length} valid sessions back to file...`);
    // Write back valid sessions
    try {
      await Deno.writeTextFile(
        shareEditFile,
        JSON.stringify(validSessions, null, 2),
      );
      console.log("ShareEdit: Successfully wrote valid sessions to file");
    } catch (writeError) {
      console.error(`ShareEdit: Failed to write valid sessions: ${writeError}`);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error("ShareEdit: Error cleaning up sessions:", error);
    } else {
      console.log("ShareEdit: No sessions file found, nothing to clean up");
    }
  }
}
