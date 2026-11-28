// API Configuration
// The sales API base URL is defined once in config/integration.js
// (VITE_SALES_MANAGER_URL, otherwise current hostname + port 3001).
import { SALES_MANAGER_API } from "./integration.js";

export const API_BASE_URL = SALES_MANAGER_API.BASE_URL;

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
