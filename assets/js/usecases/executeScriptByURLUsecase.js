import { requestExecuteScriptByURL } from "../services/executeScriptByURLService.js";

export async function executeScriptByURL(scriptText) {
  try {
    const encodedURLScriptText = encodeURIComponent(scriptText.content);
    const response = await requestExecuteScriptByURL(encodedURLScriptText);
    return response;
  } catch (error) {
    throw error;
  }
}