import { Denops } from "jsr:@denops/std";
import { ensure, is } from "jsr:@core/unknownutil";
export const ensureString = (arg: unknown): string => ensure(arg, is.String);
import type { EnvironmentAdapter } from "../../shared/adapters/environment.ts"; // Adjusted import path

export class DenoAdapter implements EnvironmentAdapter {
  constructor(private denops: Denops) {}

  async getCurrentPath(): Promise<string> {
    return ensureString(await this.denops.call("expand", "%:p"));
  }

  // Implement other methods later
}
