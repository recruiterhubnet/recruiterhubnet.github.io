// js/api.js

import { leadRiskAppScriptUrl, workingHoursAppScriptUrl, arrivalsAppScriptUrl, drugTestsAppScriptUrl, mvrPspCdlAppScriptUrl, leadLifecycleAppScriptUrl } from './config.js';


async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.status === 'error') {
            throw new Error(`API Error: ${data.message}`);
        }
        return data;
    } catch (error) {
        console.error('Error fetching data from ' + url, error);
        alert(`A critical error occurred while trying to fetch data. Please check the console for details.`);
        return null;
    }
}

export async function fetchAllData() {
    const leadRiskPromise = fetchData(leadRiskAppScriptUrl);
    const workingHoursPromise = fetchData(workingHoursAppScriptUrl);
    const arrivalsPromise = fetchData(arrivalsAppScriptUrl);
    const drugTestsPromise = fetchData(drugTestsAppScriptUrl);
    const mvrPspCdlPromise = fetchData(mvrPspCdlAppScriptUrl);
    const leadLifecyclePromise = fetchData(leadLifecycleAppScriptUrl);

    const [leadRiskData, whData, arrivalsResponse, drugTestsResponse, fullCaptureResponse, leadLifecycleResponse] = await Promise.all([
        leadRiskPromise,
        workingHoursPromise,
        arrivalsPromise,
        drugTestsPromise,
        mvrPspCdlPromise,
        leadLifecyclePromise
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
    };
}
