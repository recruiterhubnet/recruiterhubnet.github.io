// js/ui.js
import { columnsConfig } from './config.js';
import { state } from './state.js';
import { applyAllFiltersAndRender } from './leadRiskView.js';
import { renderAll as renderArrivalsView } from './arrivalsView.js';

export function getSelectedValues(dropdownEl) {
    if (!dropdownEl) return [];
    return Array.from(dropdownEl.querySelectorAll('input:not([data-role="select-all"]):checked')).map(cb => cb.value);
}

export function formatNumber(value, decimals) {
    const num = Number(value);
    if (isNaN(num)) return value;
    return num.toFixed(decimals);
}

export function formatDuration(seconds) {
    if (seconds === null || isNaN(seconds) || seconds < 0) return 'N/A';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    if (seconds < 86400) {
        const hours = seconds / 3600;
        return `${formatNumber(hours, 1)}h`;
    }
    const days = seconds / 86400;
    return `${formatNumber(days, 1)}d`;
}

export function populateFilters(element, data, key, placeholderText, filterFunction) {
    if (!data || !element) return;
    let sourceData = filterFunction ? data.filter(filterFunction) : data;
    const values = [...new Set(sourceData.map(d => d[key]).filter(Boolean))].sort();
    const currentValue = element.value;
    
    let optionsHTML = placeholderText ? `<option value="">${placeholderText}</option>` : '';
    optionsHTML += values.map(v => `<option value="${v}">${v}</option>`).join('');
    element.innerHTML = optionsHTML;
    
    if (values.includes(currentValue)) {
        element.value = currentValue;
    } else if (!placeholderText && values.length > 0) {
         element.value = values[0];
    } else {
         element.value = '';
    }
}

export function populateMultiSelectFilter(buttonEl, dropdownEl, data, key, placeholderText, selectAllByDefault = true, defaultValue = null) {
    if (!buttonEl || !dropdownEl) return;

    const values = [...new Set(data.map(d => d[key]).filter(Boolean))];

    const itemsHTML = values.map(v => `
        <label class="flex items-center p-2 hover:bg-gray-600 cursor-pointer">
            <input type="checkbox" value="${v}" class="multi-select-item h-4 w-4 rounded border-gray-500 bg-gray-800 text-blue-600 focus:ring-blue-500">
            <span class="ml-2 text-sm text-gray-200">${v}</span>
        </label>
    `).join('');

    const actionsHTML = `
        <div class="p-2 flex justify-between border-b border-gray-600 sticky top-0 bg-gray-700 z-10 multi-select-actions">
            <button class="text-xs font-semibold text-blue-400 hover:underline" data-action="select-all">Select All</button>
            <button class="text-xs font-semibold text-gray-400 hover:underline" data-action="deselect-all">Deselect All</button>
        </div>
    `;

    dropdownEl.innerHTML = actionsHTML + `<div class="multi-select-items-container">${itemsHTML}</div>`;
    
    const actionsContainer = dropdownEl.querySelector('.multi-select-actions');

    if (dropdownEl._changeHandler) {
        dropdownEl.removeEventListener('change', dropdownEl._changeHandler);
    }
    if (actionsContainer && actionsContainer._clickHandler) {
        actionsContainer.removeEventListener('click', actionsContainer._clickHandler);
    }

    const handleCheckboxChange = () => {
        updateMultiSelectButtonText(buttonEl, dropdownEl, placeholderText);
    };

    const handleActionClick = (e) => {
        const actionButton = e.target.closest('[data-action]');
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        e.preventDefault();
        const checkboxes = dropdownEl.querySelectorAll('.multi-select-item');
        const shouldBeChecked = action === 'select-all';

        checkboxes.forEach(cb => {
            if(cb.checked !== shouldBeChecked) {
               cb.checked = shouldBeChecked;
            }
        });
        
        dropdownEl.dispatchEvent(new Event('change', { bubbles: true }));
    };

    dropdownEl.addEventListener('change', handleCheckboxChange);
    if (actionsContainer) {
        actionsContainer.addEventListener('click', handleActionClick);
    }

    dropdownEl._changeHandler = handleCheckboxChange;
    if (actionsContainer) {
        actionsContainer._clickHandler = handleActionClick;
    }

    dropdownEl.querySelectorAll('.multi-select-item').forEach(cb => {
        if (defaultValue) {
            cb.checked = cb.value === defaultValue;
        } else {
            cb.checked = selectAllByDefault;
        }
    });
    updateMultiSelectButtonText(buttonEl, dropdownEl, placeholderText);
}


