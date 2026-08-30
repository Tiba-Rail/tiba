export {};
type JsonSchema = Record<string, unknown>;
export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<string> | string;
}
export interface ModelContext {
  registerTool(tool: WebMCPTool): Promise<void> | void;
  unregisterTool?(name: string): Promise<void> | void;
}
declare global {
  interface Document { modelContext?: ModelContext; }
}