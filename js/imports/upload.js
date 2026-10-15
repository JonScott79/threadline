/*======================================================
                        IMPORTS
======================================================*/

import axios from "axios";
import { API_BASE_URL } from "../../src/apiConfig";

const CHUNK_SIZE = 20 * 1024 * 1024; // 20 MB slices
const CHUNK_THRESHOLD = 25 * 1024 * 1024; // Use chunking for files > 25MB

/*======================================================
                CHUNKED UPLOAD ARCHIVE
======================================================*/

export async function uploadArchiveChunked(file, user, threadlineId = null, onProgress = null) {
    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
    const uploadId = `upl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    console.log(`Starting chunked upload: ${file.name} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB across ${totalChunks} chunks)`);

    let finalResponse = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalBytes);
        const chunkBlob = file.slice(start, end);

        const formData = new FormData();
        formData.append("chunk", chunkBlob, file.name);
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("totalChunks", String(totalChunks));
        formData.append("fileName", file.name);
        formData.append("fileSize", String(totalBytes));
        formData.append("uid", user?.uid || "local");

        if (threadlineId) {
            formData.append("threadlineId", threadlineId);
        }

        const headers = {
            "x-user-uid": user?.uid || "local"
        };

        const res = await axios.post(`${API_BASE_URL}/import/chunk`, formData, {
            headers,
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    const currentChunkLoaded = progressEvent.loaded;
                    const overallLoaded = start + currentChunkLoaded;
                    const percent = Math.min(Math.round((overallLoaded / totalBytes) * 100), 99);
                    onProgress(percent, {
                        chunkIndex: chunkIndex + 1,
                        totalChunks,
                        loadedBytes: overallLoaded,
                        totalBytes
                    });
                }
            }
        });

        if (chunkIndex === totalChunks - 1) {
            finalResponse = res.data;
            if (onProgress) onProgress(100, { chunkIndex: totalChunks, totalChunks, loadedBytes: totalBytes, totalBytes });
        }
    }

    return finalResponse;
}

/*======================================================
                    UPLOAD ARCHIVE
======================================================*/

export async function uploadArchive(file, user, threadlineId = null, onProgress = null) {
    // If file exceeds chunk threshold, use resilient streaming chunked upload
    if (file && file.size > CHUNK_THRESHOLD) {
        return uploadArchiveChunked(file, user, threadlineId, onProgress);
    }

    const formData = new FormData();
    formData.append("archive", file);
    formData.append("uid", user?.uid || "local");

    if (threadlineId) {
        formData.append("threadlineId", threadlineId);
    }

    try {
        const response = await axios.post(
            `${API_BASE_URL}/import`,
            formData,
            {
                headers: {
                    "x-user-uid": user?.uid || "local"
                },
                onUploadProgress: (progressEvent) => {
                    if (onProgress && progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress(percent, {
                            chunkIndex: 1,
                            totalChunks: 1,
                            loadedBytes: progressEvent.loaded,
                            totalBytes: progressEvent.total
                        });
                    }
                }
            }
        );

        console.log(response.data);
        return response.data;
    } catch (error) {
        console.error("Direct upload error:", error);
        throw error;
    }
}

/*======================================================
                    PASTE ARCHIVE TEXT
======================================================*/

export async function pasteArchiveText(text, title, user, threadlineId = null) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/import/paste`,
            {
                text,
                title,
                threadlineId
            },
            {
                headers: {
                    "x-user-uid": user?.uid || "local"
                }
            }
        );

        console.log(response.data);
        return response.data;
    } catch (error) {
        console.error("Paste archive error:", error);
        throw error;
    }
}