export function updateMultiSelectButtonText(buttonEl, dropdownEl, placeholderText) {
    const selectedCount = dropdownEl.querySelectorAll('input:not([data-role="select-all"]):checked').length;
    const totalCount = dropdownEl.querySelectorAll('input:not([data-role="select-all"])').length;

    if (selectedCount === 0) {
        buttonEl.textContent = `None selected`;
    } else if (selectedCount === totalCount) {
        buttonEl.textContent = placeholderText; // e.g., "All Teams"
    } else if (selectedCount === 1) {
        buttonEl.textContent = dropdownEl.querySelector('input:not([data-role="select-all"]):checked').value;
    } else {
        buttonEl.textContent = `${selectedCount} selected`;
    }
}


export function populateAllDropdowns(teamForRecruiters = null) {
    // --- Create Default Contract List ---
    const defaultContracts = ['ALL', 'CPM', 'CPML', 'LOO', 'LPOO', 'MCLOO', 'MCOO', 'OO', 'POG', 'TCPM', 'TCPML'];
    const defaultContractsList = defaultContracts.map(c => ({ contract_type: c }));

    // Lead Risk View
    populateFilters(document.getElementById('recruiterFilter'), state.allData, 'recruiter_name', 'All Recruiters', teamForRecruiters ? (d => d.team_name === teamForRecruiters) : null);
    if (!teamForRecruiters) {
        populateFilters(document.getElementById('teamFilter'), state.allData, 'team_name', 'All Teams');
    }
    populateFilters(document.getElementById('companyFilter'), state.allData, 'company_name', null);
    populateFilters(document.getElementById('contractFilter'), state.allData, 'contract_type', null);
    
    // Working Hours View
    populateFilters(document.getElementById('whRecruiterFilter'), state.allData, 'recruiter_name', 'All Recruiters');
    populateFilters(document.getElementById('whTeamFilter'), state.allData, 'team_name', 'All Teams');
    populateFilters(document.getElementById('whCompanyFilter'), state.workingHoursData, 'company_name', 'All Companies');
    populateFilters(document.getElementById('whCallTypeFilter'), state.workingHoursData.filter(d => d.event_type === 'call'), 'call_type', 'All Call Types');
    populateFilters(document.getElementById('whCallStatusFilter'), state.workingHoursData.filter(d => d.event_type === 'call'), 'status', 'All Call Statuses');
    populateFilters(document.getElementById('whSmsTypeFilter'), state.workingHoursData.filter(d => d.event_type === 'sms'), 'sms_type', 'All SMS Types');
    populateFilters(document.getElementById('whSmsStatusFilter'), state.workingHoursData.filter(d => d.event_type === 'sms'), 'status', 'All SMS Statuses');

    // Lead Assignment View
    populateFilters(document.getElementById('laRecruiterFilter'), state.allData, 'recruiter_name', 'All Recruiters');
    populateFilters(document.getElementById('laTeamFilter'), state.allData, 'team_name', 'All Teams');
    populateFilters(document.getElementById('laCompanyFilter'), state.allData, 'company_name', null);
    populateFilters(document.getElementById('laContractFilter'), state.allData, 'contract_type', null);

    // Arrivals View
    const allArrivalsRelatedData = [...state.arrivalsData, ...state.drugTestsData];
    populateFilters(document.getElementById('arrivalsRecruiterFilter'), allArrivalsRelatedData, 'recruiter_name', 'All Recruiters');
    populateFilters(document.getElementById('arrivalsTeamFilter'), allArrivalsRelatedData, 'team_name', 'All Teams');
    populateFilters(document.getElementById('arrivalsCompanyFilter'), state.drugTestsData, 'company_name', 'All Companies');
    populateFilters(document.getElementById('arrivalsContractFilter'), allArrivalsRelatedData, 'contract_type', 'All Contracts');
    
    
    renderArrivalsView();


    // Rankings View
    populateMultiSelectFilter(document.getElementById('rankingsTeamFilterBtn'), document.getElementById('rankingsTeamFilterDropdown'), state.combinedDataForRankings, 'team_name', 'All Teams');
    populateMultiSelectFilter(document.getElementById('rankingsCompanyFilterBtn'), document.getElementById('rankingsCompanyFilterDropdown'), state.combinedDataForRankings, 'company_name', 'All Companies');
    populateMultiSelectFilter(document.getElementById('rankingsContractFilterBtn'), document.getElementById('rankingsContractFilterDropdown'), state.combinedDataForRankings, 'contract_type', 'All Contracts');

    // Settings Modal
    populateFilters(document.getElementById('modalTeamFilter'), state.allData, 'team_name', 'All Teams');
    populateFilters(document.getElementById('modalCompanyFilter'), state.allData, 'company_name', null);
    populateFilters(document.getElementById('modalContractFilter'), state.allData, 'contract_type', null);
}


