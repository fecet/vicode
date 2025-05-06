import { Denops } from "jsr:@denops/std";
import { ensure, is } from "jsr:@core/unknownutil";
import type { EnvironmentAdapter } from "../../shared/adapters/environment.ts";

// Helper functions for type safety
const ensureString = (arg: unknown): string => ensure(arg, is.String);
const ensureNumber = (arg: unknown): number => ensure(arg, is.Number);

/**
 * Denops environment adapter implementation
 * Provides access to Neovim/Vim environment through Denops
 */
export class DenoAdapter implements EnvironmentAdapter {
  constructor(private denops: Denops) {}

  /**
   * Get the current file path
   */
  async getCurrentPath(): Promise<string> {
    return ensureString(await this.denops.call("expand", "%:p"));
  }

  /**
   * Get the current cursor line (1-based)
   */
  async getCurrentLine(): Promise<number> {
    return ensureNumber(await this.denops.call("line", "."));
  }

  /**
   * Get the current cursor column (1-based)
   */
  async getCurrentCol(): Promise<number> {
    return ensureNumber(
      await this.denops.call(
        "strcharlen",
        await this.denops.call(
          "strpart",
          await this.denops.call("getline", "."),
          0,
          ensureNumber(await this.denops.call("col", ".")) - 1,
        ),
      ),
    ) + 1;
  }

  /**
   * Get the last line number of the current buffer (1-based)
   */
  async getLastLine(): Promise<number> {
    return ensureNumber(await this.denops.call("line", "$"));
  }

  /**
   * Get the length of a specific line
   */
  async getSpecificLineLength(line: number): Promise<number> {
    return ensureNumber(
      await this.denops.call("strcharlen", await this.denops.call("getline", line)),
    );
  }

  /**
   * Get the text content of the current buffer
   */
  async getCurrentText(): Promise<string> {
    return ensureString(await this.denops.call("getline", ".", "$"));
  }
}
