interface SessionInfo {
  port: number;
  directory: string;
  timestamp: number;
}

export function getConfigDir(): string {
  const platform = Deno.build.os;

  if (platform === "windows") {
    // Windows: %APPDATA%\vicode
    const appData = Deno.env.get("APPDATA");
    if (!appData) throw new Error("APPDATA environment variable not found");
    return `${appData}\\vicode`;
  } else {
    // Unix-like (Linux/macOS): ~/.config/vicode
    const homeDir = Deno.env.get("HOME");
    if (!homeDir) throw new Error("HOME environment variable not found");
    return `${homeDir}/.config/vicode`;
  }
}

export async function ensureConfigDir(): Promise<void> {
  const configDir = getConfigDir();
  console.log(`Vicode: Ensuring config directory exists: ${configDir}`);
  try {
    await Deno.mkdir(configDir, { recursive: true });

    // 验证目录是否已创建
    try {
      const dirInfo = await Deno.stat(configDir);
      if (dirInfo.isDirectory) {
        console.log(`Vicode: Config directory verified: ${configDir}`);
      } else {
        console.error(`Vicode: Path exists but is not a directory: ${configDir}`);
      }
    } catch (statError) {
      console.error(`Vicode: Failed to verify config directory: ${statError}`);
    }
  } catch (error) {
    console.error("Vicode: Failed to create config directory:", error);
  }
}

export async function saveSession(port: number): Promise<void> {
  console.log(`Vicode: Saving session for port ${port}...`);

  try {
    // 确保配置目录存在
    await ensureConfigDir();
    const configDir = getConfigDir();
    let vicodeFile = `${configDir}/sessions.json`; // 使用let而不是const，因为可能会更改
    const currentDir = Deno.cwd();
    console.log(`Vicode: Current directory: ${currentDir}`);
    console.log(`Vicode: Session file path: ${vicodeFile}`);

    // 检查配置目录是否可写
    try {
      // 尝试创建一个临时文件来测试写入权限
      const testFile = `${configDir}/test_write_permission.tmp`;
      Deno.writeTextFileSync(testFile, "test");
      Deno.removeSync(testFile);
      console.log(`Vicode: Config directory is writable: ${configDir}`);
    } catch (permError) {
      console.error(`Vicode: Config directory is not writable: ${configDir}`, permError);
      // 尝试使用临时目录作为备用
      try {
        const tempDir = Deno.makeTempDirSync({ prefix: "vicode_" });
        console.log(`Vicode: Using temporary directory instead: ${tempDir}`);
        // 更新配置文件路径
        vicodeFile = `${tempDir}/sessions.json`; // 更新变量而不是重新声明
      } catch (tempDirError) {
        console.error(`Vicode: Failed to create temporary directory:`, tempDirError);
        throw new Error("Cannot create writable directory for session information");
      }
    }

    // 读取现有会话
    let sessions: SessionInfo[] = [];
    try {
      console.log(`Vicode: Checking if sessions file exists...`);
      const fileInfo = await Deno.stat(vicodeFile);
      console.log(`Vicode: Sessions file exists, size: ${fileInfo.size} bytes`);

      console.log(`Vicode: Reading existing sessions...`);
      const content = await Deno.readTextFile(vicodeFile);
      console.log(`Vicode: File content length: ${content.length}`);

      try {
        sessions = JSON.parse(content);
        console.log(`Vicode: Successfully parsed ${sessions.length} existing sessions`);
      } catch (parseError) {
        console.error(`Vicode: Failed to parse sessions JSON: ${parseError}`);
        console.log(`Vicode: Content sample: ${content.substring(0, 100)}...`);
        // If JSON parse fails, start with empty array
        sessions = [];
      }
    } catch (fileError) {
      console.log(`Vicode: Sessions file does not exist or cannot be read: ${fileError}`);
      // If file doesn't exist or is invalid, start with empty array
    }

    // 创建新会话
    const newSession: SessionInfo = {
      port,
      directory: currentDir,
      timestamp: Date.now(),
    };
    console.log(`Vicode: Created new session: ${JSON.stringify(newSession)}`);

    // 添加新会话并写入文件
    sessions.push(newSession);
    console.log(`Vicode: Writing ${sessions.length} sessions to file...`);

    // 使用原子写入方式
    try {
      // 先写入临时文件
      const tempFile = `${vicodeFile}.tmp`;
      await Deno.writeTextFile(tempFile, JSON.stringify(sessions, null, 2));

      // 然后重命名临时文件（原子操作）
      try {
        await Deno.rename(tempFile, vicodeFile);
        console.log(`Vicode: Successfully wrote sessions to ${vicodeFile}`);
      } catch (renameError) {
        console.error(`Vicode: Failed to rename temp file: ${renameError}`);
        // 如果重命名失败，尝试直接写入
        await Deno.writeTextFile(vicodeFile, JSON.stringify(sessions, null, 2));
        console.log(`Vicode: Directly wrote sessions to ${vicodeFile}`);
      }

      // 验证文件是否已创建
      try {
        const fileInfo = await Deno.stat(vicodeFile);
        console.log(`Vicode: Verified sessions file: ${vicodeFile}, size: ${fileInfo.size} bytes`);
      } catch (statError) {
        console.error(`Vicode: Failed to verify sessions file: ${statError}`);
        throw statError;
      }
    } catch (writeError) {
      console.error(`Vicode: Failed to write sessions file: ${writeError}`);
      throw writeError;
    }
  } catch (error) {
    console.error("Vicode: Failed to write session info:", error);
    throw error; // 重新抛出错误，让调用者知道发生了问题
  }
}