export function renderColumnCheckboxes() {
    document.getElementById('columnCheckboxes').innerHTML = Object.entries(columnsConfig).map(([key, conf]) => `
        <label class="flex items-center space-x-3 p-1 rounded-md hover:bg-gray-700/50 cursor-pointer">
            <input type="checkbox" data-key="${key}" ${conf.visible ? 'checked' : ''} class="h-4 w-4 rounded border-gray-500 bg-gray-600 text-blue-600 focus:ring-blue-500">
            <span class="text-sm text-gray-300">${conf.label}</span>
        </label>`).join('');
}

export function loadProfilesFromStorage() {
    state.detectorProfiles = JSON.parse(localStorage.getItem('detectorProfiles')) || {};
    state.defaultProfileName = localStorage.getItem('defaultDetectorProfile') || '';
    
    if (Object.keys(state.detectorProfiles).length === 0) {
         const specificCompany = 'ALL';
         const specificContract = 'ALL';

         state.detectorProfiles['Default Risk Profile'] = {
             filters: { 
                team: '',
                company: specificCompany, 
                contract: specificContract 
             },
             rules: [
                {
                     id: Date.now() + 1,
                     name: 'High Risk',
                     color: 'red',
                     conditions: [
                        {
                            field: 'duration_per_reveal', 
                            operator: '<=', 
                            valueType: 'percentile', 
                            percentile: 30,
                            dateContext: 'dateSelected',
                            peerGroup: 'specific_filters',
                            specificTeam: '',
                            specificRecruiter: '',
                            specificCompany: specificCompany,
                            specificContract: specificContract,
                            specificDataType: 'aggregated',
                            nextOperator: 'AND'
                        },
                        {
                            field: 'calls_per_reveal', 
                            operator: '<=', 
                            valueType: 'percentile', 
                            percentile: 30,
                            dateContext: 'dateSelected',
                            peerGroup: 'specific_filters',
                            specificTeam: '',
                            specificRecruiter: '',
                            specificCompany: specificCompany,
                            specificContract: specificContract,
                            specificDataType: 'aggregated',
                            nextOperator: 'AND'
                        },
                        {
                            field: 'sms_per_reveal', 
                            operator: '<=', 
                            valueType: 'percentile', 
                            percentile: 30,
                            dateContext: 'dateSelected',
                            peerGroup: 'specific_filters',
                            specificTeam: '',
                            specificRecruiter: '',
                            specificCompany: specificCompany,
                            specificContract: specificContract,
                            specificDataType: 'aggregated',
                            nextOperator: 'AND'
                        },
                        {
                            field: 'unique_phone_reveals',
                            operator: '>',
                            valueType: 'fixed',
                            value: 100,
                            nextOperator: null
                        }
                     ]
                },
                {
                    id: Date.now() + 2,
                    name: 'Medium Risk',
                    color: 'yellow',
                    conditions: [
                        {
                            field: 'unique_phone_reveals',
                            operator: '>',
                            valueType: 'fixed',
                            value: 35,
                            nextOperator: 'AND'
                        },
                        {
                            field: 'duration_per_reveal', 
                            operator: '<=', 
                            valueType: 'percentile', 
                            percentile: 35,
                            dateContext: 'dateSelected',
                            peerGroup: 'specific_filters',
                            specificTeam: '',
                            specificRecruiter: '',
                            specificCompany: specificCompany,
                            specificContract: specificContract,
                            specificDataType: 'aggregated',
                            nextOperator: 'AND'
                        },
                        {
                            field: 'calls_per_reveal', 
                            operator: '<=', 
                            valueType: 'percentile', 
                            percentile: 35,
                            dateContext: 'dateSelected',
                            peerGroup: 'specific_filters',
                            specificTeam: '',
                            specificRecruiter: '',
                            specificCompany: specificCompany,
                            specificContract: specificContract,
                            specificDataType: 'aggregated',
                            nextOperator: 'AND'
                        },
                        {
                            field: 'sms_per_reveal', 
                            operator: '<=', 
                            valueType: 'percentile', 
                            percentile: 35,
                            dateContext: 'dateSelected',
                            peerGroup: 'specific_filters',
                            specificTeam: '',
                            specificRecruiter: '',
                            specificCompany: specificCompany,
                            specificContract: specificContract,
                            specificDataType: 'aggregated',
                            nextOperator: null
                        }
                    ]
                }
             ]
         };

         state.defaultProfileName = 'Default Risk Profile';
         saveAllProfiles();
    }
    
    state.activeProfileName = state.defaultProfileName && state.detectorProfiles[state.defaultProfileName] ? state.defaultProfileName : Object.keys(state.detectorProfiles)[0];
    loadProfile(state.activeProfileName);
}

