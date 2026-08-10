/*
    apiConfig.js

    Centralized API configuration for development and production environments.
    Resolves the base URL using Vite environment variables, falling back to localhost for development.
*/

const VITE_API_URL = import.meta.env.VITE_API_URL;

// Base API URL for all frontend requests
export const API_BASE_URL = VITE_API_URL || "http://localhost:3001/api";

console.log("Threadline API Base URL initialized:", API_BASE_URL);
