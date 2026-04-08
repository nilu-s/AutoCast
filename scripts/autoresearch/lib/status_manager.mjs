/**
 * status_manager.mjs - Phase 1.3
 * Zentraler Status-Manager für Method-Jobs (ES Modules)
 */

import fs from 'fs';
import path from 'path';

// Status-Werte
export const STATUS = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    REJECTED: 'REJECTED'
};

/**
 * Erstellt einen neuen Status-Container
 * @param {string} statusPath - Pfad zur STATUS.json Datei
 * @returns {object} Status-Container
 */
export function createStatus(statusPath) {
    return {
        path: statusPath,
        data: {
            schemaVersion: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            jobs: {}
        }
    };
}

/**
 * Lädt einen bestehenden Status
 * @param {string} statusPath - Pfad zur STATUS.json Datei
 * @returns {object|null} Status-Container oder null bei Fehler
 */
export function loadStatus(statusPath) {
    try {
        const content = fs.readFileSync(statusPath, 'utf8');
        const data = JSON.parse(content);
        return {
            path: statusPath,
            data: data
        };
    } catch (err) {
        return null;
    }
}

/**
 * Speichert den Status in die Datei
 * @param {object} status - Status-Container
 */
export function saveStatus(status) {
    if (!status || !status.data) {
        throw new Error('Invalid status object');
    }

    status.data.updatedAt = new Date().toISOString();

    // Stelle sicher, dass das Verzeichnis existiert
    const dir = path.dirname(status.path);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(status.path, JSON.stringify(status.data, null, 2), 'utf8');
}

/**
 * Fügt einen Job zum Status hinzu
 * @param {object} status - Status-Container
 * @param {object} job - Job-Definition
 * @param {string} job.jobId - Eindeutige Job-ID
 * @param {string} job.taskAgent - Task-Agent Name
 * @param {string} job.methodId - Method-ID
 * @param {string} job.methodTitle - Method-Titel
 */
export function addJob(status, job) {
    if (!status || !status.data || !status.data.jobs) {
        throw new Error('Invalid status object');
    }

    if (!job || !job.jobId) {
        throw new Error('Job ID is required');
    }

    status.data.jobs[job.jobId] = {
        status: STATUS.PENDING,
        taskAgent: job.taskAgent || 'unknown',
        methodId: job.methodId || 'unknown',
        methodTitle: job.methodTitle || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        result: null,
        error: null
    };
}

/**
 * Aktualisiert den Status eines Jobs atomar (mit sofortigem Speichern)
 * @param {object} status - Status-Container
 * @param {string} jobId - Job-ID
 * @param {string} newStatus - Neuer Status
 * @param {object} metadata - Zusätzliche Metadaten (z.B. decision, result, error)
 * @returns {object} Aktualisierter Status-Container
 * @throws {Error} Bei ungültigem Status oder Job
 */
export function updateJobStatusAtomic(status, jobId, newStatus, metadata = {}) {
    if (!status || !status.data || !status.data.jobs) {
        throw new Error('Invalid status object');
    }

    const job = status.data.jobs[jobId];
    if (!job) {
        throw new Error('Job not found: ' + jobId);
    }

    // Validiere Status-Wert
    const validStatuses = Object.values(STATUS);
    if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status value: ${newStatus}. Valid: ${validStatuses.join(', ')}`);
    }

    const now = new Date().toISOString();

    // Update Status
    job.status = newStatus;
    job.updatedAt = now;

    // Timestamps
    if (newStatus === STATUS.RUNNING && !job.startedAt) {
        job.startedAt = now;
    }

    if (newStatus === STATUS.COMPLETED || newStatus === STATUS.FAILED || newStatus === STATUS.REJECTED) {
        job.completedAt = now;
    }

    // Metadaten (inklusive decision, result, error)
    if (metadata.decision !== undefined) {
        job.decision = metadata.decision;
    }
    if (metadata.result !== undefined) {
        job.result = metadata.result;
    }
    if (metadata.error !== undefined) {
        job.error = metadata.error;
    }

    // SOFORT SPEICHERN (atomare Operation)
    saveStatus(status);

    return status;
}

/**
 * Aktualisiert den Status eines Jobs
 * @param {object} status - Status-Container
 * @param {string} jobId - Job-ID
 * @param {string} newStatus - Neuer Status
 * @param {object} options - Zusätzliche Optionen
 * @deprecated Verwende updateJobStatusAtomic für Transaktionssicherheit
 */
export function updateJobStatus(status, jobId, newStatus, options = {}) {
    if (!status || !status.data || !status.data.jobs) {
        throw new Error('Invalid status object');
    }

    const job = status.data.jobs[jobId];
    if (!job) {
        throw new Error('Job not found: ' + jobId);
    }

    const now = new Date().toISOString();

    job.status = newStatus;
    job.updatedAt = now;

    if (newStatus === STATUS.RUNNING && !job.startedAt) {
        job.startedAt = now;
    }

    if (newStatus === STATUS.COMPLETED || newStatus === STATUS.FAILED || newStatus === STATUS.REJECTED) {
        job.completedAt = now;
    }

    if (options.result !== undefined) {
        job.result = options.result;
    }
    if (options.error !== undefined) {
        job.error = options.error;
    }
}

/**
 * Holt die Zusammenfassung aller Jobs
 * @param {object} status - Status-Container
 * @returns {object} Zusammenfassung
 */
export function getSummary(status) {
    if (!status || !status.data || !status.data.jobs) {
        return { total: 0, pending: 0, running: 0, completed: 0, failed: 0, rejected: 0 };
    }

    const jobs = status.data.jobs;
    const summary = {
        total: Object.keys(jobs).length,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        rejected: 0
    };

    for (const jobId in jobs) {
        const jobStatus = jobs[jobId].status;
        if (jobStatus === STATUS.PENDING) summary.pending++;
        else if (jobStatus === STATUS.RUNNING) summary.running++;
        else if (jobStatus === STATUS.COMPLETED) summary.completed++;
        else if (jobStatus === STATUS.FAILED) summary.failed++;
        else if (jobStatus === STATUS.REJECTED) summary.rejected++;
    }

    return summary;
}

/**
 * Prüft, ob alle Jobs abgeschlossen sind
 * @param {object} status - Status-Container
 * @returns {boolean} True wenn alle Jobs fertig
 */
export function isComplete(status) {
    const summary = getSummary(status);
    return summary.pending === 0 && summary.running === 0;
}

/**
 * Holt alle Jobs mit einem bestimmten Status
 * @param {object} status - Status-Container
 * @param {string} filterStatus - Zu filternder Status
 * @returns {array} Liste der Jobs
 */
export function getJobsByStatus(status, filterStatus) {
    if (!status || !status.data || !status.data.jobs) {
        return [];
    }

    const result = [];
    const jobs = status.data.jobs;

    for (const jobId in jobs) {
        if (jobs[jobId].status === filterStatus) {
            result.push({
                jobId: jobId,
                ...jobs[jobId]
            });
        }
    }

    return result;
}

export default {
    STATUS,
    createStatus,
    loadStatus,
    saveStatus,
    addJob,
    updateJobStatus,
    updateJobStatusAtomic,  // Neue atomare Update-Funktion
    getSummary,
    isComplete,
    getJobsByStatus
};
