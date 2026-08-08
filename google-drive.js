/**
 * google-drive.js
 * ---------------
 * Lists image files from a Google Drive folder using a Service Account.
 * Results are cached for 60 seconds so the Drive API isn't called on every message.
 *
 * Usage:
 *   const { listDriveImages } = require('./google-drive');
 *   const images = await listDriveImages(process.env.GDRIVE_FOLDER_CAMPSITE);
 *   // returns: [{ id: '...', name: 'Tapak 1', mimeType: 'image/jpeg' }, ...]
 */

const { google } = require('googleapis');
const path = require('path');

// ---------------------------------------------------------------------------
// Auth — Service Account
// LOCAL:   uses GDRIVE_CREDENTIALS_PATH (file path to JSON key)
// RAILWAY: uses GDRIVE_CREDENTIALS_JSON (full JSON key as a string env var)
// ---------------------------------------------------------------------------
function getAuth() {
    // Railway / env-var mode: credentials passed as raw JSON string
    if (process.env.GDRIVE_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GDRIVE_CREDENTIALS_JSON);
        return new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
    }

    // Local dev mode: read from JSON key file
    const credentialsPath = process.env.GDRIVE_CREDENTIALS_PATH
        ? path.resolve(process.env.GDRIVE_CREDENTIALS_PATH)
        : path.join(__dirname, 'google-credentials.json');

    return new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
}

// ---------------------------------------------------------------------------
// In-memory cache — { folderId: { data: [...], expiresAt: timestamp } }
// ---------------------------------------------------------------------------
const cache = {};
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// ---------------------------------------------------------------------------
// listDriveImages(folderId)
// Returns an array of { id, name } objects for image files in the folder.
// Files are sorted by name so ordering is predictable.
// ---------------------------------------------------------------------------
async function listDriveImages(folderId) {
    if (!folderId) {
        return [];
    }

    // Return cached result if still fresh
    const cached = cache[folderId];
    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }

    try {
        const auth = getAuth();
        const drive = google.drive({ version: 'v3', auth });

        const response = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
            fields: 'files(id, name, mimeType)',
            orderBy: 'name',
            pageSize: 100,
        });

        const files = (response.data.files || []).map(f => ({
            id: f.id,
            name: f.name.replace(/\.[^.]+$/, ''), // strip extension for caption
            mimeType: f.mimeType,
        }));

        // Store in cache
        cache[folderId] = { data: files, expiresAt: Date.now() + CACHE_TTL_MS };

        console.log(`[Drive] Fetched ${files.length} image(s) from folder ${folderId.slice(-8)}`);
        return files;

    } catch (err) {
        console.error(`[Drive] Failed to list folder ${folderId?.slice(-8)}:`, err.message);
        return [];
    }
}

// ---------------------------------------------------------------------------
// driveImageUrl(fileId)
// Builds a direct-view URL for a Drive file that WhatsApp can fetch.
// ---------------------------------------------------------------------------
function driveImageUrl(fileId) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

module.exports = { listDriveImages, driveImageUrl };
