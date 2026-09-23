import crypto from "crypto";
import { buildNormalizedError } from "../aiProvider.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export class OpenAiProvider {
  constructor({ apiKey, model }) {
    this.provider = "openai";
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete({ systemInstruction, messages, temperature = 0.2, maxOutputTokens = 900, timeoutMs = 15000, tools = null, toolChoice = null, telemetryContext = {} }) {
    const requestStartedAt = Date.now();
    const providerRequestId = `openai_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;

    if (!this.apiKey) {
      const error = buildNormalizedError({
        category: "auth",
        message: "OpenAI API key is not configured",
        code: "OPENAI_AI_NOT_CONFIGURED",
        status: null,
        provider: this.provider,
      });
      error.cause = { providerRequestId, totalMs: Date.now() - requestStartedAt };
      throw error;
    }

    const apiMessages = [];
    if (typeof systemInstruction === "string" && systemInstruction.trim()) {
      apiMessages.push({ role: "system", content: systemInstruction.trim() });
    }
    const contents = (Array.isArray(messages) ? messages : [])
      .filter(
        (message) =>
          message &&
          ["user", "assistant", "system", "tool"].includes(
            String(message.role || ""),
          ) &&
          (message.role !== "tool" || String(message.tool_call_id || "").trim()),
      )
      .map((message) => {
        const base = { role: message.role };
        if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
          base.tool_calls = message.tool_calls;
          base.content = message.content;
        } else if (message.role === "tool") {
          base.tool_call_id = String(message.tool_call_id || "").trim();
          base.content = String(message.content || "").trim();
        } else {
          base.content = String(message.content || "").trim();
        }
        return base;
      });
    apiMessages.push(...contents);

    const requestBody = {
      model: this.model,
      messages: apiMessages,
      temperature,
      max_tokens: maxOutputTokens,
    };
    if (tools && Array.isArray(tools) && tools.length > 0) {
      requestBody.tools = tools;
    }
    if (toolChoice) {
      requestBody.tool_choice = toolChoice;
    } else if (tools && Array.isArray(tools) && tools.length > 0) {
      requestBody.tool_choice = "auto";
    }

    const effectiveTimeoutMs = Math.max(3000, timeoutMs);
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
      try {
        const modelStart = Date.now();
        response = await fetch(OPENAI_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const firstByteMs = Date.now() - modelStart;
        const totalMs = Date.now() - requestStartedAt;

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          const errorMessage = String(errorBody || `HTTP ${response.status}`);
          const error = buildNormalizedError({
            category: response.status === 429 ? "rate_limit" : response.status === 401 || response.status === 403 ? "auth" : response.status === 404 ? "malformed_response" : "server",
            message: `AI provider request failed with status ${response.status}`,
            code: response.status === 429 ? "OPENAI_AI_QUOTA" : response.status === 401 || response.status === 403 ? "OPENAI_AI_AUTH" : response.status === 404 ? "OPENAI_AI_MODEL_UNAVAILABLE" : "OPENAI_AI_REQUEST_FAILED",
            status: response.status,
            provider: this.provider,
          });
          error.cause = { body: errorBody, providerRequestId, firstByteMs, totalMs };
          throw error;
        }

        const payload = await response.json();
        const text = String(payload?.choices?.[0]?.message?.content || "").trim();
        const toolCalls = payload?.choices?.[0]?.message?.tool_calls || [];
        const finishReason = payload?.choices?.[0]?.finish_reason || "stop";
        const usage = payload?.usage || {};
        const promptTokens = Number(usage?.prompt_tokens || 0);
        const outputTokens = Number(usage?.completion_tokens || 0);
        const totalTokens = Number(usage?.total_tokens || promptTokens + outputTokens);

        if (!text && toolCalls.length === 0) {
          const error = buildNormalizedError({
            category: "malformed_response",
            message: "AI provider returned an empty response",
            code: "OPENAI_AI_EMPTY_RESPONSE",
            status: null,
            provider: this.provider,
          });
          error.cause = { providerRequestId, firstByteMs, totalMs };
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
          message: `AI provider did not respond within ${effectiveTimeoutMs} ms`,
          code: "OPENAI_AI_TIMEOUT",
          status: null,
          provider: this.provider,
        });
        timeoutError.cause = { providerRequestId, totalMs: Date.now() - requestStartedAt };
        throw timeoutError;
      }
      const statusCode = Number(error?.status || error?.response?.status || error?.code || 0);
      const errorMessage = String(error?.message || error || "");
      const category = /timed out|abort|timeout/i.test(errorMessage) ? "timeout" : /ECONNRESET|ECONNREFUSED|network|fetch/i.test(errorMessage) ? "connection" : /401|403|auth|unauthorized/i.test(errorMessage) ? "auth" : statusCode === 429 || /quota|rate|429/i.test(errorMessage) ? "rate_limit" : /malformed|invalid|parse/i.test(errorMessage) ? "malformed_response" : "network";
      const normalizedError = buildNormalizedError({
        category,
        message: errorMessage.slice(0, 500),
        code: error?.code || `OPENAI_AI_${category.toUpperCase()}`,
        status: Number.isFinite(statusCode) && statusCode > 0 ? statusCode : null,
        provider: this.provider,
      });
      normalizedError.cause = { providerRequestId, totalMs: Date.now() - requestStartedAt, raw: error };
      throw normalizedError;
    }
  }
}
