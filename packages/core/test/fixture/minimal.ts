// Test fixture for @assert minimal / pass-through detection

interface ApiOptions {
  model: string;
  temp: number;
  repeatPenalty: number;
}

// This function has pass-through params: options.model, options.temp, options.repeatPenalty
// are only forwarded to callAPI
/** @assert minimal */
function generateResponse(messages: string[], options: ApiOptions): string {
  const prompt = buildPrompt(messages);
  const response = callAPI(prompt, options.model, options.temp, options.repeatPenalty);
  return parseResponse(response);
}

// This function uses all its params directly — no pass-through
function buildPrompt(messages: string[]): string {
  return messages.join("\n");
}

// This function is pure pass-through: all params forwarded
function wrapper(a: number, b: number): number {
  return add(a, b);
}

// This function uses its param for logic — not pass-through
function double(x: number): number {
  return x * 2;
}

// This function uses some params and forwards others
function mixed(data: string, format: string, verbose: boolean): string {
  if (verbose) {
    console.log(data);
  }
  return transform(data, format);
}

// Helpers (stubs)
declare function callAPI(prompt: string, model: string, temp: number, penalty: number): string;
declare function parseResponse(raw: string): string;
declare function add(a: number, b: number): number;
declare function transform(data: string, format: string): string;
