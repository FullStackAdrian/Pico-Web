import { executeScript } from "../services/executeScriptService";

export async function executeScript(encodedURLScriptText) {
  try {
    const response = await executeScript(encodedURLScriptText);
    return response;
  } catch (error) {}
}