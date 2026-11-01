// API Configuration
const getApiUrl = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  // If we're running on a network IP (not localhost), use that for API calls too
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return `http://${hostname}:3001`;
  }

  // Fallback to localhost for local development
  return "http://localhost:3001";
};

export const API_BASE_URL = getApiUrl();

// Helper function for API calls
export const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
};

export default { API_BASE_URL, apiCall };
