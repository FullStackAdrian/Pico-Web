import { requestScriptsList } from "../services/getScriptsListService.js";

export async function getScriptList() {
  try {
    const files = await requestScriptsList();
    if (!files) {
      throw new Error("No scripts found by the server");
    }
    return files;
  } catch (error) {
    throw error;
  }
}
