import type { ToolDefinition } from "../model/types.js";

export type ToolArguments = Record<string, unknown>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateToolArguments(
  definition: ToolDefinition,
  input: unknown,
): ValidationResult {
  const errors: string[] = [];

  // Confirms input is not null, not array object (just a plain json object)
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      errors: ["Arguments must be a JSON object."],
    };
  }

  const args = input as Record<string, unknown>;
  const properties = definition.parameters.properties;
  const required = definition.parameters.required ?? [];

  // verifying that all property names declared in properties variables are present on the inut object using object.hasown(args, key) 
  for (const key of required) {
    if (!Object.hasOwn(args, key)) {
      errors.push(`Missing required argument: "${key}".`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    if (!(key in properties)) {
      errors.push(`Unexpected argument: "${key}".`);
      continue;
    }

    const schema = properties[key];

    if (
      schema === null ||
      typeof schema !== "object" ||
      Array.isArray(schema)
    ) {
      errors.push(`invalid schema and argument: "${key}"`);
      continue;
    }

    const expectedType = (schema as { type?: unknown }).type;

    if (expectedType === "string" && typeof value !== "string") {
      errors.push(`Argument "${key}" must be a string.`);
    } else if (
      expectedType === "number" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      errors.push(`Argument "${key}" must be a finite number.`);
    } else if (expectedType === "boolean" && typeof value !== "boolean") {
      errors.push(`Argument "${key}" must be a boolean.`);
    }
  }


  for (const key of ["path", "query"]) {
    const value = args[key];

    if (typeof value === "string" && value.trim().length === 0){
      if (key === "query"){
        errors.push('Argument "query" must not be empty.');
      }
    }
  }
  
    return {
    valid: errors.length === 0,
    errors,
  };
}