export function saveAllProfiles() {
    localStorage.setItem('detectorProfiles', JSON.stringify(state.detectorProfiles));
    localStorage.setItem('defaultDetectorProfile', state.defaultProfileName);
}

export function loadProfile(name) {
     if (state.detectorProfiles[name]) {
         state.activeProfileName = name;
         const profile = state.detectorProfiles[name];
         state.detectorRules = JSON.parse(JSON.stringify(profile.rules || []));
         
         document.getElementById('teamFilter').value = profile.filters?.team || '';
         document.getElementById('companyFilter').value = profile.filters?.company || '';
         document.getElementById('contractFilter').value = profile.filters?.contract || '';
         
         state.detectorSortApplied = true;
         renderProfilesDropdown();
         applyAllFiltersAndRender();
     }
}

export function renderProfilesDropdown() {
    const dropdown = document.getElementById('profilesDropdown');
    dropdown.innerHTML = Object.keys(state.detectorProfiles).map(name =>
        `<option value="${name}" ${name === state.activeProfileName ? 'selected' : ''}>
            ${name} ${name === state.defaultProfileName ? '⭐' : ''}
        </option>`
    ).join('') + `<option value="__add_new__" class="text-blue-400 font-bold">[ Add New Profile ]</option>`;
}

export function openModal(modalId) {
    document.getElementById(modalId)?.classList.remove('hidden');
}
export function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
}

export function handleSidebarCollapse() {
    const sidebar = document.getElementById('mainSidebar');
    const collapseIcon = document.getElementById('collapseIcon');
    const collapseText = document.querySelector('#collapseBtn .nav-text');

    sidebar.classList.toggle('collapsed');
    
    if (sidebar.classList.contains('collapsed')) {
        collapseIcon.classList.remove('fa-angles-left');
        collapseIcon.classList.add('fa-angles-right');
        collapseText.textContent = '';
    } else {
        collapseIcon.classList.add('fa-angles-left');
        collapseIcon.classList.remove('fa-angles-right');
        collapseText.textContent = 'Collapse';
    }
}
