// js/state.js

export const defaultRankingWeights = {
    final_score: { effort_score: 15, compliance_score: 15, arrivals_score: 70 },
    effort_score: { calls_score: 40, sms_score: 30, active_days_percentile: 30 },
    compliance_score: { tte_percentile: 30, leads_reached_percentile: 20, past_due_ratio_percentile: 15, documents_score: 20, profiles_completed_percentile: 15, median_call_duration_percentile: 0 },
    calls_score: { outbound_calls_percentile: 40, unique_calls_percentile: 25, call_duration_seconds_percentile: 35 },
    sms_score: { outbound_sms_percentile: 50, unique_sms_percentile: 50 },
    arrivals_score: { total_drug_tests_percentile: 40, onboarded_percentile: 60 },
    documents_score: { mvr_percentile: 34, psp_percentile: 33, cdl_percentile: 33 }
};

export const defaultRankingWeightsProfiler = {
    final_score: { effort_score: 30, compliance_score: 40, arrivals_score: 30 },
    effort_score: { calls_score: 40, sms_score: 30, profiler_note_lenght_percentile: 20, active_days_percentile: 10, median_time_to_profile_percentile: 0 },
    compliance_score: { tte_percentile: 40, leads_reached_percentile: 30, profiles_score: 20, documents_score: 10, median_call_duration_percentile: 0 },
    profiles_score: { profiles_profiled_percentile: 50, profiles_completed_percentile: 50 },
    calls_score: { outbound_calls_percentile: 30, unique_calls_percentile: 30, call_duration_seconds_percentile: 40 },
    sms_score: { outbound_sms_percentile: 50, unique_sms_percentile: 50 },
    arrivals_score: { total_drug_tests_percentile: 40, onboarded_percentile: 60 },
    documents_score: { mvr_percentile: 34, psp_percentile: 33, cdl_percentile: 33 }
};

export const state = {
    allData: [],
    filteredData: [],
    statsCache: {},
    detectorRules: [],
    detectorProfiles: {},
    defaultProfileName: '',
    activeProfileName: '',
    sortConfig: { key: 'date', direction: 'desc' },
    modalMode: 'edit',
    viewMode: 'aggregated',
    detectorSortApplied: false,
    trendChart: null,
    summaryStat: 'median',
    workingHoursData: [],
    hourlyActivityChart: null,
    futureChartInstance: null,
    currentFutureChartIndex: 0,
    tteViewMode: 'Average',
    tteSummaryStat: 'median',
    tteSortConfig: { key: 'recruiter_name', direction: 'asc' },
    tteDataType: 'standard',
    // Lead Assignment State
    laViewMode: 'aggregated',
    laSortConfig: { key: 'recruiter_name', direction: 'asc' },
    laSummaryStat: 'sum',
    laTrendChartInstance: null,
    laDistributionChartInstance: null,
    laCompanyChartInstance: null,
    laContractChartInstance: null,
    laTeamChartInstance: null,
    laCarouselTimer: null,
    // Arrivals & Drug Tests State
    arrivalsData: [],
    drugTestsData: [],
    mvrPspCdlData: [],
    arrivalsSortConfig: { key: 'recruiter_name', direction: 'asc' },
    arrivalsChartInstance: null,
    // Past Due State (used for both Past Due view and Rankings)
    recruiterData: [],
    profilerData: [],
    // Rankings State
    rankingsMode: 'recruiter', // 'recruiter' or 'team'
    rankingsSortConfig: { key: 'rank', direction: 'asc' },
    rankedData: [], // Stores the processed and ranked data
    rankingsSummaryStat: 'average',
    combinedDataForRankings: [],
    breakdownDataSource: 'all',
    // Working hours
    whLastSelectedDay: null,
    // Lead Assignment Count
    laLifecycleSettings: {
        visibleStatuses: [],
        visibleAges: [],
        chartType: 'bar',
        visibleCompanies: [], 
        visibleContracts: [], 
        assignmentStatus: 'all', 
        // ========== START: THIS IS THE FIX ==========
        assignmentGroups: {
            visibleCounts: [0, 1, 2],
            plusGroup: { from: 3, label: '3+ times' }
        }
        // ========== END: THIS IS THE FIX ==========
    },
    
    // --- START: SEPARATE RANKING SETTINGS ---
    // Settings for Recruiter/Team
    rankingSettings: {
        callSmsDataSource: 'all', 
        tteSource: 'standard',
        leadsReachedSource: 'standard',
        medianCallDurationSource: 'all_leads', // New setting
        activeDayRules: {
            workdays: { calls: 5, duration: 10, sms: 5, conditionsToMeet: 2 },
            weekends: { calls: 1, duration: 1, sms: 1, conditionsToMeet: 1 }
        },
        ttePValue: 'p50',
        tteLeadType: 'total',
        leadsReachedLeadType: 'total',
        drugTestType: 'All Types',
        perLeadMetrics: {
            outbound_calls: false, unique_calls: false, call_duration_seconds: false,
            outbound_sms: false, unique_sms: false, profiles_profiled: false,
            profiles_completed: false, total_drug_tests: false, onboarded: false
        },
        exclusionRules: [ { metric: 'active_days', operator: '>=', value: 1 } ],
        exclusionLogic: 'AND'
    },
    // Settings for Profiler
    rankingSettingsProfiler: {
        callSmsDataSource: 'all',
        tteSource: 'standard', // Profilers only use standard
        leadsReachedSource: 'standard', // Profilers only use standard
        medianCallDurationSource: 'all_leads', // New setting
        tteSourceProfiler: 'standard', // Can be 'standard' or 'fresh'
        leadsReachedSourceProfiler: 'standard', // Can be 'standard' or 'fresh'
        activeDayRules: {
            workdays: { calls: 10, duration: 15, sms: 10, conditionsToMeet: 2 },
            weekends: { calls: 1, duration: 1, sms: 1, conditionsToMeet: 1 }
        },
        ttePValue: 'p50',
        tteLeadType: 'total',
        leadsReachedLeadType: 'total',
        drugTestType: 'All Types',
        perLeadMetrics: {
            outbound_calls: false, unique_calls: false, call_duration_seconds: false,
            outbound_sms: false, unique_sms: false, profiles_profiled: false,
            profiles_completed: false, total_drug_tests: false, onboarded: false
        },
        exclusionRules: [ { metric: 'active_days', operator: '>=', value: 1 } ],
        exclusionLogic: 'AND'
    },
    // --- END: SEPARATE RANKING SETTINGS ---

    // Rankings Weight Settings for Recruiter/Team
    rankingWeights: JSON.parse(JSON.stringify(defaultRankingWeights)),
    // Rankings Weight Settings for Profiler
    rankingWeightsProfiler: JSON.parse(JSON.stringify(defaultRankingWeightsProfiler))
};
