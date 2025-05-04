export interface EnvironmentAdapter {
  getCurrentPath(): Promise<string> | string;
  // Add other common functions here later, e.g.:
  // getCurrentLine(): Promise<number> | number;
  // getCurrentCol(): Promise<number> | number;
  // getBufferText(startLine: number, endLine: number): Promise<string[]> | string[];
}
