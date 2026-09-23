import crypto from "crypto";
import { buildNormalizedError } from "../aiProvider.js";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

function buildGeminiEndpoint({ apiKey, model }) {
  const escapedModel = String(model || "").replace(/\//g, ":"); // gemini-3.7-flash
  return GEMINI_ENDPOINT.replace("{model}", encodeURIComponent(escapedModel)).replace("{apiKey}", encodeURIComponent(apiKey));
}

function normalizeGeminiFinishReason(reason) {
  const lower = String(reason || "").toLowerCase();
  if (lower === "stop" || lower === "finish_reason_stop") return "stop";
  if (lower === "max_tokens") return "length";
  if (lower === "safety" || lower === "recitation" || lower === "blocklist") return "content_filter";
  if (lower === "tool_use" || lower === "function_call") return "tool_use";
  return String(reason || "stop").toLowerCase();
}

function convertToolToGemini(tool) {
  if (!tool || tool.type !== "function" || !tool.function) return null;
  const fn = tool.function;
  const declaration = {
    name: String(fn.name || "").trim(),
    description: String(fn.description || "").trim(),
    parameters: fn.parameters || { type: "object", properties: {} },
  };
  return { functionDeclarations: [declaration] };
}

function convertToolsToGemini(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const declarations = [];
  for (const tool of tools) {
    const converted = convertToolToGemini(tool);
    if (converted && converted.functionDeclarations && converted.functionDeclarations[0]) {
      declarations.push(converted.functionDeclarations[0]);
    }
  }
  if (declarations.length === 0) return null;
  return { functionDeclarations: declarations };
}

function convertMessagesToGeminiContents(messages, systemInstruction) {
  const contents = [];
  if (typeof systemInstruction === "string" && systemInstruction.trim()) {
    contents.push({
      role: "user",
      parts: [{ text: systemInstruction.trim() }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood." }],
    });
  }
  for (const message of messages || []) {
    const role = String(message.role || "").trim();
    if (role === "tool") {
      continue;
    }
    if (role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const parts = [];
      if (typeof message.content === "string" && message.content.trim()) {
        parts.push({ text: message.content.trim() });
      }
      for (const toolCall of message.tool_calls) {
        const fn = toolCall.function || {};
        let args = {};
        try {
          args = JSON.parse(fn.arguments || "{}");
        } catch {
          args = {};
        }
        parts.push({
          functionCall: {
            name: String(fn.name || "").trim(),
            args,
          },
        });
      }
      contents.push({ role: "model", parts });
    } else if (role === "user" || role === "model" || role === "system") {
      const text = typeof message.content === "string" ? message.content.trim() : "";
      if (text) {
        contents.push({ role: role === "system" ? "user" : role, parts: [{ text }] });
      }
    }
  }
  return contents;
}

function convertToolResultsToGeminiParts(toolResults) {
  const parts = [];
  for (const result of toolResults || []) {
    const name = String(result.tool || result.name || "").trim();
    const responseContent = typeof result.content === "string" ? result.content : JSON.stringify(result.content || result);
    parts.push({
      functionResponse: {
        name,
        response: { result: responseContent },
      },
    });
  }
  return parts;
}

function parseGeminiCandidate(candidate) {
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  let text = "";
  const toolCalls = [];
  for (const part of parts) {
    if (typeof part.text === "string") {
      text += part.text;
    }
    if (part.functionCall) {
      toolCalls.push({
        id: `gemini_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
        type: "function",
        function: {
          name: String(part.functionCall.name || "").trim(),
          arguments: JSON.stringify(part.functionCall.args || {}),
        },
      });
    }
  }
  return {
    text: text.trim(),
    toolCalls,
    finishReason: normalizeGeminiFinishReason(candidate?.finishReason),
  };
}

export class GeminiProvider {
  constructor({ apiKey, model }) {
    this.provider = "gemini";
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete({
    systemInstruction,
    messages,
    temperature = 0.2,
    maxOutputTokens = 900,
    timeoutMs = 15000,
    tools = null,
    toolChoice = null,
    telemetryContext = {},
  }) {
    const requestStartedAt = Date.now();
    const providerRequestId = `gemini_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;

    if (!this.apiKey) {
      const error = buildNormalizedError({
        category: "auth",
        message: "Gemini API key is not configured",
        code: "GEMINI_AI_NOT_CONFIGURED",
        status: null,
        provider: this.provider,
      });
      error.cause = { providerRequestId, totalMs: Date.now() - requestStartedAt };
      throw error;
    }

    const contents = convertMessagesToGeminiContents(messages, systemInstruction);
    const geminiTools = convertToolsToGemini(tools);

    const requestBody = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    };

    if (geminiTools) {
      requestBody.tools = [geminiTools];
    }

    const toolChoiceValue = typeof toolChoice === "string" ? toolChoice : toolChoice?.type;
    if (toolChoiceValue === "required" || toolChoiceValue === "auto") {
      requestBody.toolConfig = {
        functionCallingConfig: {
          mode: toolChoiceValue === "required" ? "ANY" : "AUTO",
        },
      };
    } else if (toolChoiceValue === "none" || (!tools && !toolChoice)) {
      requestBody.toolConfig = {
        functionCallingConfig: {
          mode: "NONE",
        },
      };
    }

    const effectiveTimeoutMs = Math.max(3000, timeoutMs);
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
      try {
        const modelStart = Date.now();
        const endpoint = buildGeminiEndpoint({ apiKey: this.apiKey, model: this.model });
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const firstByteMs = Date.now() - modelStart;
        const totalMs = Date.now() - requestStartedAt;

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          const errorMessage = String(errorBody || `HTTP ${response.status}`);
          const category =
            response.status === 429
              ? "rate_limit"
              : response.status === 401 || response.status === 403
                ? "auth"
                : response.status === 404
                  ? "malformed_response"
                  : "server";
          const error = buildNormalizedError({
            category,
            message: `Gemini provider request failed with status ${response.status}`,
            code: `GEMINI_AI_${category.toUpperCase()}`,
            status: response.status,
            provider: this.provider,
          });
          error.cause = { body: errorBody, providerRequestId, firstByteMs, totalMs };
          throw error;
        }

        const payload = await response.json();
        const candidate = payload?.candidates?.[0];
        if (!candidate) {
          const error = buildNormalizedError({
            category: "malformed_response",
            message: "Gemini provider returned no candidates",
            code: "GEMINI_AI_EMPTY_RESPONSE",
            status: null,
            provider: this.provider,
          });
          error.cause = { providerRequestId, firstByteMs, totalMs, payload };
          throw error;
        }

        const { text, toolCalls, finishReason } = parseGeminiCandidate(candidate);
        const usage = payload?.usageMetadata || {};
        const promptTokens = Number(usage?.promptTokenCount || 0);
        const outputTokens = Number(usage?.candidatesTokenCount || usage?.totalTokenCount || 0);
        const totalTokens = Number(usage?.totalTokenCount || promptTokens + outputTokens);

        if (!text && toolCalls.length === 0 && finishReason === "stop") {
          const error = buildNormalizedError({
            category: "malformed_response",
            message: "Gemini provider returned an empty response",
            code: "GEMINI_AI_EMPTY_RESPONSE",
            status: null,
            provider: this.provider,
          });
          error.cause = { providerRequestId, firstByteMs, totalMs, payload };
          throw error;
        }

        return {
          content: text,
          toolCalls,
          finishReason,
          usage: { promptTokens, outputTokens, totalTokens },
          providerRequestId,
          timing: { totalMs, firstByteMs },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error?.category) {
        throw error;
      }
      if (error?.name === "AbortError") {
        const timeoutError = buildNormalizedError({
          category: "timeout",
          message: `Gemini provider did not respond within ${effectiveTimeoutMs} ms`,
          code: "GEMINI_AI_TIMEOUT",
          status: null,
          provider: this.provider,
        });
        timeoutError.cause = { providerRequestId, totalMs: Date.now() - requestStartedAt };
        throw timeoutError;
      }
      const statusCode = Number(error?.status || error?.response?.status || error?.code || 0);
      const errorMessage = String(error?.message || error || "");
      const category = /timed out|abort|timeout/i.test(errorMessage)
        ? "timeout"
        : /ECONNRESET|ECONNREFUSED|network|fetch/i.test(errorMessage)
          ? "connection"
          : /401|403|auth|unauthorized/i.test(errorMessage)
            ? "auth"
            : statusCode === 429 || /quota|rate|429/i.test(errorMessage)
              ? "rate_limit"
              : /malformed|invalid|parse/i.test(errorMessage)
                ? "malformed_response"
                : "network";
      const normalizedError = buildNormalizedError({
        category,
        message: errorMessage.slice(0, 500),
        code: error?.code || `GEMINI_AI_${category.toUpperCase()}`,
        status: Number.isFinite(statusCode) && statusCode > 0 ? statusCode : null,
        provider: this.provider,
      });
      normalizedError.cause = { providerRequestId, totalMs: Date.now() - requestStartedAt, raw: error };
      throw normalizedError;
    }
  }
}
