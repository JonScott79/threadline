/*
    threadlines.js

    Frontend service for managing threadlines.
    Communicates with the local backend Express server over HTTP.

    Responsibilities:
    - Load the list of available threadlines for the user.
    - Save/Create a manually configured threadline.
    - Update/Rename a threadline.
    - Delete a threadline.
*/

// =====================================
// Imports
// =====================================

import axios from "axios";
import { API_BASE_URL } from "../src/apiConfig";

// =====================================
// Constants
// =====================================

const API_BASE = `${API_BASE_URL}/threadlines`;

// =====================================
// Public Methods
// =====================================

/**
 * Saves/Creates a manual threadline.
 * 
 * @param {string} uid - User identifier
 * @param {object} threadline - Threadline metadata
 * @returns {Promise<object>} The saved threadline returned by backend
 */
export async function saveThreadline(uid, threadline) {
    try {
        const response = await axios.post(API_BASE, threadline, {
            headers: { "x-user-uid": uid }
        });
        if (response.data && response.data.status === "success") {
            return response.data.threadline;
        }
        throw new Error(response.data?.message || "Failed to save threadline");
    } catch (error) {
        console.error("Failed to save threadline on backend:", error);
        throw error;
    }
}

/**
 * Loads all threadlines for the user.
 * 
 * @param {string} uid - User identifier
 * @returns {Promise<Array>} List of threadlines
 */
export async function loadThreadlines(uid) {
    try {
        const response = await axios.get(API_BASE, {
            headers: { "x-user-uid": uid }
        });
        if (response.data && response.data.status === "success") {
            return response.data.threadlines;
        }
        return [];
    } catch (error) {
        console.error("Failed to load threadlines from backend:", error);
        throw error;
    }
}

/**
 * Updates a threadline (Renames the threadline).
 * 
 * @param {string} uid - User identifier
 * @param {object} threadline - Threadline metadata to update
 */
export async function updateThreadline(uid, threadline) {
    try {
        const response = await axios.put(`${API_BASE}/${threadline.firestoreId}`, {
            title: threadline.title
        }, {
            headers: { "x-user-uid": uid }
        });
        if (response.data && response.data.status === "success") {
            console.log(`Renamed threadline ${threadline.firestoreId} on backend.`);
            return;
        }
        throw new Error(response.data?.message || "Failed to rename threadline");
    } catch (error) {
        console.error(`Failed to rename threadline ${threadline.firestoreId}:`, error);
        throw error;
    }
}

/**
 * Deletes a threadline by its ID.
 * 
 * @param {string} uid - User identifier
 * @param {string} firestoreId - The database ID of the threadline
 */
export async function deleteThreadline(uid, firestoreId) {
    try {
        const response = await axios.delete(`${API_BASE}/${firestoreId}`, {
            headers: { "x-user-uid": uid }
        });
        if (response.data && response.data.status === "success") {
            console.log(`Deleted threadline ${firestoreId} on backend.`);
            return;
        }
        throw new Error(response.data?.message || "Failed to delete threadline");
    } catch (error) {
        console.error(`Failed to delete threadline ${firestoreId}:`, error);
        throw error;
    }
}