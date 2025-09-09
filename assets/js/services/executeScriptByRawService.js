import { pico } from "../utils/pico.js";

export async function requestExecuteScriptByRaw(segmentedScriptText) {
  try {
    const response = await pico.post(segmentedScriptText);
    return response;
  } catch (error) {
    throw error;
  }
}
