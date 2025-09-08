import { getScriptText } from "../services/getScriptTextService.js";

export function executeScript(filename) {
  try {
    const scriptDataText = getScriptText(filename);
    return scriptDataText;
  } catch (error) {}
}