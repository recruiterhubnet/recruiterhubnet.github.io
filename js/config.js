// js/config.js

export const leadRiskAppScriptUrl = 'https://script.google.com/macros/s/AKfycbz-F5kugsn442j5av_koKcvJdGIVsCgTLjSSdgn8BlkIdpqYYjoJ_UPfJyHhKSshdhI/exec';
export const workingHoursAppScriptUrl = 'https://script.google.com/macros/s/AKfycbz2EvNYMZ73BtO_nQjiteWOkOTtAQ0JIyTqYZr8XakJKYNGzA6-YFxuf2U5UDwhWqXM/exec';
//This is the new URL for arrivals data
export const arrivalsAppScriptUrl = 'https://script.google.com/macros/s/AKfycbw147EXh-INU9M8-bPx19zYFGtfqGH7obQt1umbtlvh_4Obu0LWTs-wRZVM1Vq57_Zh/exec'; 
//This is the old URL, now specifically for drug tests
export const drugTestsAppScriptUrl = 'https://script.google.com/macros/s/AKfycbz5pq5zA_iKlK98DmEyEGWRv0H9czJOZYku_T2qWA-O5NroRAHJh1_-1W8PCpGOp9SY/exec';
export const mvrPspCdlAppScriptUrl = 'https://script.google.com/macros/s/AKfycbxFOXsdgXgskgDhqmPtCpGuaWpl7Gb08QzJvp9EOXxGS0SzHZKsIn8CxJH91qomC_-FBQ/exec'; 
//This is the Lead Count Assignment chart link
export const leadLifecycleAppScriptUrl = 'https://script.google.com/macros/s/AKfycbx5dp8RX2ezRT3jM64Av5nvGtHD6eRIt8wlkCURXaRycBY-neRtLnWiM8ZVb4XaRWT9aw/exec';
//This is the popup link
export const updatesAppScriptUrl = 'https://script.google.com/macros/s/AKfycbxa3nlW8L4ORpURFYmkCUrpmHi_8Yu9izL8wTKJZM9DMDT1P19rJHCsfiaGiqUjfFanEQ/exec'; 

export const columnsConfig = {
    date: { label: 'Date', visible: true, type: 'date' },
    recruiter_name: { label: 'Recruiter Name', visible: true, type: 'string' },
    team_name: { label: 'Team Name', visible: true, type: 'string' },
    company_name: { label: 'Company', visible: false, type: 'string' },
    contract_type: { label: 'Contract', visible: false, type: 'string' },
    total_phone_reveals: { label: 'Total Reveals', visible: true, type: 'number' },
    unique_phone_reveals: { label: 'Unique Reveals', visible: true, type: 'number' },
    outbound_calls: { label: 'Total Calls', visible: true, type: 'number' },
    unique_calls: { label: 'Unique Calls', visible: true, type: 'number' },
    call_duration_seconds: { label: 'Call Duration (s)', visible: true, type: 'number' },
    outbound_sms: { label: 'Total SMS', visible: true, type: 'number' },
    unique_sms: { label: 'Unique SMS', visible: true, type: 'number' },
    duration_per_reveal: { label: 'Duration/Reveal', visible: true, type: 'number', calculated: true },
    calls_per_reveal: { label: 'Calls/Reveal', visible: true, type: 'number', calculated: true },
    sms_per_reveal: { label: 'SMS/Reveal', visible: true, type: 'number', calculated: true },
    detector: { label: 'Detector', visible: true, type: 'string', calculated: true, sortable: true },
};

export const laColumnsConfig = {
    recruiter_name: { label: 'Recruiter Name', type: 'string' },
    team_name: { label: 'Team Name', type: 'string' },
    new_leads_assigned_on_date: { label: 'New Leads (daily)', type: 'number' },
    old_leads_assigned_on_date: { label: 'Old Leads (daily)', type: 'number' },
    hot_leads_assigned: { label: 'Hot Leads (daily)', type: 'number' },
    recruiter_new_leads_at_assignment: { label: 'Total New Leads', type: 'number' },
    recruiter_old_leads_at_assignment: { label: 'Total Old Leads', type: 'number' },
};

export const detectorFields = [
    { id: 'total_phone_reveals', name: 'Total Reveals' }, { id: 'unique_phone_reveals', name: 'Unique Reveals' },
    { id: 'outbound_calls', name: 'Total Calls' }, { id: 'unique_calls', name: 'Unique Calls' },
    { id: 'call_duration_seconds', name: 'Call Duration (s)' }, { id: 'unique_sms', name: 'SMS Sent' },
    { id: 'duration_per_reveal', name: 'Duration/Reveal' }, { id: 'calls_per_reveal', name: 'Calls/Reveal' },
    { id: 'sms_per_reveal', name: 'SMS/Reveal' },
];

export const whChartConfigs = [
    { title: 'Call Status', type: 'pie', dataFn: 'getCallStatusData' },
    { title: 'SMS Status', type: 'pie', dataFn: 'getSmsStatusData' }, // New
    { title: 'Call Type', type: 'pie', dataFn: 'getCallTypeData' },
    { title: 'SMS Type', type: 'pie', dataFn: 'getSmsTypeData' },   // New
    { title: 'Top 5 Hrs (by Activity)', type: 'bar', dataFn: 'getTop5Hours' },         // Updated Title
    { title: 'Worst 5 Hrs (by Activity)', type: 'bar', dataFn: 'getWorst5Hours' },     // Updated Title
    { title: 'Outbound Mins', type: 'bar', dataFn: 'getOutboundCallDurationByDay' },
    { title: 'Top Teams per Day', type: 'bar', dataFn: 'getMostActiveTeamByDay' },     // Updated Title
    { title: 'Top Recruiters', type: 'bar', dataFn: 'getMostActiveRecruiterByDay' },
];

export const tteColumnsConfig = {
    date: { label: 'Date', type: 'date' },
    recruiter_name: { label: 'Recruiter Name', type: 'string' },
    team_name: { label: 'Team Name', type: 'string' },
    p10: { label: 'P10', type: 'number' },
    p20: { label: 'P20', type: 'number' },
    p30: { label: 'P30', type: 'number' },
    p40: { label: 'P40', type: 'number' },
    p50: { label: 'P50', type: 'number' },
    p60: { label: 'P60', type: 'number' },
    p70: { label: 'P70', type: 'number' },
    p80: { label: 'P80', type: 'number' },
    p90: { label: 'P90', type: 'number' },
    p100: { label: 'P100', type: 'number' }
};
