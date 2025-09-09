import pico from "../utils/pico.js";

export async function requestExecuteScriptByURL(encodedURLScriptText) {
  try {
    const response = await pico.get(encodedURLScriptText);
    // if (!response) {
    //   throw new Error("No response from device");
    // }
    return response;
  } catch (error) {
    throw error;
  }
}