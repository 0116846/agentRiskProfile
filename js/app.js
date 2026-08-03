/**
 * Main Application Module
 * Ties together all dashboard components
 */

const App = {
    // Application state
    state: {
        dataLoaded: false,
        currentManager: '',
        currentAgent: '',
        currentAgents: [],
        currentManagers: [],
        startDate: '',
        endDate: '',
        autoRefreshInterval: null,
        autoRefreshEnabled: false,
        lastFilePath: '',
        lastUpdateTime: null,
        isJsonSource: false,
        rawJsonData: null
    },

    /**
     * Initialize the application
     */
    init: function() {
        this.bindEvents();
        this.initTheme();
        console.log('Dashboard initialized');
    },

    /**
     * Bind all event listeners
     */
    bindEvents: function() {
        // Launch button only — no auto-load on file select
        document.getElementById('loadFromPath').addEventListener('click', () => {
            const path = document.getElementById('sharedPath').value.trim();
            const fileInput = document.getElementById('excelUpload');
            if (path) {
                this.loadFromPath(path);
            } else if (fileInput.files.length > 0) {
                this.loadFromUpload(fileInput.files[0]);
            } else {
                this.showStatus('Please upload a file or enter a path/URL', 'warning');
            }
        });

        // Drag & drop support
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('excelUpload');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
            dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                const file = e.dataTransfer.files[0];
                if (file) {
                    fileInput.files = e.dataTransfer.files;
                    dropZone.querySelector('.upload-drop-text').textContent = file.name;
                    dropZone.querySelector('.upload-drop-sub').textContent = (file.size / 1024).toFixed(1) + ' KB';
                    dropZone.classList.add('file-selected');
                }
            });
        }
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0 && dropZone) {
                    dropZone.querySelector('.upload-drop-text').textContent = fileInput.files[0].name;
                    dropZone.querySelector('.upload-drop-sub').textContent = (fileInput.files[0].size / 1024).toFixed(1) + ' KB';
                    dropZone.classList.add('file-selected');
                }
            });
        }

        // Manager multi-select
        this._initManagerMultiSelect();

        // Agent multi-select
        this._initAgentMultiSelect();

        // Date filter — apply on button click with validation
        document.getElementById('applyDateFilter').addEventListener('click', () => {
            this.applyDateFilter();
        });

        document.getElementById('clearDateFilter').addEventListener('click', () => {
            this.resetDateFilter();
        });


        // Export buttons
        document.getElementById('exportCSV').addEventListener('click', () => {
            this.exportToCSV();
        });
        document.getElementById('exportPDF').addEventListener('click', () => {
            this.exportToPDF();
        });
        document.getElementById('exportAllCSV')?.addEventListener('click', () => {
            this.exportTabCSV('all');
        });
        document.addEventListener('click', (e) => {
            var btn = e.target.closest('.export-tab-csv');
            if (btn) this.exportTabCSV(btn.dataset.export);
        });

        // Cases Report filters
        document.getElementById('casesReportApply')?.addEventListener('click', () => {
            this._applyCasesReportFilter();
        });
        document.getElementById('casesReportReset')?.addEventListener('click', () => {
            document.getElementById('casesStatusFilter').value = '';
            document.getElementById('casesOriginFilter').value = '';
            document.getElementById('casesManagerFilter').value = '';
            this._renderCasesReport(this._casesReportFullData);
        });


        // Resize charts when switching tabs (Chart.js needs visible canvas)
        document.querySelectorAll('#dashboardTabs button[data-bs-toggle="tab"]').forEach(function(tab) {
            tab.addEventListener('shown.bs.tab', function() {
                Object.values(Charts.instances || {}).forEach(function(chart) {
                    if (chart && chart.resize) chart.resize();
                });
            });
        });

        // Toggle leaderboard visibility
        document.getElementById('toggleLeaderboard')?.addEventListener('click', () => {
            const body = document.getElementById('leaderboardBody');
            const icon = document.querySelector('#toggleLeaderboard i');
            if (body.style.display === 'none') {
                body.style.display = 'block';
                icon.className = 'bi bi-chevron-down';
            } else {
                body.style.display = 'none';
                icon.className = 'bi bi-chevron-up';
            }
        });

        // Navbar section scroll navigation
        document.querySelectorAll('#navSections a[data-section]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var sectionId = this.getAttribute('data-section');
                var section = document.getElementById(sectionId);
                if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                document.querySelectorAll('#navSections .nav-link').forEach(function(n) { n.classList.remove('active'); });
                this.classList.add('active');
            });
        });

        // Navbar tab navigation (Data Views dropdown)
        document.querySelectorAll('#navSections a[data-tab]').forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var tabId = this.getAttribute('data-tab');
                if (tabId === 'all-tabs') {
                    var firstTab = document.getElementById('caseRecord-tab');
                    if (firstTab) firstTab.click();
                } else {
                    var tabBtn = document.getElementById(tabId);
                    if (tabBtn) tabBtn.click();
                }
                var tabSection = document.getElementById('dataViewsSection');
                if (tabSection) {
                    setTimeout(function() { tabSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
                }
                // Update dropdown text to show selected view
                var dropdownToggle = this.closest('.dropdown')?.querySelector('.dropdown-toggle');
                if (dropdownToggle) {
                    var icon = '<i class="bi bi-grid me-1"></i>';
                    dropdownToggle.innerHTML = icon + this.textContent.trim();
                }
            });
        });

        // Back to cover button
        document.getElementById('backToCover')?.addEventListener('click', function() {
            document.getElementById('heroSection').style.display = '';
            document.getElementById('dashboardNav').classList.add('d-none');
            document.getElementById('dashboardContent').classList.add('d-none');
            var ft = document.getElementById('dashboardFooter');
            if (ft) ft.classList.add('d-none');
            var dc = document.getElementById('dashboardContainer');
            if (dc) dc.classList.add('d-none');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    },

    /**
     * Load data from uploaded file
     */
    loadFromUpload: async function(file) {
        this.showLoading(true);
        this.showStatus(`Loading ${file.name}...`, 'info');

        try {
            if (file.name.toLowerCase().endsWith('.json')) {
                const text = await file.text();
                const json = JSON.parse(text);
                const data = JsonDataLoader.loadFromObject(json);
                this.state.isJsonSource = true;
                this.state.rawJsonData = JsonDataLoader.rawData;
                DataParser.loadFromJSON(data);
                this.processData(data);
            } else {
                this.state.isJsonSource = false;
                this.state.rawJsonData = null;
                const data = await DataParser.parseFromUpload(file);
                this.processData(data);
            }
            this.showStatus(`Loaded ${file.name} successfully`, 'success');
        } catch (error) {
            console.error('Error loading file:', error);
            this.showStatus(`Error: ${error.message}`, 'danger');
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Load data from path/URL
     */
    loadFromPath: async function(path) {
        this.showLoading(true);
        this.showStatus(`Loading from ${path}...`, 'info');
        this.state.lastFilePath = path;

        try {
            if (path.toLowerCase().endsWith('.json')) {
                const data = await JsonDataLoader.load(path);
                this.state.isJsonSource = true;
                this.state.rawJsonData = JsonDataLoader.rawData;
                DataParser.loadFromJSON(data);
                this.processData(data);
            } else {
                this.state.isJsonSource = false;
                this.state.rawJsonData = null;
                const data = await DataParser.parseFromURL(path);
                this.processData(data);
            }
            this.showStatus(`Loaded data from path successfully`, 'success');
        } catch (error) {
            console.error('Error loading from path:', error);
            this.showStatus(`Error loading from path: ${error.message}`, 'danger');
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Process loaded data
     */
    processData: function(data) {
        this.state.dataLoaded = true;
        this.state.lastUpdateTime = new Date();

        // Show dashboard FIRST so charts can measure canvas dimensions
        document.getElementById('dashboardContent').classList.remove('d-none');
        var hero = document.getElementById('heroSection');
        if (hero) hero.style.display = 'none';
        var nav = document.getElementById('dashboardNav');
        if (nav) nav.classList.remove('d-none');
        var footer = document.getElementById('dashboardFooter');
        if (footer) footer.classList.remove('d-none');
        var dc = document.getElementById('dashboardContainer');
        if (dc) dc.classList.remove('d-none');

        var analysis, riskData;
        try {
            analysis = Analytics.analyze(data);
            riskData = Analytics.calculateAgentRiskScores(data);
        } catch (e) {
            console.error('Error in analytics:', e);
            analysis = { caseRecordType: {}, proactiveType: {}, age48hrs: {}, emailChanges: {}, shortCalls: {}, ronaTrend: {} };
            riskData = { rankings: [], counts: { critical: 0, high: 0, medium: 0, low: 0 }, highRiskAgents: [] };
        }

        this.currentData = data;
        this.currentAnalysis = analysis;
        this.currentRiskData = riskData;

        try {
            this.updateSummaryCards(data);
        } catch (e) { console.error('Error updating summary cards:', e); }

        try {
            this.populateManagerFilter();
        } catch (e) { console.error('Error populating manager filter:', e); }

        try {
            this.updateTables(data);
        } catch (e) { console.error('Error updating tables:', e); }

        // Charts need visible containers — render after layout settles
        var self = this;
        setTimeout(function() {
            try {
                self.updateRiskLeaderboard(riskData);
            } catch (e) { console.error('Error updating risk leaderboard:', e); }

            try {
                Charts.initializeAll(analysis, data);
            } catch (e) { console.error('Error initializing charts:', e); }

            try {
                var insights = InsightsGenerator.generateInsights(analysis, data);
                self.displayInsights(insights);
            } catch (e) { console.error('Error generating insights:', e); }

            try {
                self.updateLastUpdated();
                self.updateDateRange();
                self.updateManagerFocus();
                self.applyDataDateRange();
            } catch (e) { console.error('Error updating dashboard metadata:', e); }
        }, 150);
    },

    applyDataDateRange: function() {
        var range = null;
        if (this.state.isJsonSource && typeof JsonDataLoader !== 'undefined') {
            range = JsonDataLoader.getDateRange();
        }
        if (!range) return;
        var minD = range.minDate || range.min;
        var maxD = range.maxDate || range.max;
        if (!minD || !maxD) return;
        var fmt = function(d) { return d.toISOString().split('T')[0]; };
        var startInput = document.getElementById('startDate');
        var endInput = document.getElementById('endDate');
        if (startInput) {
            startInput.min = fmt(minD);
            startInput.max = fmt(maxD);
            if (!startInput.value) startInput.value = fmt(minD);
        }
        if (endInput) {
            endInput.min = fmt(minD);
            endInput.max = fmt(maxD);
            if (!endInput.value) endInput.value = fmt(maxD);
        }

    },

    applyDateFilter: function() {
        if (!this.state.dataLoaded) {
            this.showStatus('Please load data first', 'warning');
            return;
        }

        const startVal = document.getElementById('startDate').value;
        const endVal = document.getElementById('endDate').value;

        if (!startVal && !endVal) {
            this.showStatus('Please select at least one date (From or To)', 'warning');
            return;
        }

        if (startVal && endVal && new Date(startVal) > new Date(endVal)) {
            this.showStatus('Invalid date range: "From" date cannot be after "To" date', 'danger');
            return;
        }

        const dateRange = (this.state.isJsonSource && JsonDataLoader.rawData)
            ? JsonDataLoader.getDateRange()
            : DataParser.getDateRange();

        if (dateRange.minDate && dateRange.maxDate) {
            const start = startVal ? new Date(startVal) : null;
            const end = endVal ? new Date(endVal) : null;
            const dataStart = new Date(dateRange.minDate);
            const dataEnd = new Date(dateRange.maxDate);
            dataStart.setHours(0,0,0,0);
            dataEnd.setHours(23,59,59,999);

            if (start && start > dataEnd) {
                this.showStatus(`Selected "From" date is after the latest data (${dateRange.lastRecord}). Data available: ${dateRange.range}`, 'danger');
                return;
            }
            if (end && end < dataStart) {
                const fmt = dataStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                this.showStatus(`Selected "To" date is before the earliest data (${fmt}). Data available: ${dateRange.range}`, 'danger');
                return;
            }
        }

        this.state.startDate = startVal;
        this.state.endDate = endVal;
        this.showStatus('Applying date filter...', 'info');
        var self = this;
        setTimeout(function() {
            self.refreshDashboard();
            self.showStatus('Showing data for ' + (startVal || 'start') + ' to ' + (endVal || 'end'), 'success');
        }, 50);
    },

    resetDateFilter: function() {
        if (!this.state.dataLoaded) return;

        const dateRange = (this.state.isJsonSource && JsonDataLoader.rawData)
            ? JsonDataLoader.getDateRange()
            : DataParser.getDateRange();

        const formatForInput = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        if (dateRange.minDate) {
            document.getElementById('startDate').value = formatForInput(dateRange.minDate);
            document.getElementById('endDate').value = formatForInput(dateRange.maxDate);
        } else {
            document.getElementById('startDate').value = '';
            document.getElementById('endDate').value = '';
        }

        this.state.startDate = '';
        this.state.endDate = '';

        this.state.currentManager = '';
        this.state.currentManagers = [];
        this.state.currentAgent = '';
        this.state.currentAgents = [];
        this._updateMgrMsLabel();
        this._updateAgentMsLabel();

        var dvToggle = document.querySelector('#navSections .dropdown-toggle');
        if (dvToggle) dvToggle.innerHTML = '<i class="bi bi-grid me-1"></i>Data Views';

        this.showStatus('Clearing all filters...', 'info');
        var self = this;
        setTimeout(function() {
            self.populateManagerFilter();
            self.populateAgentFilter();
            self.refreshDashboard();
            self.showStatus('All filters cleared — showing full data', 'info');
        }, 50);
    },


    refreshDashboard: function() {
        if (!this.state.dataLoaded) return;

        if (this.state.isJsonSource && this.state.rawJsonData) {
            if (this.state.startDate || this.state.endDate) {
                var reparsed = JsonDataLoader.parse(this.state.rawJsonData, this.state.startDate, this.state.endDate);
                DataParser.loadFromJSON(reparsed);
            }
        }

        let filteredData;
        if (this.state.currentManagers.length > 0) {
            filteredData = DataParser.filterByManagers(this.state.currentManagers);
        } else {
            filteredData = DataParser.filterByManager(this.state.currentManager);
        }

        // Apply agent filter if set (supports multi-select)
        if (this.state.currentAgents.length > 0) {
            filteredData = DataParser.filterByAgents(filteredData, this.state.currentAgents);
        } else if (this.state.currentAgent) {
            filteredData = DataParser.filterByAgent(filteredData, this.state.currentAgent);
        }

        // Apply date filter if set
        if (this.state.startDate || this.state.endDate) {
            filteredData = DataParser.filterByDateRange(filteredData, this.state.startDate, this.state.endDate);
        }
        
        // Analysis on filtered data (for charts/insights)
        const analysis = Analytics.analyze(filteredData);
        
        // Calculate risk scores on filtered data so date/manager/agent filters affect leaderboard
        let riskData = Analytics.calculateAgentRiskScores(filteredData);
        
        this.currentData = filteredData;
        this.currentAnalysis = analysis;
        this.currentRiskData = riskData;

        this.updateSummaryCards(filteredData);
        this.updateTables(filteredData);
        this.updateRiskLeaderboard(riskData);
        Charts.initializeAll(analysis, filteredData);

        const insights = InsightsGenerator.generateInsights(analysis, filteredData);
        this.displayInsights(insights);
        this.updateManagerFocus();
    },

    /**
     * Update summary cards - Shows total count from each tab/sheet
     */
    _buildMonthlyBreakdown: function(data) {
        var fmt = function(d) {
            if (!d) return null;
            var dt = (d instanceof Date) ? d : new Date(d);
            if (isNaN(dt)) return null;
            return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        };
        var buckets = { cases: {}, proactive: {}, aged: {}, email: {}, shortCalls: {}, rona: {} };
        (data.caseRecordType || []).forEach(function(r) { var m = fmt(r.createdDate); if (m) buckets.cases[m] = (buckets.cases[m] || 0) + 1; });
        (data.proactiveType || []).forEach(function(r) { var m = fmt(r.createdDate); if (m) buckets.proactive[m] = (buckets.proactive[m] || 0) + 1; });
        (data.age48hrs || []).forEach(function(r) { var m = fmt(r.createdDate || r.open); if (m) buckets.aged[m] = (buckets.aged[m] || 0) + 1; });
        (data.emailChanges || []).forEach(function(r) { var m = fmt(r.editDate); if (m) buckets.email[m] = (buckets.email[m] || 0) + 1; });
        if (data.shortCalls && data.shortCalls._dateRows) {
            data.shortCalls._dateRows.forEach(function(r) { var m = fmt(r.callDate); if (m) buckets.shortCalls[m] = (buckets.shortCalls[m] || 0) + r.count; });
        }
        if (data.ronaTrend && data.ronaTrend._dateRows) {
            data.ronaTrend._dateRows.forEach(function(r) { var m = fmt(r.callDate); if (m) buckets.rona[m] = (buckets.rona[m] || 0) + r.rona; });
        }
        return buckets;
    },

    _buildTooltipText: function(bucket) {
        var keys = Object.keys(bucket).sort();
        if (keys.length === 0) return '';
        return keys.map(function(k) { return k + ': ' + bucket[k].toLocaleString(); }).join('\n');
    },

    _buildTooltipHTML: function(bucket, label) {
        var keys = Object.keys(bucket).sort();
        if (keys.length === 0) return '<div style="padding:8px;font-family:TR Clario,sans-serif;color:#123015;">No data</div>';
        var max = Math.max.apply(null, keys.map(function(k) { return bucket[k]; }));
        var total = keys.reduce(function(s, k) { return s + bucket[k]; }, 0);
        var html = '<div style="min-width:200px;font-family:TR Clario,sans-serif;">';
        html += '<div style="font-weight:700;color:#123015;margin-bottom:8px;font-size:13px;border-bottom:2px solid #d64000;padding-bottom:4px;">' + (label || 'Monthly Breakdown') + ' — ' + total.toLocaleString() + ' total</div>';
        keys.forEach(function(k) {
            var pct = max > 0 ? Math.round((bucket[k] / max) * 100) : 0;
            html += '<div style="display:flex;align-items:center;margin-bottom:4px;font-size:12px;">';
            html += '<span style="width:60px;color:#123015;font-weight:600;">' + k + '</span>';
            html += '<div style="flex:1;height:14px;background:#f0f0f0;border-radius:3px;margin:0 8px;overflow:hidden;">';
            html += '<div style="width:' + pct + '%;height:100%;background:#d64000;border-radius:3px;"></div></div>';
            html += '<span style="width:45px;text-align:right;color:#123015;font-weight:600;">' + bucket[k].toLocaleString() + '</span>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    },

    updateSummaryCards: function(data) {
        var caseRecordCount = data.caseRecordType?.length || 0;
        var proactiveCount = data.proactiveType?.length || 0;
        var age48Count = data.age48hrs?.length || 0;
        var emailChangesCount = data.emailChanges?.length || 0;
        var shortCallsCount = data.shortCalls?.reduce((sum, r) => sum + r.count, 0) || 0;
        var ronaCount = data.ronaTrend?.reduce((sum, r) => sum + r.rona, 0) || 0;

        document.getElementById('caseRecordCount').textContent = caseRecordCount.toLocaleString();
        document.getElementById('proactiveCount').textContent = proactiveCount.toLocaleString();
        document.getElementById('age48Count').textContent = age48Count.toLocaleString();
        document.getElementById('emailChangesCount').textContent = emailChangesCount.toLocaleString();
        document.getElementById('shortCallsCount').textContent = shortCallsCount.toLocaleString();
        document.getElementById('ronaCount').textContent = ronaCount.toLocaleString();

        // Make cards clickable to navigate to respective tabs
        document.querySelectorAll('.summary-card').forEach(card => {
            card.style.cursor = 'pointer';
            card.onclick = function() {
                const tabId = this.getAttribute('data-tab');
                if (tabId) {
                    const tabButton = document.getElementById(tabId);
                    if (tabButton) {
                        tabButton.click();
                        setTimeout(() => {
                            document.querySelector('.tab-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                    }
                }
            };
        });

        // Add pulse animation if there are aged cases
        var ageEl = document.getElementById('age48Count');
        var ageCard = ageEl ? (ageEl.closest('.summary-card') || ageEl.closest('.card')) : null;
        if (ageCard) {
            if (age48Count > 0) { ageCard.classList.add('pulse-danger'); }
            else { ageCard.classList.remove('pulse-danger'); }
        }
        
        // Set pointer cursor on summary cards (click handled by popover listener above)
        document.querySelectorAll('.summary-card').forEach(card => {
            card.style.cursor = 'pointer';
        });
    },

    /**
     * Populate manager filter dropdown
     */
    populateManagerFilter: function() {
        const managers = DataParser.getUniqueManagers();
        const list = document.getElementById('mgrMsList');
        if (!list) return;

        const selected = new Set(this.state.currentManagers);
        list.innerHTML = managers.map(mgr => {
            const checked = selected.has(mgr) ? 'checked' : '';
            const cls = checked ? 'agent-ms-item selected' : 'agent-ms-item';
            return `<label class="${cls}"><input type="checkbox" value="${mgr}" ${checked}> ${mgr}</label>`;
        }).join('');

        this.populateAgentFilter();
    },

    _initManagerMultiSelect: function() {
        var self = this;
        var toggle = document.getElementById('mgrMsToggle');
        var dropdown = document.getElementById('mgrMsDropdown');
        var search = document.getElementById('mgrMsSearch');
        var applyBtn = document.getElementById('mgrMsApply');
        var clearBtn = document.getElementById('mgrMsClear');
        if (!toggle || !dropdown) return;

        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('d-none');
            if (!dropdown.classList.contains('d-none')) {
                search.value = '';
                search.focus();
                self._filterMgrList('');
            }
        });

        search.addEventListener('input', function() { self._filterMgrList(this.value); });
        search.addEventListener('click', function(e) { e.stopPropagation(); });
        dropdown.addEventListener('click', function(e) { e.stopPropagation(); });

        applyBtn.addEventListener('click', function() {
            self._applyMgrMultiSelect();
            dropdown.classList.add('d-none');
        });

        clearBtn.addEventListener('click', function() {
            self.state.currentManagers = [];
            self.state.currentManager = '';
            self.state.currentAgents = [];
            self.state.currentAgent = '';
            self.populateManagerFilter();
            self._updateMgrMsLabel();
            self._updateAgentMsLabel();
            self._applyMgrMultiSelect();
            dropdown.classList.add('d-none');
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('#managerMultiSelect')) {
                dropdown.classList.add('d-none');
            }
        });
    },

    _filterMgrList: function(query) {
        var items = document.querySelectorAll('#mgrMsList .agent-ms-item');
        var q = (query || '').toLowerCase();
        items.forEach(function(item) {
            item.style.display = item.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
        });
    },

    _applyMgrMultiSelect: function() {
        var checkboxes = document.querySelectorAll('#mgrMsList input[type="checkbox"]:checked');
        this.state.currentManagers = Array.from(checkboxes).map(function(cb) { return cb.value; });
        this.state.currentManager = this.state.currentManagers.length === 1 ? this.state.currentManagers[0] : '';
        this.state.currentAgents = [];
        this.state.currentAgent = '';
        this._updateMgrMsLabel();
        this._updateAgentMsLabel();
        this.populateAgentFilter();
        this.refreshDashboard();
    },

    _updateMgrMsLabel: function() {
        var label = document.querySelector('.mgr-ms-label');
        if (!label) return;
        var count = this.state.currentManagers.length;
        if (count === 0) { label.textContent = 'All Managers'; }
        else if (count === 1) { label.textContent = this.state.currentManagers[0]; }
        else { label.textContent = count + ' Managers Selected'; }
    },

    /**
     * Populate agent filter dropdown
     */
    populateAgentFilter: function() {
        var mgrFilter = this.state.currentManagers.length > 0 ? this.state.currentManagers : (this.state.currentManager || '');
        const agents = Array.isArray(mgrFilter) ? DataParser.getUniqueAgentsForManagers(mgrFilter) : DataParser.getUniqueAgents(mgrFilter);
        const list = document.getElementById('agentMsList');
        if (!list) return;

        const selected = new Set(this.state.currentAgents);
        list.innerHTML = agents.map(agent => {
            const checked = selected.has(agent) ? 'checked' : '';
            const cls = checked ? 'agent-ms-item selected' : 'agent-ms-item';
            return `<label class="${cls}"><input type="checkbox" value="${agent}" ${checked}> ${agent}</label>`;
        }).join('');
    },

    _initAgentMultiSelect: function() {
        var self = this;
        var toggle = document.getElementById('agentMsToggle');
        var dropdown = document.getElementById('agentMsDropdown');
        var search = document.getElementById('agentMsSearch');
        var applyBtn = document.getElementById('agentMsApply');
        var clearBtn = document.getElementById('agentMsClear');
        if (!toggle || !dropdown) return;

        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('d-none');
            if (!dropdown.classList.contains('d-none')) {
                search.value = '';
                search.focus();
                self._filterAgentList('');
            }
        });

        search.addEventListener('input', function() {
            self._filterAgentList(this.value);
        });
        search.addEventListener('click', function(e) { e.stopPropagation(); });

        dropdown.addEventListener('click', function(e) { e.stopPropagation(); });

        applyBtn.addEventListener('click', function() {
            self._applyAgentMultiSelect();
            dropdown.classList.add('d-none');
        });

        clearBtn.addEventListener('click', function() {
            self.state.currentAgents = [];
            self.state.currentAgent = '';
            self.populateAgentFilter();
            self._updateAgentMsLabel();
            self._applyAgentMultiSelect();
            dropdown.classList.add('d-none');
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('#agentMultiSelect')) {
                dropdown.classList.add('d-none');
            }
        });
    },

    _filterAgentList: function(query) {
        var items = document.querySelectorAll('#agentMsList .agent-ms-item');
        var q = (query || '').toLowerCase();
        items.forEach(function(item) {
            var text = item.textContent.toLowerCase();
            item.style.display = text.indexOf(q) !== -1 ? '' : 'none';
        });
    },

    _applyAgentMultiSelect: function() {
        var checkboxes = document.querySelectorAll('#agentMsList input[type="checkbox"]:checked');
        this.state.currentAgents = Array.from(checkboxes).map(function(cb) { return cb.value; });
        this.state.currentAgent = this.state.currentAgents.length === 1 ? this.state.currentAgents[0] : '';
        this._updateAgentMsLabel();
        this.refreshDashboard();
    },

    _updateAgentMsLabel: function() {
        var label = document.querySelector('.agent-ms-label');
        if (!label) return;
        var count = this.state.currentAgents.length;
        if (count === 0) {
            label.textContent = 'All Agents';
        } else if (count === 1) {
            label.textContent = this.state.currentAgents[0];
        } else {
            label.textContent = count + ' Agents Selected';
        }
    },

    /**
     * Update all tables
     */
    updateTables: function(data) {
        this.updateCaseRecordTable(data.caseRecordType);
        this.updateCasesReportTab(data.caseRecordType, data.age48hrs);
        this.updateProactiveTable(data.proactiveType);
        this.updateAgeTable(data.age48hrs);
        this.updateEmailChangesTable(data.emailChanges);
        this.updateShortCallsTable(data.shortCalls);
        this.updateRonaTable(data.ronaTrend);

        ['caseRecordTable', 'casesReportTable', 'proactiveTable', 'ageTable', 'emailChangesTable', 'shortCallsTable', 'ronaTable'].forEach(function(id) {
            App.enableTableFilters(id);
        });
    },

    /**
     * Update Case Record table
     */
    updateCaseRecordTable: function(data) {
        const tbody = document.querySelector('#caseRecordTable tbody');
        if (!tbody) return;
        
        tbody.innerHTML = data.slice(0, 500).map(row => {
            var dateStr = '';
            if (row.createdDate) {
                var d = new Date(row.createdDate);
                dateStr = isNaN(d) ? '' : d.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
            }
            return `<tr>
                <td>${row.caseNumber}</td>
                <td>${row.caseOwner}</td>
                <td>${row.manager}</td>
                <td>${row.recordType}</td>
                <td>${row.origin}</td>
                <td>${dateStr}</td>
            </tr>`;
        }).join('');
    },

    _casesReportCharts: {},
    _casesReportFullData: [],

    updateCasesReportTab: function(data, ageData) {
        // Merge age info into cases
        var ageMap = {};
        if (ageData) {
            ageData.forEach(function(r) { if (r.caseNumber) ageMap[r.caseNumber] = r.age; });
        }
        (data || []).forEach(function(r) {
            if (ageMap[r.caseNumber] !== undefined) r.age = ageMap[r.caseNumber];
        });
        this._casesReportFullData = data || [];

        // Populate filter dropdowns
        var statuses = {};
        var origins = {};
        var managers = {};
        data.forEach(function(r) {
            if (r.status) statuses[r.status] = true;
            if (r.origin) origins[r.origin] = true;
            if (r.manager) managers[r.manager] = true;
        });

        var statusSel = document.getElementById('casesStatusFilter');
        var originSel = document.getElementById('casesOriginFilter');
        var mgrSel = document.getElementById('casesManagerFilter');
        if (statusSel) {
            statusSel.innerHTML = '<option value="">All</option>' +
                Object.keys(statuses).sort().map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
        }
        if (originSel) {
            originSel.innerHTML = '<option value="">All</option>' +
                Object.keys(origins).sort().map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
        }
        if (mgrSel) {
            mgrSel.innerHTML = '<option value="">All</option>' +
                Object.keys(managers).sort().map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
        }

        this._renderCasesReport(data);
    },

    _renderCasesReport: function(data) {
        // Table
        var tbody = document.querySelector('#casesReportTable tbody');
        if (tbody) {
            tbody.innerHTML = data.slice(0, 200).map(function(row) {
                var dateStr = '';
                if (row.createdDate) { var d = new Date(row.createdDate); dateStr = isNaN(d) ? '' : d.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}); }
                return '<tr><td>' + row.caseNumber + '</td><td>' + row.caseOwner +
                    '</td><td>' + row.manager + '</td><td>' + (row.age || '') +
                    '</td><td>' + row.status + '</td><td>' + row.origin + '</td><td>' + dateStr + '</td></tr>';
            }).join('');
        }

        // Count by agent + status (top 20, stacked)
        var agentStatus = {};
        var allStatuses = new Set();
        data.forEach(function(r) {
            if (!r.caseOwner) return;
            if (!agentStatus[r.caseOwner]) agentStatus[r.caseOwner] = { _total: 0 };
            agentStatus[r.caseOwner][r.status || 'Unknown'] = (agentStatus[r.caseOwner][r.status || 'Unknown'] || 0) + 1;
            agentStatus[r.caseOwner]._total++;
            allStatuses.add(r.status || 'Unknown');
        });
        var sorted = Object.entries(agentStatus).sort(function(a, b) { return b[1]._total - a[1]._total; }).slice(0, 20);
        var statusArr = Array.from(allStatuses);
        var statusColors = { 'Closed': '#123015', 'Merged': '#4db299', 'Cancelled': '#e9b045', 'Work In Progress': '#8fcb64', 'Open': '#d64000', 'Set for Auto Close': '#e1f4cd', 'Resolved': '#0874e3', 'Escalated': '#d4792a', 'New': '#e3f3ee', 'In Progress': '#e9b045', 'Pending': '#f8eadd' };
        var fallbackColors = ['#d64000', '#123015', '#e9b045', '#4db299', '#8fcb64', '#0874e3', '#d4792a', '#e3f1fd', '#e3f3ee', '#f8eadd', '#e1f4cd', '#fcf2da'];

        var ctx = document.getElementById('casesReportChart');
        if (ctx) {
            if (this._casesReportCharts.agent) this._casesReportCharts.agent.destroy();
            this._casesReportCharts.agent = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: sorted.map(function(e) { return e[0]; }),
                    datasets: statusArr.map(function(s, i) {
                        return {
                            label: s,
                            data: sorted.map(function(e) { return e[1][s] || 0; }),
                            backgroundColor: statusColors[s] || fallbackColors[i % fallbackColors.length]
                        };
                    })
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    plugins: { legend: { position: 'top' } },
                    scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }
                }
            });
        }

        // Status chart
        var statusCount = {};
        data.forEach(function(r) {
            if (r.status) statusCount[r.status] = (statusCount[r.status] || 0) + 1;
        });
        var statusCtx = document.getElementById('casesStatusChart');
        if (statusCtx) {
            if (this._casesReportCharts.status) this._casesReportCharts.status.destroy();
            this._casesReportCharts.status = new Chart(statusCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(statusCount),
                    datasets: [{
                        label: 'Count',
                        data: Object.values(statusCount),
                        backgroundColor: Object.keys(statusCount).map(function(s, i) { return statusColors[s] || fallbackColors[i % fallbackColors.length]; })
                    }]
                },
                options: { responsive: true, plugins: { legend: { display: false } } }
            });
        }

        // Origin chart stacked by status
        var originStatus = {};
        data.forEach(function(r) {
            if (!r.origin) return;
            if (!originStatus[r.origin]) originStatus[r.origin] = {};
            originStatus[r.origin][r.status || 'Unknown'] = (originStatus[r.origin][r.status || 'Unknown'] || 0) + 1;
        });
        var originCtx = document.getElementById('casesOriginReportChart');
        if (originCtx) {
            if (this._casesReportCharts.origin) this._casesReportCharts.origin.destroy();
            var originLabels = Object.keys(originStatus);
            this._casesReportCharts.origin = new Chart(originCtx, {
                type: 'bar',
                data: {
                    labels: originLabels,
                    datasets: statusArr.map(function(s, i) {
                        return {
                            label: s,
                            data: originLabels.map(function(o) { return originStatus[o][s] || 0; }),
                            backgroundColor: statusColors[s] || fallbackColors[i % fallbackColors.length]
                        };
                    })
                },
                options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'top' } } }
            });
        }

        App.enableTableFilters('casesReportTable');
    },

    _applyCasesReportFilter: function() {
        var status = document.getElementById('casesStatusFilter').value;
        var origin = document.getElementById('casesOriginFilter').value;
        var manager = document.getElementById('casesManagerFilter').value;
        var filtered = this._casesReportFullData.filter(function(r) {
            if (status && r.status !== status) return false;
            if (origin && r.origin !== origin) return false;
            if (manager && r.manager !== manager) return false;
            return true;
        });
        this._renderCasesReport(filtered);
    },

    /**
     * Update Proactive table
     */
    updateProactiveTable: function(data) {
        const tbody = document.querySelector('#proactiveTable tbody');
        if (!tbody) return;

        tbody.innerHTML = data.slice(0, 500).map(row => {
            var dateStr = '';
            if (row.createdDate) { var d = new Date(row.createdDate); dateStr = isNaN(d) ? '' : d.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}); }
            return `<tr>
                <td>${row.caseNumber}</td>
                <td>${row.caseOwner}</td>
                <td>${row.manager}</td>
                <td><span class="badge bg-info">${row.proactiveType}</span></td>
                <td>${dateStr}</td>
            </tr>`;
        }).join('');

        // Stacked bar chart by agent, colored by proactive type
        var ctx = document.getElementById('proactiveByAgentChart');
        if (ctx) {
            if (this._proactiveByAgentChart) this._proactiveByAgentChart.destroy();
            var agentTypes = {};
            var types = new Set();
            data.forEach(function(r) {
                if (!r.caseOwner) return;
                if (!agentTypes[r.caseOwner]) agentTypes[r.caseOwner] = {};
                agentTypes[r.caseOwner][r.proactiveType] = (agentTypes[r.caseOwner][r.proactiveType] || 0) + 1;
                types.add(r.proactiveType);
            });
            var sorted = Object.entries(agentTypes).map(function(e) {
                var total = Object.values(e[1]).reduce(function(s, v) { return s + v; }, 0);
                return [e[0], e[1], total];
            }).sort(function(a, b) { return b[2] - a[2]; }).slice(0, 20);
            var typeArr = Array.from(types);
            var colors = ['#d64000', '#123015', '#e9b045', '#4db299', '#8fcb64', '#0874e3', '#d4792a', '#fcf2da', '#e3f3ee', '#e3f1fd', '#f8eadd', '#e1f4cd'];
            var datasets = typeArr.map(function(t, i) {
                return {
                    label: t,
                    data: sorted.map(function(e) { return e[1][t] || 0; }),
                    backgroundColor: colors[i % colors.length]
                };
            });
            this._proactiveByAgentChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: sorted.map(function(e) { return e[0]; }), datasets: datasets },
                options: { indexAxis: 'y', responsive: true, scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }, plugins: { legend: { position: 'top' } } }
            });
        }
    },

    /**
     * Update Age table
     */
    updateAgeTable: function(data) {
        const tbody = document.querySelector('#ageTable tbody');
        if (!tbody) return;
        
        // Sort by age descending
        const sorted = [...data].sort((a, b) => b.age - a.age);
        
        // Update critical count
        const criticalCount = data.filter(r => r.age > 96).length;
        document.getElementById('criticalAgeCount').textContent = criticalCount;
        
        // Show/hide critical alert
        const alert = document.getElementById('criticalAgeAlert');
        if (criticalCount > 0) {
            alert.classList.remove('d-none');
        } else {
            alert.classList.add('d-none');
        }
        
        tbody.innerHTML = sorted.slice(0, 500).map(row => {
            const statusClass = row.status === 'critical' ? 'danger' :
                               (row.status === 'warning' ? 'warning' : 'success');
            const statusText = row.status === 'critical' ? 'Critical' :
                              (row.status === 'warning' ? 'Warning' : 'Normal');
            var dateStr = '';
            if (row.createdDate) { var d = new Date(row.createdDate); dateStr = isNaN(d) ? '' : d.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}); }
            return `
                <tr class="${row.status === 'critical' ? '' : ''}">
                    <td>${row.caseNumber}</td>
                    <td>${row.caseOwner}</td>
                    <td>${row.manager}</td>
                    <td><strong>${row.age.toFixed(0)}</strong></td>
                    <td>${row.open}</td>
                    <td>${row.origin}</td>
                    <td><span class="badge bg-${statusClass}">${statusText}</span></td>
                    <td>${dateStr}</td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Update Email Changes table
     */
    updateEmailChangesTable: function(data) {
        const tbody = document.querySelector('#emailChangesTable tbody');
        if (!tbody) return;
        
        const sorted = [...data].sort((a, b) => {
            if (!a.editDate || !b.editDate) return 0;
            return new Date(b.editDate) - new Date(a.editDate);
        });
        
        tbody.innerHTML = sorted.slice(0, 500).map(row => {
            const changeTypeClass = row.changeType === 'punctuation' ? 'danger' :
                                   (row.changeType === 'minor_edit' ? 'warning' : 'secondary');
            const changeTypeLabel = row.changeType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            const dateStr = row.editDate ? row.editDate.toLocaleDateString() : 'Unknown';
            
            return `
                <tr class="${row.changeType === 'punctuation' ? 'table-warning' : ''}">
                    <td>${row.fieldEvent}</td>
                    <td>${dateStr}</td>
                    <td class="text-truncate" style="max-width: 200px;" title="${row.oldValue}">${row.oldValue}</td>
                    <td class="text-truncate" style="max-width: 200px;" title="${row.newValue}">${row.newValue}</td>
                    <td>${row.editedBy}</td>
                    <td><span class="badge bg-${changeTypeClass}">${changeTypeLabel}</span></td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Update Short Calls table
     */
    updateShortCallsTable: function(data) {
        const tbody = document.querySelector('#shortCallsTable tbody');
        if (!tbody) return;
        
        const analysis = Analytics.analyzeShortCalls(data);
        const { rankings, stats } = analysis;
        
        tbody.innerHTML = rankings.slice(0, 50).map(row => {
            const statusClass = row.status === 'outlier' ? 'danger' :
                               (row.status === 'warning' ? 'warning' : 'success');
            const statusText = row.status === 'outlier' ? 'Outlier' :
                              (row.status === 'warning' ? 'Warning' : 'Normal');
            const vsAvg = row.vsAverage > 0 ? `+${row.vsAverage.toFixed(0)}` : row.vsAverage.toFixed(0);
            
            return `
                <tr class="${row.status === 'outlier' ? '' : ''}">
                    <td>${row.agentName}</td>
                    <td><strong>${row.count}</strong></td>
                    <td>${vsAvg} (${row.percentOfAvg}x avg)</td>
                    <td><span class="badge bg-${statusClass}">${statusText}</span></td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Update RONA table
     */
    updateRonaTable: function(data) {
        const tbody = document.querySelector('#ronaTable tbody');
        if (!tbody) return;
        
        const analysis = Analytics.analyzeRonaTrend(data);
        const { rankings, stats } = analysis;
        
        tbody.innerHTML = rankings.slice(0, 50).map(row => {
            const statusClass = row.status === 'outlier' ? 'danger' :
                               (row.status === 'warning' ? 'warning' : 'info');
            const statusText = row.status === 'outlier' ? 'High' :
                              (row.status === 'warning' ? 'Elevated' : 'Normal');
            const vsAvg = row.vsAverage > 0 ? `+${row.vsAverage.toFixed(0)}` : row.vsAverage.toFixed(0);
            
            return `
                <tr class="${row.status === 'outlier' ? '' : ''}">
                    <td>${row.agentName}</td>
                    <td><strong>${row.rona}</strong></td>
                    <td>${vsAvg} (${row.percentOfAvg}x avg)</td>
                    <td><span class="badge bg-${statusClass}">${statusText}</span></td>
                </tr>
            `;
        }).join('');
    },

    // Store for show more/all functionality
    _leaderboardData: [],
    _leaderboardDisplayCount: 15,

    /**
     * Update Risk Leaderboard
     */
    updateRiskLeaderboard: function(riskData) {
        const tbody = document.getElementById('riskLeaderboardBody');
        if (!tbody) return;
        
        const { rankings, counts, highRiskAgents } = riskData;
        
        // Store for show more functionality
        this._leaderboardData = rankings;
        this._leaderboardDisplayCount = 15;
        
        // Update counts
        document.getElementById('highRiskCount').textContent = counts.critical + counts.high;
        document.getElementById('criticalRiskCount').textContent = counts.critical;
        document.getElementById('highRiskCountDetail').textContent = counts.high;
        document.getElementById('mediumRiskCount').textContent = counts.medium;
        document.getElementById('lowRiskCount').textContent = counts.low;
        
        // Render table rows
        this.renderLeaderboardRows();
        
        // Create risk distribution chart
        this.createRiskDistributionChart(counts);
    },

    /**
     * Render leaderboard rows with current display count
     */
    renderLeaderboardRows: function() {
        const tbody = document.getElementById('riskLeaderboardBody');
        if (!tbody) return;
        
        const rankings = this._leaderboardData;
        
        if (rankings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">No agent data available</td></tr>`;
            return;
        }
        
        tbody.innerHTML = rankings.slice(0, this._leaderboardDisplayCount).map((agent, index) => {
            // Use originalRank (from full data) instead of index
            const rank = agent.originalRank || (index + 1);
            const rankColor = agent.riskClass === 'danger' ? '#d64000' :
                             (agent.riskClass === 'warning' ? '#e9b045' :
                             (agent.riskClass === 'info' ? '#fcf2da' : '#123015'));
            const rankTextColor = agent.riskClass === 'info' ? '#123015' : '#ffffff';
            const rankBadge = `<span class="badge rounded-circle" style="background-color:${rankColor};color:${rankTextColor}">${rank}</span>`;
            
            // Progress bar for risk score
            const progressColor = agent.riskClass === 'danger' ? '#d64000' :
                                 (agent.riskClass === 'warning' ? '#e9b045' :
                                 (agent.riskClass === 'info' ? '#fcf2da' : '#123015'));
            
            // Highlight cells with high z-scores
            const shortCallsClass = agent.shortCallsZScore > 1.5 ? 'text-danger fw-bold' : '';
            const ronaClass = agent.ronaZScore > 1.5 ? 'text-danger fw-bold' : '';
            const emailClass = agent.emailZScore > 1.5 ? 'text-danger fw-bold' : '';
            const agedClass = agent.agedZScore > 1.5 ? 'text-danger fw-bold' : '';
            
            return `
                <tr class="${''}">
                    <td class="text-center">${rankBadge}</td>
                    <td>
                        <a href="#" class="text-decoration-none agent-filter-link" 
                           onclick="event.preventDefault(); App.filterByAgentClick('${agent.agent}')"
                           title="Click to filter by this agent">
                            <strong>${agent.agent}</strong>
                            <i class="bi bi-funnel-fill ms-1 small text-primary"></i>
                        </a>
                    </td>
                    <td class="text-center">
                        <div class="d-flex align-items-center">
                            <div class="progress flex-grow-1 me-2" style="height: 8px;">
                                <div class="progress-bar" role="progressbar" 
                                     style="width: ${agent.riskScore}%; background-color: ${progressColor}"></div>
                            </div>
                            <span class="fw-bold" style="min-width: 35px;">${agent.riskScore}</span>
                        </div>
                    </td>
                    <td class="text-center ${shortCallsClass}">${agent.shortCalls}</td>
                    <td class="text-center ${ronaClass}">${agent.rona}</td>
                    <td class="text-center ${emailClass}">${agent.emailChanges}</td>
                    <td class="text-center ${agedClass}">${agent.agedCases}</td>
                    <td><span class="badge" style="background-color:${progressColor};color:${agent.riskClass === 'info' ? '#123015' : '#fff'}">${agent.riskLevel}</span></td>
                </tr>
            `;
        }).join('');
        
        // Add Show More / Show All buttons
        this.renderLeaderboardButtons();
    },

    /**
     * Render Show More/All buttons for Leaderboard
     */
    renderLeaderboardButtons: function() {
        const table = document.getElementById('riskLeaderboardBody')?.closest('table');
        if (!table) return;
        
        // Remove existing buttons
        const existingBtns = table.parentElement.querySelector('.leaderboard-buttons');
        if (existingBtns) existingBtns.remove();
        
        const totalCount = this._leaderboardData.length;
        if (totalCount <= this._leaderboardDisplayCount) return;
        
        const remaining = totalCount - this._leaderboardDisplayCount;
        const btnContainer = document.createElement('div');
        btnContainer.className = 'leaderboard-buttons text-center mt-3';
        btnContainer.innerHTML = `
            <button class="btn btn-outline-primary btn-sm me-2" onclick="App.showMoreLeaderboard()">
                <i class="bi bi-plus-circle me-1"></i>Show More (${Math.min(15, remaining)})
            </button>
            <button class="btn btn-outline-secondary btn-sm" onclick="App.showAllLeaderboard()">
                <i class="bi bi-list-ul me-1"></i>Show All (${totalCount})
            </button>
        `;
        table.parentElement.appendChild(btnContainer);
    },

    /**
     * Show more agents in leaderboard
     */
    showMoreLeaderboard: function() {
        this._leaderboardDisplayCount += 15;
        this.renderLeaderboardRows();
    },

    /**
     * Show all agents in leaderboard
     */
    showAllLeaderboard: function() {
        this._leaderboardDisplayCount = this._leaderboardData.length;
        this.renderLeaderboardRows();
    },

    /**
     * Create Risk Distribution Chart
     */
    createRiskDistributionChart: function(counts) {
        const ctx = document.getElementById('riskDistributionChart');
        if (!ctx) return;
        
        // Destroy existing chart if any
        if (this.riskChart) {
            this.riskChart.destroy();
        }
        
        this.riskChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'High', 'Medium', 'Low'],
                datasets: [{
                    data: [counts.critical, counts.high, counts.medium, counts.low],
                    backgroundColor: ['#d64000', '#e9b045', '#fcf2da', '#123015'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    },

    /**
     * Display insights
     */
    displayInsights: function(insights) {
        var container = document.getElementById('insightsContainer');
        var countBadge = document.getElementById('insightCount');
        if (!container) return;

        var filterBanner = '';
        var mgr = this.state.currentManagers.length > 0 ? this.state.currentManagers.join(', ') : this.state.currentManager;
        var agt = this.state.currentAgents.length > 0 ? this.state.currentAgents.join(', ') : this.state.currentAgent;
        var dateLabel = '';
        if (this.state.startDate || this.state.endDate) {
            var s = this.state.startDate ? new Date(this.state.startDate).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
            var e = this.state.endDate ? new Date(this.state.endDate).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '';
            dateLabel = s && e ? (s + ' — ' + e) : (s || e);
        }
        if (mgr || agt || dateLabel) {
            var parts = [];
            if (mgr) parts.push('Manager: ' + mgr);
            if (agt) parts.push('Agent: ' + agt);
            if (dateLabel) parts.push('<i class="bi bi-calendar3 me-1"></i>' + dateLabel);
            filterBanner = '<div class="col-12 mb-2"><div class="d-flex align-items-center gap-2 px-3 py-2 rounded-2 flex-wrap" ' +
                'style="background:linear-gradient(90deg,rgba(214,64,0,0.1),rgba(18,48,21,0.05));border:1px solid rgba(214,64,0,0.15);">' +
                '<i class="bi bi-funnel-fill text-primary"></i>' +
                '<span class="fw-semibold" style="color:#123015;font-size:0.85rem;">Insights filtered: <strong>' + parts.join(' &bull; ') + '</strong></span>' +
                '<button class="btn btn-sm btn-outline-primary ms-auto" style="font-size:0.7rem;padding:2px 10px;" ' +
                'onclick="App.resetDateFilter()"><i class="bi bi-x-lg me-1"></i>Clear All</button>' +
                '</div></div>';
        }

        container.innerHTML = filterBanner + InsightsGenerator.renderInsights(insights);

        // Dismiss insight popovers on outside click
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.insight-popover') && !e.target.closest('[data-insight-popover]')) {
                InsightsGenerator._closeAllInsightPopovers();
            }
        });

        var counts = InsightsGenerator.getInsightCounts(insights);
        countBadge.textContent = counts.total;

        if (counts.critical > 0) {
            countBadge.className = 'badge bg-danger text-white ms-2';
        } else if (counts.warning > 0) {
            countBadge.className = 'badge bg-warning text-dark ms-2';
        } else {
            countBadge.className = 'badge bg-primary ms-2';
        }
    },

    /**
     * Toggle auto refresh
     */
    toggleAutoRefresh: function(enabled) {
        this.state.autoRefreshEnabled = enabled;
        
        if (enabled && this.state.lastFilePath) {
            // Refresh every 5 minutes
            this.state.autoRefreshInterval = setInterval(() => {
                this.loadFromPath(this.state.lastFilePath);
            }, 5 * 60 * 1000);
            this.showStatus('Auto-refresh enabled (every 5 minutes)', 'info');
        } else {
            if (this.state.autoRefreshInterval) {
                clearInterval(this.state.autoRefreshInterval);
                this.state.autoRefreshInterval = null;
            }
            if (!enabled) {
                this.showStatus('Auto-refresh disabled', 'info');
            }
        }
    },

    /**
     * Initialize theme — light mode only
     */
    initTheme: function() {
        document.documentElement.setAttribute('data-bs-theme', 'light');
    },

    enableTableFilters: function(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        if (!thead || !tbody) return;

        let filterRow = thead.querySelector('.table-filter-row');
        if (filterRow) filterRow.remove();

        const headers = thead.querySelectorAll('th');
        filterRow = document.createElement('tr');
        filterRow.className = 'table-filter-row';
        filterRow.style.cssText = 'background:rgba(255,255,255,0.95);';

        headers.forEach(function(th, colIdx) {
            const td = document.createElement('td');
            td.style.cssText = 'padding:4px 6px;';
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm table-col-filter';
            select.dataset.col = colIdx;
            select.style.cssText = 'font-size:0.75rem; padding:2px 24px 2px 6px; border-radius:6px; border:1px solid #123015; color:#123015;';

            const values = new Set();
            tbody.querySelectorAll('tr').forEach(function(row) {
                const cell = row.cells[colIdx];
                if (cell) values.add(cell.textContent.trim());
            });

            select.innerHTML = '<option value="">All</option>' +
                Array.from(values).sort().map(function(v) {
                    return '<option value="' + v.replace(/"/g, '&quot;') + '">' + v + '</option>';
                }).join('');

            var headerText = th.textContent.trim().toLowerCase();
            var isDateCol = (headerText === 'date' || headerText === 'edit date');

            select.addEventListener('change', function() {
                var filters = {};
                filterRow.querySelectorAll('.table-col-filter').forEach(function(s) {
                    if (s.value) filters[s.dataset.col] = s.value;
                });
                tbody.querySelectorAll('tr').forEach(function(row) {
                    var show = true;
                    Object.keys(filters).forEach(function(ci) {
                        var cell = row.cells[ci];
                        if (cell && cell.textContent.trim() !== filters[ci]) show = false;
                    });
                    row.style.display = show ? '' : 'none';
                });

                if (isDateCol) {
                    var val = select.value;
                    if (!val) {
                        App.resetDateFilter();
                    } else {
                        var parsed = new Date(val);
                        if (!isNaN(parsed)) {
                            var fmt = function(d) { return d.toISOString().split('T')[0]; };
                            document.getElementById('startDate').value = fmt(parsed);
                            document.getElementById('endDate').value = fmt(parsed);
                            App.applyDateFilter();
                        }
                    }
                }
            });

            td.appendChild(select);
            filterRow.appendChild(td);
        });

        thead.appendChild(filterRow);
    },

    /**
     * Export data to CSV
     */
    _tabDataMap: {
        caseRecord:    { key: 'caseRecordType',  name: 'case_record_type' },
        casesReport:   { key: '_casesReport',    name: 'cases_report' },
        proactive:     { key: 'proactiveType',   name: 'proactive_type' },
        age48:         { key: 'age48hrs',        name: 'age_48hrs' },
        emailChanges:  { key: 'emailChanges',    name: 'email_changes' },
        shortCalls:    { key: 'shortCalls',      name: 'short_calls' },
        rona:          { key: 'ronaTrend',       name: 'rona_trend' }
    },

    _downloadCSV: function(data, filename) {
        if (!data || !data.length) return false;
        var headers = Object.keys(data[0]);
        var csvContent = [
            headers.join(','),
            ...data.map(function(row) {
                return headers.map(function(h) {
                    var val = row[h];
                    if (val == null) return '';
                    if (val instanceof Date) val = val.toISOString();
                    val = String(val);
                    if (val.includes(',') || val.includes('"') || val.includes('\n')) val = '"' + val.replace(/"/g, '""') + '"';
                    return val;
                }).join(',');
            })
        ].join('\n');
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename + '_' + new Date().toISOString().split('T')[0] + '.csv';
        link.click();
        return true;
    },

    _getTabData: function(tabKey) {
        if (tabKey === 'casesReport') return this._casesReportFullData || [];
        var map = this._tabDataMap[tabKey];
        return map ? (this.currentData[map.key] || []) : [];
    },

    exportTabCSV: function(tabKey) {
        if (!this.state.dataLoaded) {
            this.showStatus('No data to export', 'warning');
            return 0;
        }
        if (tabKey === 'all') {
            var self = this;
            if (typeof XLSX !== 'undefined') {
                var wb = XLSX.utils.book_new();
                var count = 0;
                Object.keys(this._tabDataMap).forEach(function(key) {
                    var data = self._getTabData(key);
                    if (data && data.length) {
                        var ws = XLSX.utils.json_to_sheet(data);
                        XLSX.utils.book_append_sheet(wb, ws, self._tabDataMap[key].name.substring(0, 31));
                        count++;
                    }
                });
                if (count > 0) {
                    XLSX.writeFile(wb, 'ARP_Export_' + new Date().toISOString().split('T')[0] + '.xlsx');
                    this.showStatus(count + ' tabs exported to Excel', 'success');
                }
                return count;
            }
            var count = 0;
            Object.keys(this._tabDataMap).forEach(function(key, i) {
                var data = self._getTabData(key);
                setTimeout(function() {
                    if (self._downloadCSV(data, self._tabDataMap[key].name)) count++;
                }, i * 500);
            });
            this.showStatus('Exporting CSV files...', 'success');
            return count;
        }
        var data = this._getTabData(tabKey);
        var map = this._tabDataMap[tabKey];
        if (!data.length) {
            this.showStatus('No data to export for this tab', 'warning');
            return 0;
        }
        this._downloadCSV(data, map ? map.name : tabKey);
        this.showStatus('CSV exported: ' + (map ? map.name : tabKey), 'success');
        return 1;
    },

    exportToCSV: function() {
        var activeTab = document.querySelector('.tab-pane.active');
        var tabId = activeTab ? activeTab.id : 'caseRecord';
        var keyMap = { caseRecord: 'caseRecord', casesReport: 'casesReport', proactive: 'proactive', age48: 'age48', emailChangesTab: 'emailChanges', shortCalls: 'shortCalls', rona: 'rona' };
        this.exportTabCSV(keyMap[tabId] || 'caseRecord');
    },

    /**
     * Export to PDF
     */
    exportToPDF: function() {
        if (!this.state.dataLoaded) {
            this.showStatus('No data to export', 'warning');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Title
            doc.setFontSize(18);
            doc.text('Agent Risk Profile Report', 14, 20);
            
            // Date
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
            
            // Summary
            const summary = DataParser.getSummary();
            doc.setFontSize(12);
            doc.text('Executive Summary', 14, 40);
            doc.setFontSize(10);
            doc.text(`Total Cases: ${summary.totalCases}`, 14, 48);
            doc.text(`Cases Over 48hrs: ${summary.over48hrs}`, 14, 54);
            doc.text(`Email Changes: ${summary.emailChanges}`, 14, 60);
            doc.text(`Short Calls: ${summary.shortCallsTotal}`, 14, 66);
            doc.text(`Total RONA: ${summary.ronaTotal}`, 14, 72);
            doc.text(`Total Agents: ${summary.totalAgents}`, 14, 78);
            
            // Add current tab table
            const activeTab = document.querySelector('.tab-pane.active');
            const table = activeTab?.querySelector('table');
            
            if (table) {
                doc.autoTable({
                    html: table,
                    startY: 90,
                    theme: 'grid',
                    headStyles: { fillColor: [18, 48, 21] },
                    styles: { fontSize: 8 }
                });
            }
            
            // Save
            doc.save(`dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`);
            this.showStatus('PDF exported successfully', 'success');
        } catch (error) {
            console.error('PDF export error:', error);
            this.showStatus('Error exporting PDF', 'danger');
        }
    },

    /**
     * Show loading spinner
     */
    showLoading: function(show) {
        var spinner = document.getElementById('loadingSpinner');
        var content = document.getElementById('dashboardContent');
        if (!spinner || !content) return;

        if (show) {
            spinner.classList.remove('d-none');
            content.classList.add('d-none');
        } else {
            spinner.classList.add('d-none');
        }
    },

    /**
     * Show status message
     */
    showStatus: function(message, type = 'info') {
        var statusDiv = document.getElementById('dataStatus');
        var statusText = document.getElementById('statusText');
        if (!statusDiv || !statusText) return;

        statusDiv.classList.remove('d-none');
        statusText.textContent = message;

        var bar = statusDiv.querySelector('.hero-status-bar') || statusDiv.querySelector('.alert');
        if (bar) {
            bar.className = bar.classList.contains('hero-status-bar')
                ? 'hero-status-bar status-' + type
                : 'alert alert-' + type + ' mb-0';
        }

        if (type === 'success') {
            setTimeout(function() {
                statusDiv.classList.add('d-none');
            }, 5000);
        }
    },

    /**
     * Update last updated time
     */
    updateLastUpdated: function() {
        const el = document.getElementById('lastUpdated');
        if (el && this.state.lastUpdateTime) {
            el.textContent = `Last updated: ${this.state.lastUpdateTime.toLocaleString()}`;
        }
    },

    /**
     * Update date range display
     */
    updateDateRange: function() {
        const dateRange = (this.state.isJsonSource && JsonDataLoader.rawData)
            ? JsonDataLoader.getDateRange()
            : DataParser.getDateRange();
        const container = document.getElementById('dataDateRange');
        const rangeText = document.getElementById('dateRangeText');
        const lastRecord = document.getElementById('lastRecordDate');
        
        if (container && dateRange.minDate) {
            container.classList.remove('d-none');
            rangeText.textContent = dateRange.range;
            lastRecord.textContent = dateRange.lastRecord;

            const formatForInput = (d) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };
            const startInput = document.getElementById('startDate');
            const endInput = document.getElementById('endDate');
            if (startInput && !startInput.value) {
                startInput.value = formatForInput(dateRange.minDate);
            }
            if (endInput && !endInput.value) {
                endInput.value = formatForInput(dateRange.maxDate);
            }
        }
    },

    // Store for show more/all functionality
    _managerFocusData: [],
    _managerFocusDisplayCount: 6,
    
    /**
     * Update manager focus panel
     */
    updateManagerFocus: function() {
        const managerStats = DataParser.getManagerStats(this.currentData);
        const panel = document.getElementById('managerFocusPanel');
        const container = document.getElementById('managerFocusCards');
        
        if (!panel || !container || managerStats.length === 0) return;
        
        // Only show managers with focus score > 0
        const managersNeedingFocus = managerStats.filter(m => m.focusScore > 0);
        
        // Store for show more functionality
        this._managerFocusData = managersNeedingFocus;
        this._managerFocusDisplayCount = 6;
        
        if (managersNeedingFocus.length === 0) {
            panel.classList.add('d-none');
            return;
        }
        
        panel.classList.remove('d-none');
        
        container.innerHTML = managersNeedingFocus.slice(0, 6).map((m, index) => {
            const focusClass = m.focusLevel === 'High' ? 'danger' : 
                              (m.focusLevel === 'Medium' ? 'warning' : 'info');
            const focusIcon = m.focusLevel === 'High' ? 'exclamation-triangle-fill' : 
                             (m.focusLevel === 'Medium' ? 'exclamation-circle' : 'info-circle');
            
            // Build breakdown items (only show non-zero values)
            const breakdownItems = [];
            if (m.breakdown?.agedCases > 0) {
                breakdownItems.push(`<span class="text-danger">${m.breakdown.agedCases} Aged</span>`);
            }
            if (m.breakdown?.shortCalls > 0) {
                breakdownItems.push(`<span class="text-info">${m.breakdown.shortCalls} Short</span>`);
            }
            if (m.breakdown?.rona > 0) {
                breakdownItems.push(`<span class="text-secondary">${m.breakdown.rona} RONA</span>`);
            }
            if (m.breakdown?.emailChanges > 0) {
                breakdownItems.push(`<span class="text-warning">${m.breakdown.emailChanges} Email</span>`);
            }
            
            const breakdownHtml = breakdownItems.length > 0 
                ? breakdownItems.slice(0, 3).join(' <span class="text-muted">|</span> ')
                : '<span class="text-muted">No issues</span>';
            
            // Format agent display: count + names (filter out automated, clean trailing dots)
            const agentCount = m.agentCount || m.agents.length;
            const cleanAgents = m.agents.map(n => n.replace(/[\s.]+$/g, '').replace(/\s+/g, ' ')).filter(n => n.length > 1);
            const agentDisplayNames = cleanAgents.slice(0, 2).join(', ') + (cleanAgents.length > 2 ? '...' : '');
            const agentDisplay = agentCount > 1
                ? `<strong>${agentCount} agents</strong> <span class="text-muted">(${agentDisplayNames})</span>`
                : `<strong>${m.agents[0] || 'No agent'}</strong>`;

            // Build rich per-metric popover content (HTML, styled table)
            const ba = m.breakdownAgents || {};
            const cleanNames = arr => arr.map(n => n.replace(/[\s.]+$/g, '').replace(/\s+/g, ' ')).filter(n => n.length > 1);
            var popHtml = '<div style="max-height:300px;overflow-y:auto;font-family:TR Clario,sans-serif;">';
            var sections = [
                { key: 'agedCases', label: 'Aged Cases', color: '#d64000' },
                { key: 'shortCalls', label: 'Short Calls', color: '#e9b045' },
                { key: 'rona', label: 'RONA', color: '#123015' },
                { key: 'emailChanges', label: 'Email Changes', color: '#d64000' }
            ];
            var hasSections = false;
            sections.forEach(function(s) {
                if (ba[s.key] && ba[s.key].length) {
                    hasSections = true;
                    var names = cleanNames(ba[s.key]);
                    popHtml += '<div style="margin-bottom:8px;"><div style="font-weight:700;font-size:11px;color:' + s.color + ';border-bottom:1px solid ' + s.color + ';padding-bottom:2px;margin-bottom:4px;">' + s.label + ' — ' + names.length + ' agents</div>';
                    names.forEach(function(n) {
                        popHtml += '<div style="font-size:11px;color:#123015;padding:1px 0;display:flex;align-items:center;"><span style="width:6px;height:6px;border-radius:50%;background:' + s.color + ';display:inline-block;margin-right:6px;flex-shrink:0;"></span>' + n + '</div>';
                    });
                    popHtml += '</div>';
                }
            });
            if (!hasSections) {
                var allNames = cleanNames(m.agents);
                allNames.forEach(function(n) {
                    popHtml += '<div style="font-size:11px;color:#123015;padding:1px 0;display:flex;align-items:center;"><span style="width:6px;height:6px;border-radius:50%;background:#d64000;display:inline-block;margin-right:6px;flex-shrink:0;"></span>' + n + '</div>';
                });
            }
            popHtml += '</div>';
            const escapedContent = popHtml.replace(/"/g, '&quot;');
            const escapedTitle = (m.manager + ' — ' + agentCount + ' Agents').replace(/"/g, '&quot;');

            return `
                <div class="col-md-4 col-lg-2 mb-3">
                    <div class="card h-100 border-${focusClass} manager-focus-card"
                         onclick="App.filterByManagerClick('${m.manager}')"
                         style="cursor: pointer;">
                        <div class="card-body text-center p-3">
                            <div class="mb-2">
                                <span class="badge bg-${focusClass} rounded-pill">
                                    <i class="bi bi-${focusIcon} me-1"></i>${m.focusLevel} Focus
                                </span>
                            </div>
                            <h6 class="card-title mb-1">${m.manager}</h6>
                            <div class="small mb-2 manager-agent-popover"
                                 data-bs-toggle="popover"
                                 data-bs-trigger="manual"
                                 data-bs-html="true"
                                 data-bs-placement="bottom"
                                 data-bs-title="${m.manager} — ${agentCount} Agents"
                                 data-bs-content="${escapedContent}"
                                 style="cursor:pointer; color:#d64000; font-weight:600;">
                                ${agentDisplay}
                            </div>
                            <div class="small">
                                ${breakdownHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Initialize Bootstrap popovers on agent count elements (manual trigger, click to toggle)
        container.querySelectorAll('.manager-agent-popover').forEach(el => {
            var pop = new bootstrap.Popover(el, {
                container: 'body',
                sanitize: false,
                customClass: 'manager-popover',
                template: '<div class="popover manager-popover" role="tooltip"><div class="popover-arrow"></div><div class="popover-header d-flex justify-content-between align-items-center" style="background:#123015;color:#fff;font-size:12px;font-weight:700;border-radius:8px 8px 0 0;padding:8px 12px;"></div><div class="popover-body" style="padding:10px 12px;"></div></div>'
            });
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                container.querySelectorAll('.manager-agent-popover').forEach(function(other) {
                    if (other !== el) {
                        var otherPop = bootstrap.Popover.getInstance(other);
                        if (otherPop) otherPop.hide();
                    }
                });
                pop.toggle();
                // Add close button after popover is shown
                setTimeout(function() {
                    document.querySelectorAll('.manager-popover .popover-header').forEach(function(hdr) {
                        if (!hdr.querySelector('.mgr-pop-close')) {
                            var btn = document.createElement('button');
                            btn.className = 'mgr-pop-close btn-close btn-close-white';
                            btn.style.cssText = 'font-size:0.55rem;margin-left:8px;';
                            btn.onclick = function() {
                                container.querySelectorAll('.manager-agent-popover').forEach(function(el2) {
                                    var p = bootstrap.Popover.getInstance(el2);
                                    if (p) p.hide();
                                });
                            };
                            hdr.appendChild(btn);
                        }
                    });
                }, 50);
            });
        });
        // Dismiss popovers when clicking outside
        document.addEventListener('click', function dismissPopovers(e) {
            if (!e.target.closest('.popover') && !e.target.closest('.manager-agent-popover')) {
                container.querySelectorAll('.manager-agent-popover').forEach(el => {
                    const pop = bootstrap.Popover.getInstance(el);
                    if (pop) pop.hide();
                });
            }
        });

        // Add Show More / Show All buttons if needed
        this.renderManagerFocusButtons(container, managersNeedingFocus.length);

        if (!this.state.currentManager && this.state.currentManagers.length === 0 && !this.state.currentAgent && this.state.currentAgents.length === 0) {
            this.updateManagerFilterWithFocus(managerStats);
        }
    },

    /**
     * Render Show More/All buttons for Manager Focus
     */
    renderManagerFocusButtons: function(container, totalCount) {
        // Remove existing buttons
        const existingBtns = container.parentElement.querySelector('.manager-focus-buttons');
        if (existingBtns) existingBtns.remove();
        
        if (totalCount <= this._managerFocusDisplayCount) return;
        
        const remaining = totalCount - this._managerFocusDisplayCount;
        const btnContainer = document.createElement('div');
        btnContainer.className = 'manager-focus-buttons text-center mt-3';
        btnContainer.innerHTML = `
            <button class="btn btn-outline-primary btn-sm me-2" onclick="App.showMoreManagerFocus()">
                <i class="bi bi-plus-circle me-1"></i>Show More (${Math.min(6, remaining)})
            </button>
            <button class="btn btn-outline-secondary btn-sm" onclick="App.showAllManagerFocus()">
                <i class="bi bi-grid me-1"></i>Show All (${totalCount})
            </button>
        `;
        container.parentElement.appendChild(btnContainer);
    },

    /**
     * Show more managers in focus panel
     */
    showMoreManagerFocus: function() {
        this._managerFocusDisplayCount += 6;
        this.renderManagerFocusCards();
    },

    /**
     * Show all managers in focus panel
     */
    showAllManagerFocus: function() {
        this._managerFocusDisplayCount = this._managerFocusData.length;
        this.renderManagerFocusCards();
    },

    /**
     * Re-render manager focus cards with current display count
     */
    renderManagerFocusCards: function() {
        const container = document.getElementById('managerFocusCards');
        if (!container) return;
        
        const managersToShow = this._managerFocusData.slice(0, this._managerFocusDisplayCount);
        
        container.innerHTML = managersToShow.map((m, index) => {
            const focusClass = m.focusLevel === 'High' ? 'danger' : 
                              (m.focusLevel === 'Medium' ? 'warning' : 'info');
            const focusIcon = m.focusLevel === 'High' ? 'exclamation-triangle-fill' : 
                             (m.focusLevel === 'Medium' ? 'exclamation-circle' : 'info-circle');
            
            const breakdownItems = [];
            if (m.breakdown?.agedCases > 0) breakdownItems.push(`<span class="text-danger">${m.breakdown.agedCases} Aged</span>`);
            if (m.breakdown?.shortCalls > 0) breakdownItems.push(`<span class="text-info">${m.breakdown.shortCalls} Short</span>`);
            if (m.breakdown?.rona > 0) breakdownItems.push(`<span class="text-secondary">${m.breakdown.rona} RONA</span>`);
            if (m.breakdown?.emailChanges > 0) breakdownItems.push(`<span class="text-warning">${m.breakdown.emailChanges} Email</span>`);
            
            const breakdownHtml = breakdownItems.length > 0 
                ? breakdownItems.slice(0, 3).join(' <span class="text-muted">|</span> ')
                : '<span class="text-muted">No issues</span>';
            
            const agentCount = m.agentCount || m.agents.length;
            const agentDisplayNames = m.agents.slice(0, 2).join(', ') + (m.agents.length > 2 ? '...' : '');
            const agentDisplay = agentCount > 1 
                ? `<strong>${agentCount} agents</strong> <span class="text-muted">(${agentDisplayNames})</span>`
                : `<strong>${m.agents[0] || 'No agent'}</strong>`;
            
            return `
                <div class="col-md-4 col-lg-2 mb-3">
                    <div class="card h-100 border-${focusClass} manager-focus-card" 
                         onclick="App.filterByManagerClick('${m.manager}')"
                         style="cursor: pointer;">
                        <div class="card-body text-center p-3">
                            <div class="mb-2">
                                <span class="badge bg-${focusClass} rounded-pill">
                                    <i class="bi bi-${focusIcon} me-1"></i>${m.focusLevel} Focus
                                </span>
                            </div>
                            <h6 class="card-title mb-1">${m.manager}</h6>
                            <div class="small mb-2" title="${m.agents.join(', ')}">${agentDisplay}</div>
                            <div class="small">${breakdownHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        this.renderManagerFocusButtons(container, this._managerFocusData.length);
    },

    /**
     * Update manager filter dropdown with focus indicators
     */
    updateManagerFilterWithFocus: function(managerStats) {
        this.populateManagerFilter();
    },

    /**
     * Filter by agent when clicking agent in leaderboard
     */
    filterByAgentClick: function(agent) {
        this.state.currentAgents = [agent];
        this.state.currentAgent = agent;
        this.populateAgentFilter();
        this._updateAgentMsLabel();
        this.refreshDashboard();
        document.querySelector('.summary-card')?.scrollIntoView({ behavior: 'smooth' });
    },

    /**
     * Filter by manager when clicking manager focus card
     */
    filterByManagerClick: function(manager) {
        this.state.currentManagers = [manager];
        this.state.currentManager = manager;
        this.state.currentAgent = '';
        this.state.currentAgents = [];
        this.populateManagerFilter();
        this._updateMgrMsLabel();
        this._updateAgentMsLabel();
        this.populateAgentFilter();
        this.refreshDashboard();
        document.querySelector('.tab-content')?.scrollIntoView({ behavior: 'smooth' });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for global access
window.App = App;


