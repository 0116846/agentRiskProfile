

/**
 * Charts Module
 * Handles all Chart.js visualizations
 */

if (window.Chart) {
    Chart.defaults.font.family = "'TR Clario', sans-serif";
}

const Charts = {
    // Store chart instances for cleanup
    instances: {},
    
    // Color palettes
    colors: {
        primary: ['#d64000', '#123015', '#e9b045', '#d64000', '#123015', '#e9b045'],
        danger:  ['#d64000', '#d64000', '#d64000', '#d64000', '#d64000'],
        success: ['#123015', '#123015', '#123015', '#123015', '#123015'],
        warning: ['#e9b045', '#e9b045', '#e9b045', '#e9b045', '#e9b045'],
        neutral: ['#123015', '#e9b045', '#ffffff', '#123015', '#123015'],
        mixed:   ['#d64000', '#123015', '#e9b045', '#ffffff', '#d64000', '#123015', '#e9b045', '#ffffff', '#d64000', '#123015']
    },

    /**
     * Initialize all charts with analysis data
     * @param {Object} analysis - Analysis results from Analytics module
     * @param {Object} data - Processed data from DataParser
     */
    initializeAll: function(analysis, data) {
        this.destroyAll();

        // Case Record Type Charts
        this.createCaseRecordTypeChart(analysis.caseRecordType);
        this.createCaseOriginChart(analysis.caseRecordType);
        this.createCasesByOwnerChart(data.caseRecordType);
        this.createCasesByManagerChart(data.caseRecordType);

        // Proactive Type Charts
        this.createProactiveTypeChart(analysis.proactiveType);
        this.createProactiveByManagerChart(analysis.proactiveType);

        // Age 48hrs Charts
        this.createAgeDistributionChart(analysis.age48hrs, data.age48hrs);
        this.createAgeByOwnerChart(analysis.age48hrs);

        // Email Changes Charts
        this.createEmailChangesByAgentChart(analysis.emailChanges);
        this.createEmailChangesTimelineChart(analysis.emailChanges);

        // Short Calls Charts
        this.createShortCallsChart(analysis.shortCalls);

        // RONA Charts
        this.createRonaChart(analysis.ronaTrend);

        // Activity Trend Chart
        this.createActivityTrendChart(data);
    },

    /**
     * Destroy all chart instances
     */
    destroyAll: function() {
        Object.values(this.instances).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.instances = {};
    },

    /**
     * Create Case Record Type distribution chart
     */
    createCaseRecordTypeChart: function(analysis) {
        const ctx = document.getElementById('caseRecordTypeChart');
        if (!ctx || !analysis.distribution) return;
        
        const labels = Object.keys(analysis.distribution);
        const values = Object.values(analysis.distribution);
        
        this.instances.caseRecordType = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: this.colors.mixed,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 15,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Create Case Origin chart
     */
    createCaseOriginChart: function(analysis) {
        const ctx = document.getElementById('caseOriginChart');
        if (!ctx || !analysis.byOrigin) return;
        
        const labels = Object.keys(analysis.byOrigin);
        const values = Object.values(analysis.byOrigin);
        
        this.instances.caseOrigin = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cases by Origin',
                    data: values,
                    backgroundColor: this.colors.primary,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    },

    /**
     * Create Proactive Type distribution chart
     */
    createProactiveTypeChart: function(analysis) {
        const ctx = document.getElementById('proactiveTypeChart');
        if (!ctx || !analysis.distribution) return;
        
        const labels = Object.keys(analysis.distribution);
        const values = Object.values(analysis.distribution);
        
        this.instances.proactiveType = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: this.colors.success,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 15,
                            usePointStyle: true
                        }
                    }
                }
            }
        });
    },

    /**
     * Create Proactive Type by Manager chart
     */
    createProactiveByManagerChart: function(analysis) {
        const ctx = document.getElementById('proactiveByManagerChart');
        if (!ctx || !analysis.byManager) return;
        
        const managers = Object.keys(analysis.byManager);
        const types = [...new Set(Object.values(analysis.byManager).flatMap(m => Object.keys(m)))];
        
        const datasets = types.map((type, index) => ({
            label: type,
            data: managers.map(m => analysis.byManager[m][type] || 0),
            backgroundColor: this.colors.mixed[index % this.colors.mixed.length],
            borderRadius: 4
        }));
        
        this.instances.proactiveByManager = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: managers,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    },

    /**
     * Create Age Distribution chart
     */
    createAgeDistributionChart: function(analysis, data) {
        const ctx = document.getElementById('ageDistributionChart');
        if (!ctx || !data?.length) return;
        
        // Create age buckets
        const buckets = {
            '0-24 hrs': 0,
            '24-48 hrs': 0,
            '48-72 hrs': 0,
            '72-96 hrs': 0,
            '96-120 hrs': 0,
            '120+ hrs': 0
        };
        
        data.forEach(row => {
            if (row.age <= 24) buckets['0-24 hrs']++;
            else if (row.age <= 48) buckets['24-48 hrs']++;
            else if (row.age <= 72) buckets['48-72 hrs']++;
            else if (row.age <= 96) buckets['72-96 hrs']++;
            else if (row.age <= 120) buckets['96-120 hrs']++;
            else buckets['120+ hrs']++;
        });
        
        this.instances.ageDistribution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(buckets),
                datasets: [{
                    label: 'Number of Cases',
                    data: Object.values(buckets),
                    backgroundColor: [
                        '#123015', '#123015', '#e9b045', '#e9b045', '#d64000', '#d64000'
                    ],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Case Age Distribution',
                        font: { size: 14 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    /**
     * Create Age by Owner chart
     */
    createAgeByOwnerChart: function(analysis) {
        const ctx = document.getElementById('ageByOwnerChart');
        if (!ctx || !analysis.byOwner) return;
        
        const sortedOwners = Object.entries(analysis.byOwner)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);
        
        const labels = sortedOwners.map(([name]) => name);
        const counts = sortedOwners.map(([, data]) => data.count);
        const criticalCounts = sortedOwners.map(([, data]) => data.critical);
        
        this.instances.ageByOwner = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Total Aged Cases',
                        data: counts,
                        backgroundColor: '#e9b045',
                        borderRadius: 4
                    },
                    {
                        label: 'Critical (>96hrs)',
                        data: criticalCounts,
                        backgroundColor: '#d64000',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
    },

    /**
     * Create Email Changes by Agent chart
     */
    createEmailChangesByAgentChart: function(analysis) {
        const ctx = document.getElementById('emailChangesByAgentChart');
        if (!ctx || !analysis.byAgent) return;
        
        const sortedAgents = Object.entries(analysis.byAgent)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        const labels = sortedAgents.map(([name]) => name);
        const values = sortedAgents.map(([, count]) => count);
        
        // Highlight anomalous agents
        const anomalyAgents = (analysis.anomalies || []).map(a => a.agent);
        const colors = labels.map(label => 
            anomalyAgents.includes(label) ? '#d64000' : '#d64000'
        );
        
        this.instances.emailChangesByAgent = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Email Changes',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Top 10 Agents — Email Changes',
                        font: { size: 14 }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
    },

    /**
     * Create Email Changes Timeline chart
     */
    createEmailChangesTimelineChart: function(analysis) {
        const ctx = document.getElementById('emailChangesTimelineChart');
        if (!ctx || !analysis.timeline?.length) return;
        
        const labels = analysis.timeline.map(t => t.date);
        const values = analysis.timeline.map(t => t.count);
        
        this.instances.emailChangesTimeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Email Changes',
                    data: values,
                    borderColor: '#d64000',
                    backgroundColor: 'rgba(214, 64, 0, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#d64000'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Email Changes Over Time',
                        font: { size: 14 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    /**
     * Create Short Calls chart
     */
    createShortCallsChart: function(analysis) {
        const ctx = document.getElementById('shortCallsChart');
        if (!ctx || !analysis.rankings?.length) return;
        
        const sortedData = analysis.rankings.slice(0, 15);
        const labels = sortedData.map(r => r.agentName);
        const values = sortedData.map(r => r.count);
        
        // Color based on status
        const colors = sortedData.map(r => {
            if (r.status === 'outlier') return '#d64000';
            if (r.status === 'warning') return '#e9b045';
            return '#123015';
        });
        
        this.instances.shortCalls = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Short Calls (<5min)',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Short Calls by Agent',
                        font: { size: 14 }
                    },
                    annotation: analysis.stats?.mean ? {
                        annotations: {
                            line1: {
                                type: 'line',
                                yMin: analysis.stats.mean,
                                yMax: analysis.stats.mean,
                                borderColor: '#123015',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    display: true,
                                    content: `Avg: ${analysis.stats.mean.toFixed(0)}`,
                                    position: 'end'
                                }
                            }
                        }
                    } : {}
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
        
        // Populate top offenders list
        this.populateShortCallsList(analysis);
    },

    /**
     * Populate short calls top offenders list
     */
    populateShortCallsList: function(analysis) {
        const container = document.getElementById('shortCallsTopList');
        if (!container || !analysis.topOffenders?.length) return;
        
        container.innerHTML = analysis.topOffenders.map((item, index) => {
            const statusClass = item.status === 'outlier' ? 'critical' : 
                               (item.status === 'warning' ? 'warning' : '');
            return `
                <div class="list-group-item ${statusClass} d-flex justify-content-between align-items-center">
                    <div>
                        <span class="badge bg-${index < 3 ? 'danger' : 'secondary'} me-2">#${index + 1}</span>
                        ${item.agentName}
                    </div>
                    <div>
                        <span class="badge bg-primary rounded-pill">${item.count}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Create RONA chart
     */
    createRonaChart: function(analysis) {
        const ctx = document.getElementById('ronaChart');
        if (!ctx || !analysis.rankings?.length) return;
        
        const sortedData = analysis.rankings.slice(0, 15);
        const labels = sortedData.map(r => r.agentName);
        const values = sortedData.map(r => r.rona);
        
        // Color based on status
        const colors = sortedData.map(r => {
            if (r.status === 'outlier') return '#d64000';
            if (r.status === 'warning') return '#e9b045';
            return '#123015';
        });
        
        this.instances.rona = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'RONA Count',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'RONA by Agent',
                        font: { size: 14 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
        
        // Update RONA statistics
        this.updateRonaStats(analysis);
    },

    /**
     * Update RONA statistics display
     */
    updateRonaStats: function(analysis) {
        const { stats, rankings, threshold } = analysis;
        
        document.getElementById('avgRona').textContent = stats?.mean?.toFixed(1) || '0';
        document.getElementById('maxRona').textContent = stats?.max || '0';
        document.getElementById('ronaThreshold').textContent = threshold?.toFixed(0) || '0';
        
        if (rankings?.length > 0) {
            document.getElementById('maxRonaAgent').textContent = rankings[0].agentName;
        }
    },

    createCasesByOwnerChart: function(data) {
        var ctx = document.getElementById('casesByOwnerChart');
        if (!ctx || !data?.length) return;
        var counts = {};
        data.forEach(function(r) { if (r.caseOwner) counts[r.caseOwner] = (counts[r.caseOwner] || 0) + 1; });
        var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 15);
        if (this.instances.casesByOwner) this.instances.casesByOwner.destroy();
        this.instances.casesByOwner = new Chart(ctx, {
            type: 'bar',
            data: { labels: sorted.map(function(e) { return e[0]; }), datasets: [{ label: 'Cases', data: sorted.map(function(e) { return e[1]; }), backgroundColor: '#d64000', borderRadius: 6 }] },
            options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 10 } } } } }
        });
    },

    createCasesByManagerChart: function(data) {
        var ctx = document.getElementById('casesByManagerChart');
        if (!ctx || !data?.length) return;
        var counts = {};
        data.forEach(function(r) { if (r.manager) counts[r.manager] = (counts[r.manager] || 0) + 1; });
        var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });
        if (this.instances.casesByManager) this.instances.casesByManager.destroy();
        this.instances.casesByManager = new Chart(ctx, {
            type: 'bar',
            data: { labels: sorted.map(function(e) { return e[0]; }), datasets: [{ label: 'Cases', data: sorted.map(function(e) { return e[1]; }), backgroundColor: '#123015', borderRadius: 6 }] },
            options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 10 } } } } }
        });
    },

    createActivityTrendChart: function(data) {
        var ctx = document.getElementById('activityTrendChart');
        var section = document.getElementById('trendSection');
        if (!ctx || !section) return;

        var cats = { aged: 0, email: 0, cases: 0, shortCalls: 0, rona: 0 };
        var dateBuckets = {};
        var ensure = function(key) { if (!dateBuckets[key]) dateBuckets[key] = { aged:0, email:0, cases:0, shortCalls:0, rona:0 }; };
        var addDate = function(dateVal, category, count) {
            if (!dateVal) return;
            var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
            if (isNaN(d)) return;
            var key = d.toISOString().split('T')[0];
            ensure(key);
            dateBuckets[key][category] += (count || 1);
        };

        (data.age48hrs || []).forEach(function(r) { addDate(r.createdDate || r.open, 'aged'); });
        (data.emailChanges || []).forEach(function(r) { addDate(r.editDate, 'email'); });
        (data.caseRecordType || []).forEach(function(r) { addDate(r.createdDate, 'cases'); });
        if (data.shortCalls && data.shortCalls._dateRows) {
            data.shortCalls._dateRows.forEach(function(r) { addDate(r.callDate, 'shortCalls', r.count); });
        }
        if (data.ronaTrend && data.ronaTrend._dateRows) {
            data.ronaTrend._dateRows.forEach(function(r) { addDate(r.callDate, 'rona', r.rona); });
        }

        var sortedDates = Object.keys(dateBuckets).sort();
        if (sortedDates.length < 2) { section.classList.add('d-none'); return; }
        section.classList.remove('d-none');

        var daySpan = (new Date(sortedDates[sortedDates.length - 1]) - new Date(sortedDates[0])) / 86400000;
        var useMonthly = daySpan > 45;
        var keys, labels, grouped;

        if (useMonthly) {
            grouped = {};
            sortedDates.forEach(function(d) {
                var mk = d.substring(0, 7);
                if (!grouped[mk]) grouped[mk] = { aged:0, email:0, cases:0, shortCalls:0, rona:0 };
                Object.keys(cats).forEach(function(c) { grouped[mk][c] += dateBuckets[d][c]; });
            });
            keys = Object.keys(grouped).sort();
            labels = keys.map(function(m) {
                var p = m.split('-');
                return new Date(p[0], p[1]-1).toLocaleDateString('en-US', { month:'short', year:'2-digit' });
            });
            document.getElementById('trendChartTitle').textContent = 'Monthly Activity Trend';
        } else {
            grouped = dateBuckets;
            keys = sortedDates;
            labels = keys.map(function(d) {
                return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric' });
            });
            document.getElementById('trendChartTitle').textContent = 'Daily Activity Trend';
        }

        var rangeEl = document.getElementById('trendDateRange');
        if (rangeEl) {
            var s = new Date(sortedDates[0]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
            var e = new Date(sortedDates[sortedDates.length-1]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
            rangeEl.textContent = s + ' — ' + e;
        }

        var ds = function(label, cat, color) {
            return {
                label: label,
                data: keys.map(function(k) { return grouped[k][cat]; }),
                borderColor: color,
                backgroundColor: color.replace(')', ',0.08)').replace('rgb', 'rgba'),
                fill: false, tension: 0, pointRadius: 2, borderWidth: 2
            };
        };

        this.instances.activityTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    ds('Cases', 'cases', 'rgb(214,64,0)'),
                    ds('Aged Cases', 'aged', 'rgb(214,64,0)'),
                    ds('Email Changes', 'email', 'rgb(214,64,0)'),
                    ds('Short Calls', 'shortCalls', 'rgb(18,48,21)'),
                    ds('RONA', 'rona', 'rgb(18,48,21)')
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 10 } } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } }
                }
            }
        });
    }
};

// Export for use in other modules
window.Charts = Charts;