export async function cleanupSessions(): Promise<void> {
  console.log("Vicode: Cleaning up sessions...");
  await ensureConfigDir();
  const configDir = getConfigDir();
  const vicodeFile = `${configDir}/sessions.json`;
  console.log(`Vicode: Sessions file path: ${vicodeFile}`);

  try {
    // Read existing sessions
    console.log("Vicode: Reading existing sessions file...");
    const content = await Deno.readTextFile(vicodeFile);
    console.log(`Vicode: Sessions file content length: ${content.length}`);

    let sessions: SessionInfo[] = [];
    try {
      sessions = JSON.parse(content);
      console.log(`Vicode: Successfully parsed ${sessions.length} sessions`);
    } catch (parseError) {
      console.error(`Vicode: Failed to parse sessions JSON: ${parseError}`);
      // If JSON parse fails, start with empty array
      sessions = [];
    }

    const validSessions: SessionInfo[] = [];
    console.log(`Vicode: Checking ${sessions.length} sessions for validity...`);

    // Check each session
    for (const session of sessions) {
      try {
        console.log(`Vicode: Checking session on port ${session.port}...`);
        // Try to create a WebSocket connection to test if port is in use
        const ws = new WebSocket(`ws://127.0.0.1:${session.port}`);
        await new Promise((resolve, reject) => {
          ws.onopen = () => {
            console.log(`Vicode: Port ${session.port} is active`);
            ws.close();
            resolve(true);
          };
          ws.onerror = () => {
            console.log(`Vicode: Port ${session.port} is not active`);
            ws.close();
            reject();
          };
        });
        // Port is in use, keep this session
        validSessions.push(session);
        console.log(`Vicode: Keeping session on port ${session.port}`);
      } catch {
        console.log(`Vicode: Removing inactive session on port ${session.port}`);
        // Port is not in use, skip this session
      }
    }

    console.log(`Vicode: Writing ${validSessions.length} valid sessions back to file...`);
    // Write back valid sessions
    try {
      await Deno.writeTextFile(
        vicodeFile,
        JSON.stringify(validSessions, null, 2),
      );
      console.log("Vicode: Successfully wrote valid sessions to file");
    } catch (writeError) {
      console.error(`Vicode: Failed to write valid sessions: ${writeError}`);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error("Vicode: Error cleaning up sessions:", error);
    } else {
      console.log("Vicode: No sessions file found, nothing to clean up");
    }
  }
}
