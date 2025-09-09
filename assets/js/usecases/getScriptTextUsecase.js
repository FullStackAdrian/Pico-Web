import { getScriptText } from "../services/getScriptTextService.js";

export function getScriptText(filename) {
  try {
    const scriptDataText = getScriptText(filename);
    return scriptDataText;
  } catch (error) {}
}