import { requestScriptText } from "../services/getScriptTextService.js";

export function getScriptText(filename) {
  try {
    const scriptDataText = requestScriptText(filename);
    return scriptDataText;
  } catch (error) {
    throw error;
  }
}