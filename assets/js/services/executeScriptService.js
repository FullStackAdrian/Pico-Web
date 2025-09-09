import { pico } from "../utils/pico.js";

export async function executeScript(encodedURLScriptText) {
  try {
    const response = await pico.get(encodedURLScriptText);
    return response;
  } catch (error) {
    throw error;
  }
}