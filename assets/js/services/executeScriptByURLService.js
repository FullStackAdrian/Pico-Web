import pico from "../utils/pico.js";

export async function requestExecuteScriptByURL(encodedURLScriptText) {
  try {
    const response = await pico.get(encodedURLScriptText);
    console.log("Response from device:", response);
    if (!response || response === undefined) {
      throw new Error("No response from device");
    }
    return response;
  } catch (error) {
    throw error;
  }
}