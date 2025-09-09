import { requestExecuteScriptByURL } from "../services/executeScriptByURLService.js";

export async function executeScriptByURL(scriptText) {
  try {
    if (!scriptText) {
      throw new Error("ScriptText is required");
    }
    const encodedURLScriptText = encodeURIComponent(scriptText);
    const response = await requestExecuteScriptByURL(encodedURLScriptText);
    return response;
  } catch (error) {}
}