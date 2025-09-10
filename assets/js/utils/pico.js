const baseURL = "http://192.168.4.1";
const timeout = 10000; 

async function apiFetch( options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(baseURL, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

const pico = {
   get: async ( options ) => await fetch( baseURL + "/msg="+ options),
  post: ( data, options = {}) =>
    apiFetch( {
      ...options,
      method: "POST",
      body: String.raw(data),
    }),
  put: ( data, options = {}) =>
    apiFetch( {
      ...options,
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: ( options = {}) => apiFetch( { ...options, method: "DELETE" }),
};

export default pico;
