const baseURL = "http://192.168.4.1";
const timeout = 10000; 

async function apiFetch(endpoint, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(baseURL + endpoint, {
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

    return await response.json();
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

const pico = {
  get: (url, options = {}) => apiFetch(url, { ...options, method: "GET" }),
  post: (url, data, options = {}) =>
    apiFetch(url, {
      ...options,
      method: "POST",
      body: JSON.stringify(data),
    }),
  put: (url, data, options = {}) =>
    apiFetch(url, {
      ...options,
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (url, options = {}) => apiFetch(url, { ...options, method: "DELETE" }),
};

export default pico;
