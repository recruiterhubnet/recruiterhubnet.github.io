// js/api.js

import { leadRiskAppScriptUrl, workingHoursAppScriptUrl, arrivalsAppScriptUrl, drugTestsAppScriptUrl, mvrPspCdlAppScriptUrl, leadLifecycleAppScriptUrl, updatesAppScriptUrl, globalSettingsAppScriptUrl } from './config.js';


async function fetchData(url, name) { // MODIFIED: Added 'name' parameter
    const startTime = performance.now();
    // MODIFIED: Use the provided name instead of parsing the URL
    console.log(`[FETCH START] 🚀 Starting fetch for: ${name}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(`API Error: ${data.message}`);
        }
        
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        console.log(`[FETCH SUCCESS] ✅ Finished fetch for: ${name} in ${duration} ms.`);

        return data;
    } catch (error) {
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        console.error(`[FETCH ERROR] ❌ Failed fetch for: ${name} in ${duration} ms.`, error);

        // Silently fail for global settings to not block the app
        if (url !== globalSettingsAppScriptUrl) {
            alert(`A critical error occurred while trying to fetch data. Please check the console for details.`);
        }
        return null;
    }
}

async function sendData(url, data) {
    try {
        // We create a temporary form to send the data, which is a reliable way
        // to bypass CORS preflight issues with Google Apps Script.
        const formData = new FormData();
        formData.append('data', JSON.stringify(data));

        // Note: We are not setting Content-Type header. The browser will set it
        // automatically to multipart/form-data, which is treated as a simple request.
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(data), // Send the raw JSON string
            // Apps Script requires the content type to be text/plain to avoid preflight
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // The final response from Apps Script will be JSON
        const responseData = await response.json();
        return responseData;
    } catch (error) {
        console.error('Error sending data to ' + url, error);
        return { status: 'error', message: 'Failed to send data.' };
    }
}

export async function fetchAllData() {
    // MODIFIED: Pass a descriptive name for each fetch call
    const leadRiskPromise = fetchData(leadRiskAppScriptUrl, 'Lead Risk');
    const workingHoursPromise = fetchData(workingHoursAppScriptUrl, 'Working Hours');
    const arrivalsPromise = fetchData(arrivalsAppScriptUrl, 'Arrivals');
    const drugTestsPromise = fetchData(drugTestsAppScriptUrl, 'Drug Tests');
    const mvrPspCdlPromise = fetchData(mvrPspCdlAppScriptUrl, 'Documents & Capture');
    const leadLifecyclePromise = fetchData(leadLifecycleAppScriptUrl, 'Lead Lifecycle');
    const updatesPromise = fetchData(updatesAppScriptUrl, 'App Updates');
    const globalSettingsPromise = fetchData(globalSettingsAppScriptUrl, 'Global Settings');

    const [leadRiskData, whData, arrivalsResponse, drugTestsResponse, fullCaptureResponse, leadLifecycleResponse, updatesData, globalSettingsData] = await Promise.all([
        leadRiskPromise,
        workingHoursPromise,
        arrivalsPromise,
        drugTestsPromise,
        mvrPspCdlPromise,
        leadLifecyclePromise,
        updatesPromise,
        globalSettingsPromise
    ]);

    const mvrPspCdlData = fullCaptureResponse ? fullCaptureResponse.mvr_psp_cdl : [];
    const recruiterData = fullCaptureResponse ? fullCaptureResponse.recruiter_capture : [];
    const profilerData = fullCaptureResponse ? fullCaptureResponse.profiler_capture : [];
    const leadLifecycleData = leadLifecycleResponse ? leadLifecycleResponse.data : [];

    // Robustly extract arrivals data to handle different possible JSON structures
    let finalArrivalsData = [];
    if (arrivalsResponse) {
        // Case 1: The response has a root property named 'arrivalsData'
        if (arrivalsResponse.arrivalsData && Array.isArray(arrivalsResponse.arrivalsData)) {
            finalArrivalsData = arrivalsResponse.arrivalsData;
        } 
        // Case 2: The response is the array itself
        else if (Array.isArray(arrivalsResponse)) {
            finalArrivalsData = arrivalsResponse;
        }
    }

    // Extract drug test data (assuming it's always in {drugTestsData: [...]})
    const finalDrugTestsData = drugTestsResponse ? drugTestsResponse.drugTestsData : [];

    return {
        leadRiskData,
        whData,
        arrivalsData: finalArrivalsData || [],
        drugTestsData: finalDrugTestsData || [],
        mvrPspCdlData: mvrPspCdlData || [],
        recruiterData: recruiterData || [],
        profilerData: profilerData || [],
        leadLifecycleData: leadLifecycleData || [],
        updatesData: updatesData || null, 
        globalSettingsData: globalSettingsData || null,
    };
}

export async function exportGlobalSettings(settings, pin) {
    const payload = {
        pin: pin,
        settings: settings
    };
    return sendData(globalSettingsAppScriptUrl, payload);
}

export async function fetchGlobalSettings() {
    // MODIFIED: Pass a descriptive name here as well
    return fetchData(globalSettingsAppScriptUrl, 'Global Settings (Manual Load)');
}
