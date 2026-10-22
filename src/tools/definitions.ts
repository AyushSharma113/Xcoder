
import type { ToolDefinition } from "../model/types.js";

export const listFilesTool: ToolDefinition = {
  name: "list_files",
  description:
    "List files and directories within the configured workspace. Use this to understand the project structure before inspecting files.",
  parameters: {
    type: "object",
    // tells the model which arguments each tool accepts
    properties: {
      path: {
        type: "string",
        description:
          "Relative directory path inside the workspace. Use '.' for the workspace root.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
};

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read the contents of an eligible file within the configured workspace. Use this to inspect source code and understand its implementation.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative file path inside the workspace.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
};

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description:
    "Search eligible source files within the configured workspace for a text or string pattern.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The text to search for. Must not be empty.",
      },
      path: {
        type: "string",
        description:
          "Optional relative directory path inside the workspace. Defaults to the workspace root.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export const filesystemTools: ToolDefinition[] = [
  listFilesTool,
  readFileTool,
  searchFilesTool,
];
