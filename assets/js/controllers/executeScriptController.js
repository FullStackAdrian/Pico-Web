import { getScriptText } from "../usecases/getScriptTextUsecase.js";
import { executeScriptByURL } from "../usecases/executeScriptByURLUsecase.js";

export async function handleExecuteScript(filename) {
    try {  
        const scriptText = await getScriptText(filename);
        const response = await executeScriptByURL(scriptText);
        return response;
    } catch (error) {
        throw error;
    }
}