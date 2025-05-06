/**
 * Environment adapter interface for abstracting environment-specific operations
 * This allows code to run in both VSCode and Denops environments
 */
export interface EnvironmentAdapter {
  /**
   * Get the current file path
   */
  getCurrentPath(): Promise<string> | string;

  /**
   * Get the current cursor line (1-based)
   */
  getCurrentLine(): Promise<number> | number;

  /**
   * Get the current cursor column (1-based)
   */
  getCurrentCol(): Promise<number> | number;

  /**
   * Get the last line number of the current buffer (1-based)
   */
  getLastLine(): Promise<number> | number;

  /**
   * Get the length of a specific line
   */
  getSpecificLineLength(line: number): Promise<number> | number;

  /**
   * Get the text content of the current buffer
   */
  getCurrentText(): Promise<string> | string;
}
