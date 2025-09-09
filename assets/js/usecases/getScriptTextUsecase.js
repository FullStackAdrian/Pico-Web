import { requestScriptText } from "../services/getScriptTextService.js";

export function getScriptText(filename) {
  try {
    const scriptDataText = requestScriptText(filename);
    if (!scriptDataText) {
      throw new Error("No script text found");
    }
    return scriptDataText;
  } catch (error) {}
}