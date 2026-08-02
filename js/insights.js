/**
 * Insights Generator Module
 * Generates AI-powered text insights and recommendations
 */

const InsightsGenerator = {
    // Priority levels for insights
    priority: {
        CRITICAL: 1,
        HIGH: 2,
        MEDIUM: 3,
        LOW: 4,
        INFO: 5
    },
    
    // Store insights for click handling (avoids complex data in onclick attributes)
    _insightsCache: {},

    /**
     * Generate all insights from analysis results
     * @param {Object} analysis - Analysis results from Analytics module
     * @param {Object} data - Processed data from DataParser
     * @returns {Array} - Array of insight objects
     */
    generateInsights: function(analysis, data) {
        const insights = [];
        
        // Generate insights from each data category
        insights.push(...this.generateShortCallsInsights(analysis.shortCalls, data.shortCalls));
        insights.push(...this.generateRonaInsights(analysis.ronaTrend, data.ronaTrend));
        insights.push(...this.generateEmailChangeInsights(analysis.emailChanges, data.emailChanges));
        insights.push(...this.generateAge48hrsInsights(analysis.age48hrs, data.age48hrs));
        insights.push(...this.generateCaseRecordInsights(analysis.caseRecordType, data.caseRecordType));
        insights.push(...this.generateProactiveTypeInsights(analysis.proactiveType, data.proactiveType));
        
        // Add anomaly-based insights
        insights.push(...this.generateAnomalyInsights(analysis.anomalies));
        
        // Sort by priority
        return insights.sort((a, b) => a.priorityLevel - b.priorityLevel);
    },

    /**
     * Generate Short Calls insights
     */
    generateShortCallsInsights: function(analysis, data) {
        const insights = [];
        if (!analysis || !data?.length) return insights;
        
        const { stats, outliers, topOffenders, total } = analysis;
        
        // Top offender insight
        if (topOffenders?.length > 0) {
            const top = topOffenders[0];
            const timesAvg = stats.mean > 0 ? (top.count / stats.mean).toFixed(1) : '0';

            insights.push({
                id: 'short_calls_top',
                type: 'critical',
                category: 'Short Calls',
                icon: 'telephone-x',
                title: 'Highest Short Calls Agent',
                message: `${top.agentName} has ${top.count} short calls - ${timesAvg}x above team average (${stats.mean.toFixed(0)})`,
                priorityLevel: this.priority.CRITICAL,
                action: `Review ${top.agentName}'s call handling practices`,
                agent: top.agentName  // Added agent property
            });
        }
        
        // Multiple outliers warning
        if (outliers?.length > 1) {
            insights.push({
                id: 'short_calls_outliers',
                type: 'warning',
                category: 'Short Calls',
                icon: 'exclamation-triangle',
                title: 'Multiple Agents with High Short Calls',
                message: `${outliers.length} agents have short calls significantly above average. Total short calls: ${total}`,
                priorityLevel: this.priority.HIGH,
                action: 'Schedule team training on call handling',
                agentDetails: outliers.map(function(o) { return { name: o.agentName, value: o.count, label: 'calls' }; })
            });
        }
        
        // Team average insight
        if (stats.mean > 50) {
            insights.push({
                id: 'short_calls_avg',
                type: 'warning',
                category: 'Short Calls',
                icon: 'graph-down',
                title: 'High Team Average for Short Calls',
                message: `Team average is ${stats.mean.toFixed(0)} short calls per agent, which may indicate systemic issues`,
                priorityLevel: this.priority.MEDIUM,
                action: 'Review team KPIs and call quality metrics'
            });
        }
        
        return insights;
    },

    /**
     * Generate RONA insights
     */
    generateRonaInsights: function(analysis, data) {
        const insights = [];
        if (!analysis || !data?.length) return insights;
        
        const { stats, outliers, topAgents, total, threshold } = analysis;
        
        // High RONA agent
        if (topAgents?.length > 0) {
            const top = topAgents[0];
            if (top.rona > threshold) {
                insights.push({
                    id: 'rona_top',
                    type: 'critical',
                    category: 'RONA',
                    icon: 'phone-vibrate',
                    title: 'Critical RONA Alert',
                    message: `${top.agentName} has RONA of ${top.rona} - exceeds 2x threshold (${threshold.toFixed(0)})`,
                    priorityLevel: this.priority.CRITICAL,
                    action: `Investigate ${top.agentName}'s availability issues`,
                    agent: top.agentName  // Added agent property
                });
            }
        }
        
        // Multiple agents above threshold
        const aboveThreshold = data.filter(r => r.rona > stats.mean * 2);
        if (aboveThreshold.length >= 3) {
            insights.push({
                id: 'rona_multiple',
                type: 'warning',
                category: 'RONA',
                icon: 'people-fill',
                title: 'Multiple Agents with High RONA',
                message: `${aboveThreshold.length} agents have RONA rates 2x above team average`,
                priorityLevel: this.priority.HIGH,
                action: 'Review agent scheduling and availability policies',
                agentDetails: aboveThreshold.sort(function(a, b) { return b.rona - a.rona; }).map(function(r) { return { name: r.agentName, value: r.rona, label: 'RONA' }; })
            });
        }
        
        // Total RONA count
        if (total > 100) {
            insights.push({
                id: 'rona_total',
                type: 'info',
                category: 'RONA',
                icon: 'info-circle',
                title: 'Total RONA Count',
                message: `Total RONA across all agents: ${total}. Average: ${stats.mean.toFixed(1)} per agent`,
                priorityLevel: this.priority.INFO,
                action: null
            });
        }
        
        return insights;
    },

    /**
     * Generate Email Change insights
     */
    generateEmailChangeInsights: function(analysis, data) {
        const insights = [];
        if (!analysis || !data?.length) return insights;
        
        const { byAgent, byType, anomalies, suspiciousChanges, stats } = analysis;
        
        // Agents with anomalous email changes
        if (anomalies?.length > 0) {
            const topAnomaly = anomalies[0];
            insights.push({
                id: 'email_anomaly',
                type: 'critical',
                category: 'Email Changes',
                icon: 'envelope-exclamation',
                title: 'Suspicious Email Change Activity',
                message: `${topAnomaly.agent} made ${topAnomaly.count} email changes - ${topAnomaly.percentAboveAvg}x average`,
                priorityLevel: this.priority.CRITICAL,
                action: `Audit ${topAnomaly.agent}'s email changes for policy violations`,
                agent: topAnomaly.agent  // Added agent property
            });
        }
        
        // Suspicious change types (punctuation/minor edits)
        if (suspiciousChanges?.length > 0) {
            const punctuationCount = data.filter(r => r.changeType === 'punctuation').length;
            const minorEditCount = data.filter(r => r.changeType === 'minor_edit').length;
            
            if (punctuationCount > 5 || minorEditCount > 10) {
                var suspByAgent = {};
                data.filter(function(r) { return r.changeType === 'punctuation' || r.changeType === 'minor_edit'; }).forEach(function(r) {
                    var a = r.editedBy || 'Unknown'; suspByAgent[a] = (suspByAgent[a] || 0) + 1;
                });
                var suspDetails = Object.keys(suspByAgent).sort(function(a, b) { return suspByAgent[b] - suspByAgent[a]; }).map(function(a) { return { name: a, value: suspByAgent[a], label: 'edits' }; });
                insights.push({
                    id: 'email_suspicious',
                    type: 'warning',
                    category: 'Email Changes',
                    icon: 'shield-exclamation',
                    title: 'Potentially Intentional Email Modifications',
                    message: `Detected ${punctuationCount} punctuation changes and ${minorEditCount} minor edits that may be intentional`,
                    priorityLevel: this.priority.HIGH,
                    action: 'Review email change audit trail for patterns',
                    filterType: 'changeType',
                    filterValue: ['Punctuation', 'Minor Edit'],
                    agentDetails: suspDetails
                });
            }
        }
        
        // Total email changes
        insights.push({
            id: 'email_total',
            type: 'info',
            category: 'Email Changes',
            icon: 'envelope',
            title: 'Email Change Summary',
            message: `Total email changes: ${data.length}. Average: ${stats.mean.toFixed(1)} per agent`,
            priorityLevel: this.priority.INFO,
            action: null
        });
        
        return insights;
    },

    /**
     * Generate Age 48hrs insights
     */
    generateAge48hrsInsights: function(analysis, data) {
        const insights = [];
        if (!analysis || !data?.length) return insights;
        
        const { critical, warnings, stats, criticalCount, warningCount, byOwner } = analysis;
        
        // Critical cases alert
        if (criticalCount > 0) {
            var critDetails = [];
            if (critical && critical.length) {
                var critByOwner = {};
                critical.forEach(function(c) { var o = c.caseOwner || 'Unknown'; critByOwner[o] = (critByOwner[o] || 0) + 1; });
                Object.keys(critByOwner).sort(function(a, b) { return critByOwner[b] - critByOwner[a]; }).forEach(function(o) {
                    critDetails.push({ name: o, value: critByOwner[o], label: 'cases' });
                });
            }
            insights.push({
                id: 'age_critical',
                type: 'critical',
                category: 'Case Age',
                icon: 'hourglass-bottom',
                title: 'Critical Aged Cases',
                message: `${criticalCount} cases are over 96 hours old and require immediate attention`,
                priorityLevel: this.priority.CRITICAL,
                action: 'Prioritize closure of critically aged cases',
                filterType: 'ageRange',
                filterValue: 'critical',
                agentDetails: critDetails
            });
        }

        // Warning level cases
        if (warningCount > 0) {
            var warnDetails = [];
            if (warnings && warnings.length) {
                var warnByOwner = {};
                warnings.forEach(function(c) { var o = c.caseOwner || 'Unknown'; warnByOwner[o] = (warnByOwner[o] || 0) + 1; });
                Object.keys(warnByOwner).sort(function(a, b) { return warnByOwner[b] - warnByOwner[a]; }).forEach(function(o) {
                    warnDetails.push({ name: o, value: warnByOwner[o], label: 'cases' });
                });
            }
            insights.push({
                id: 'age_warning',
                type: 'warning',
                category: 'Case Age',
                icon: 'clock-history',
                title: 'Cases Approaching Critical Age',
                message: `${warningCount} cases are between 48-96 hours old`,
                priorityLevel: this.priority.MEDIUM,
                action: 'Follow up with agents on pending cases',
                filterType: 'ageRange',
                filterValue: 'warning',
                agentDetails: warnDetails
            });
        }
        
        // Agents with most aged cases
        const sortedOwners = Object.entries(byOwner)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 3);
        
        if (sortedOwners.length > 0 && sortedOwners[0][1].count > 2) {
            const [owner, ownerData] = sortedOwners[0];
            insights.push({
                id: 'age_owner',
                type: 'warning',
                category: 'Case Age',
                icon: 'person-exclamation',
                title: 'Agent with Most Aged Cases',
                message: `${owner} has ${ownerData.count} aged cases (avg age: ${ownerData.avgAge.toFixed(0)} hours)`,
                priorityLevel: this.priority.HIGH,
                action: `Work with ${owner} to reduce case backlog`,
                agent: owner  // Added agent property
            });
        }
        
        // Average case age
        if (stats.mean > 48) {
            insights.push({
                id: 'age_avg',
                type: 'info',
                category: 'Case Age',
                icon: 'bar-chart',
                title: 'Average Case Age',
                message: `Average case age: ${stats.mean.toFixed(1)} hours. Maximum: ${stats.max} hours`,
                priorityLevel: this.priority.INFO,
                action: null
            });
        }
        
        return insights;
    },

    /**
     * Generate Case Record Type insights
     */
    generateCaseRecordInsights: function(analysis, data) {
        const insights = [];
        if (!analysis || !data?.length) return insights;
        
        const { distribution, byOrigin, mostCommonType, mostCommonOrigin, totalCases } = analysis;
        
        // Distribution summary
        const typeCount = Object.keys(distribution).length;
        insights.push({
            id: 'case_record_summary',
            type: 'info',
            category: 'Case Records',
            icon: 'folder2-open',
            title: 'Case Record Distribution',
            message: `${totalCases} cases across ${typeCount} record types. Most common: ${mostCommonType}`,
            priorityLevel: this.priority.INFO,
            action: null
        });
        
        // Check for potential misclassification
        const incidentCount = distribution['Incident (Read Only)'] || distribution['Incident'] || 0;
        if (incidentCount > totalCases * 0.8) {
            insights.push({
                id: 'case_classification',
                type: 'warning',
                category: 'Case Records',
                icon: 'question-circle',
                title: 'High Incident Rate',
                message: `${((incidentCount/totalCases)*100).toFixed(0)}% of cases are classified as Incident - verify correct classification`,
                priorityLevel: this.priority.MEDIUM,
                action: 'Review case classification guidelines with team'
            });
        }
        
        return insights;
    },

    /**
     * Generate Proactive Type insights
     */
    generateProactiveTypeInsights: function(analysis, data) {
        const insights = [];
        if (!analysis || !data?.length) return insights;
        
        const { distribution, mostCommonType, totalCases } = analysis;
        
        // Social Media vs Internal breakdown
        const socialMediaCount = distribution['Social Media'] || 0;
        const internalCount = distribution['Internal Origin'] || 0;
        
        if (socialMediaCount > 0 || internalCount > 0) {
            insights.push({
                id: 'proactive_distribution',
                type: 'info',
                category: 'Proactive Type',
                icon: 'lightning',
                title: 'Proactive Type Breakdown',
                message: `Social Media: ${socialMediaCount} cases | Internal Origin: ${internalCount} cases`,
                priorityLevel: this.priority.INFO,
                action: null
            });
        }
        
        // Check for unusual distribution
        const typeCount = Object.keys(distribution).length;
        if (typeCount === 1) {
            insights.push({
                id: 'proactive_single_type',
                type: 'warning',
                category: 'Proactive Type',
                icon: 'exclamation-circle',
                title: 'Single Proactive Type Used',
                message: `All ${totalCases} cases use "${mostCommonType}" - verify agents are using correct options`,
                priorityLevel: this.priority.MEDIUM,
                action: 'Train team on proactive type selection criteria'
            });
        }
        
        return insights;
    },

    /**
     * Generate insights from detected anomalies
     */
    generateAnomalyInsights: function(anomalies) {
        const insights = [];
        if (!anomalies?.length) return insights;

        const typeTabMap = {
            'short_calls': 'shortCalls-tab',
            'rona': 'rona-tab',
            'email_changes': 'emailChanges-tab',
            'age_critical': 'age48-tab'
        };
        const typeIconMap = {
            'short_calls': 'telephone-x',
            'rona': 'phone-vibrate',
            'email_changes': 'envelope-exclamation',
            'age_critical': 'hourglass-bottom'
        };

        anomalies.forEach((a, i) => {
            insights.push({
                id: 'anomaly_' + i,
                type: a.severity === 'high' ? 'critical' : 'warning',
                category: 'Anomalies',
                icon: typeIconMap[a.type] || 'exclamation-diamond',
                title: a.severity === 'high' ? 'High-Severity Anomaly' : 'Anomaly Detected',
                message: a.message,
                priorityLevel: a.severity === 'high' ? this.priority.CRITICAL : this.priority.HIGH,
                action: a.agent ? `Investigate ${a.agent}'s metrics` : 'Review flagged metrics',
                agent: a.agent || '',
                _anomalyTab: typeTabMap[a.type] || ''
            });
        });

        return insights;
    },

    /**
     * Format insights for display
     * @param {Array} insights - Array of insight objects
     * @returns {string} - HTML string for insights panel
     */
    renderInsights: function(insights) {
        if (!insights.length) {
            return '<div class="col-12 text-muted text-center py-3"><i class="bi bi-check-circle me-2"></i>No significant insights to report</div>';
        }

        var tabMapping = {
            'Short Calls': 'shortCalls-tab',
            'RONA': 'rona-tab',
            'Email Changes': 'emailChanges-tab',
            'Case Age': 'age48-tab',
            'Case Records': 'caseRecord-tab',
            'Proactive Type': 'proactive-tab',
            'Anomalies': ''
        };

        var categoryIcons = {
            'RONA': 'phone-vibrate',
            'Short Calls': 'telephone-x',
            'Proactive Type': 'lightning',
            'Case Age': 'hourglass-split',
            'Email Changes': 'envelope-exclamation',
            'Case Records': 'folder',
            'Anomalies': 'exclamation-diamond'
        };

        var severityColors = {
            'critical': { bg: '#ffffff', border: '#d64000', icon: 'text-danger', badge: 'bg-danger' },
            'warning':  { bg: '#ffffff', border: '#e9b045', icon: 'text-warning', badge: 'bg-warning text-dark' },
            'info':     { bg: '#ffffff', border: '#123015', icon: 'text-primary', badge: 'bg-primary' },
            'success':  { bg: '#ffffff', border: '#123015', icon: 'text-success', badge: 'bg-success' }
        };

        var categoryOrder = ['RONA', 'Short Calls', 'Proactive Type', 'Case Age', 'Email Changes', 'Case Records', 'Anomalies'];

        var grouped = {};
        insights.forEach(function(ins) {
            var cat = ins.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(ins);
        });

        var totalCrit = insights.filter(function(i) { return i.type === 'critical'; }).length;
        var totalWarn = insights.filter(function(i) { return i.type === 'warning'; }).length;
        var totalInfo = insights.length - totalCrit - totalWarn;

        var html = '<div class="col-12 mb-3">' +
            '<div class="d-flex flex-wrap gap-3 align-items-center px-2 py-2" style="background:rgba(214,64,0,0.06);border-radius:8px;border:1px solid rgba(214,64,0,0.12);">' +
            '<span class="fw-semibold text-primary"><i class="bi bi-bar-chart-fill me-1"></i>Summary</span>' +
            (totalCrit ? '<span class="d-flex align-items-center gap-1"><span style="width:10px;height:10px;border-radius:50%;background:#d64000;display:inline-block;"></span><span class="small fw-semibold">' + totalCrit + ' Critical</span></span>' : '') +
            (totalWarn ? '<span class="d-flex align-items-center gap-1"><span style="width:10px;height:10px;border-radius:50%;background:#e9b045;display:inline-block;"></span><span class="small fw-semibold">' + totalWarn + ' Warning</span></span>' : '') +
            (totalInfo ? '<span class="d-flex align-items-center gap-1"><span style="width:10px;height:10px;border-radius:50%;background:#123015;display:inline-block;"></span><span class="small fw-semibold">' + totalInfo + ' Info</span></span>' : '') +
            '<span class="ms-auto small text-muted">' + insights.length + ' total findings</span>' +
            '</div></div>';

        var self = this;
        categoryOrder.forEach(function(cat) {
            if (!grouped[cat] || !grouped[cat].length) return;
            var items = grouped[cat];
            var critCount = items.filter(function(i) { return i.type === 'critical'; }).length;
            var warnCount = items.filter(function(i) { return i.type === 'warning'; }).length;
            var catIcon = categoryIcons[cat] || 'lightbulb';
            var catId = 'insightCat_' + cat.replace(/\s+/g, '_');

            html += '<div class="col-12 insight-category-section mb-2">' +
                '<div class="insight-category-header d-flex align-items-center gap-2 px-3 py-2" ' +
                'style="background:linear-gradient(90deg,rgba(214,64,0,0.08),transparent);border-left:3px solid #d64000;border-radius:0 6px 6px 0;cursor:pointer;" ' +
                'onclick="var b=document.getElementById(\'' + catId + '\');b.style.display=b.style.display===\'none\'?\'flex\':\'none\';">' +
                '<i class="bi bi-' + catIcon + ' text-primary"></i>' +
                '<span class="fw-bold" style="color:#123015;">' + cat + '</span>' +
                '<span class="badge bg-secondary bg-opacity-75" style="font-size:0.7rem;">' + items.length + '</span>' +
                (critCount ? '<span class="badge bg-danger" style="font-size:0.65rem;">' + critCount + ' Critical</span>' : '') +
                (warnCount ? '<span class="badge bg-warning text-dark" style="font-size:0.65rem;">' + warnCount + ' Warning</span>' : '') +
                '<i class="bi bi-chevron-down ms-auto text-muted small"></i>' +
                '</div>' +
                '<div id="' + catId + '" class="row g-2 mt-1 px-2" style="display:flex;">';

            items.forEach(function(insight) {
                var sev = insight.type === 'critical' ? 'critical' : (insight.type === 'warning' ? 'warning' : 'info');
                var colors = severityColors[sev];
                var targetTab = (insight._anomalyTab) || tabMapping[insight.category] || '';

                self._insightsCache[insight.id] = {
                    tabId: targetTab,
                    agent: insight.agent || '',
                    category: insight.category,
                    filterType: insight.filterType || 'agent',
                    filterValue: insight.filterValue || '',
                    agentDetails: insight.agentDetails || []
                };

                var hasDetails = insight.agentDetails && insight.agentDetails.length > 0;
                var detailAttr = hasDetails ? ' data-insight-popover="' + insight.id + '"' : '';

                html += '<div class="col-md-6 col-lg-4">' +
                    '<div class="insight-item d-flex align-items-start gap-2 p-2 rounded-2" ' +
                    'style="background:' + colors.bg + ';border-left:3px solid ' + colors.border + ';cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" ' +
                    'onmouseenter="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 3px 8px rgba(0,0,0,0.1)\'" ' +
                    'onmouseleave="this.style.transform=\'\';this.style.boxShadow=\'\'" ' +
                    'onclick="InsightsGenerator.handleInsightCardClick(\'' + insight.id + '\')"' + detailAttr + '>' +
                    '<i class="bi bi-' + insight.icon + ' ' + colors.icon + '" style="font-size:1.1rem;margin-top:2px;"></i>' +
                    '<div class="flex-grow-1" style="min-width:0;">' +
                    '<div class="d-flex align-items-center gap-1 mb-1">' +
                    '<span class="badge ' + colors.badge + '" style="font-size:0.6rem;padding:2px 5px;">' + sev.charAt(0).toUpperCase() + sev.slice(1) + '</span>' +
                    '</div>' +
                    '<div style="font-size:0.82rem;color:#123015;line-height:1.35;">' + insight.message + '</div>' +
                    (insight.action ? '<div class="mt-1" style="font-size:0.75rem;color:#d64000;font-weight:500;"><i class="bi bi-arrow-right-circle me-1"></i>' + insight.action + '</div>' : '') +
                    '</div></div></div>';
            });

            html += '</div></div>';
            delete grouped[cat];
        });

        Object.keys(grouped).forEach(function(cat) {
            grouped[cat].forEach(function(insight) {
                var sev = insight.type === 'critical' ? 'critical' : (insight.type === 'warning' ? 'warning' : 'info');
                var colors = severityColors[sev];
                var targetTab = tabMapping[insight.category] || '';
                self._insightsCache[insight.id] = { tabId: targetTab, agent: insight.agent || '', category: insight.category, filterType: insight.filterType || 'agent', filterValue: insight.filterValue || '' };
                html += '<div class="col-md-6 col-lg-4"><div class="insight-item p-2 rounded-2" style="background:' + colors.bg + ';border-left:3px solid ' + colors.border + ';cursor:pointer;" onclick="InsightsGenerator.handleInsightClickById(\'' + insight.id + '\')"><div style="font-size:0.82rem;color:#123015;">' + insight.message + '</div></div></div>';
            });
        });

        return html;
    },

    _closeAllInsightPopovers: function() {
        document.querySelectorAll('[data-insight-popover]').forEach(function(el) {
            var pop = bootstrap.Popover.getInstance(el);
            if (pop) pop.hide();
        });
    },

    handleInsightCardClick: function(insightId) {
        var insight = this._insightsCache[insightId];
        if (!insight) return;

        if (insight.agentDetails && insight.agentDetails.length > 0) {
            var el = document.querySelector('[data-insight-popover="' + insightId + '"]');
            if (!el) return;

            var existing = bootstrap.Popover.getInstance(el);
            if (existing) {
                existing.toggle();
                return;
            }

            this._closeAllInsightPopovers();

            var maxVal = Math.max.apply(null, insight.agentDetails.map(function(d) { return d.value; }));
            var content = '<div class="insight-detail-pop">';
            content += '<div class="idp-header">' + insight.agentDetails.length + ' Agents <button type="button" class="btn-close idp-close" onclick="InsightsGenerator._closeAllInsightPopovers()"></button></div>';
            content += '<table class="idp-table">';
            insight.agentDetails.forEach(function(d) {
                var pct = maxVal > 0 ? Math.round((d.value / maxVal) * 100) : 0;
                content += '<tr><td class="idp-name" title="' + d.name + '">' + d.name + '</td>';
                content += '<td class="idp-bar"><div class="idp-bar-bg"><div class="idp-bar-fill" style="width:' + pct + '%"></div></div></td>';
                content += '<td class="idp-val">' + d.value + '</td></tr>';
            });
            content += '</table>';
            content += '<div class="idp-action" onclick="InsightsGenerator._closeAllInsightPopovers();InsightsGenerator.handleInsightClickById(\'' + insightId + '\')"><i class="bi bi-arrow-right-circle me-1"></i>View Data</div>';
            content += '</div>';

            var pop = new bootstrap.Popover(el, {
                trigger: 'manual',
                placement: 'bottom',
                html: true,
                sanitize: false,
                content: content,
                container: 'body',
                customClass: 'insight-popover'
            });
            pop.show();
            return;
        }

        this.handleInsightClickById(insightId);
    },

    handleInsightClickById: function(insightId) {
        const insight = this._insightsCache[insightId];
        if (!insight) {
            console.log('Insight not found in cache:', insightId);
            return;
        }
        
        console.log('Insight clicked by ID:', insightId, insight);
        
        this.handleInsightClick(
            insight.tabId,
            insight.agent,
            insight.category,
            insight.filterType,
            insight.filterValue
        );
    },

    /**
     * Handle insight click - navigate to tab and filter/highlight relevant data
     */
    handleInsightClick: function(tabId, agentName, category, filterType, filterValue) {
        // filterValue can be string or array (already parsed from cache)
        const parsedFilterValue = filterValue;
        
        console.log('Insight clicked:', { tabId, agentName, category, filterType, filterValue: parsedFilterValue });
        
        if (!tabId) return;
        
        // Get the target pane ID from the tab button's data-bs-target attribute
        const tabButton = document.getElementById(tabId);
        if (!tabButton) {
            console.log('Tab button not found:', tabId);
            return;
        }
        
        const targetPaneId = tabButton.getAttribute('data-bs-target');
        console.log('Target pane:', targetPaneId);
        
        // Click the tab to navigate
        tabButton.click();
        
        // Scroll to the tab content and filter
        setTimeout(() => {
            const tabContent = document.querySelector('.tab-content');
            if (tabContent) {
                tabContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            
            // Determine what to filter by
            if (filterType === 'changeType' && parsedFilterValue && targetPaneId) {
                // Filter by change type (e.g., Punctuation, or array like ['Punctuation', 'Minor Edit'])
                this.filterByColumnValue(targetPaneId, 'Change Type', parsedFilterValue);
            } else if (filterType === 'ageRange' && parsedFilterValue && targetPaneId) {
                // Filter by age range (critical > 96hrs, warning 48-96hrs)
                this.filterByAgeRange(targetPaneId, parsedFilterValue);
            } else if (filterType && parsedFilterValue && targetPaneId) {
                // Generic column filter - filterType is the column name
                this.filterByColumnValue(targetPaneId, filterType, parsedFilterValue);
            } else if (agentName && targetPaneId) {
                // Filter by agent name
                this.filterAndHighlightAgentInPane(agentName, category, targetPaneId);
            }
        }, 400);  // Increased timeout for Bootstrap transition
    },

    /**
     * Filter table by a specific column and value(s)
     * filterValue can be a string or an array of strings for multiple matches (OR condition)
     */
    filterByColumnValue: function(paneSelector, columnName, filterValue) {
        const pane = document.querySelector(paneSelector);
        if (!pane) {
            console.log('Pane not found:', paneSelector);
            return;
        }
        
        const table = pane.querySelector('table');
        if (!table) {
            console.log('No table found in pane');
            return;
        }
        
        // Find the column index
        const headers = table.querySelectorAll('thead th');
        let columnIndex = -1;
        headers.forEach((th, i) => {
            if (th.textContent.trim().toLowerCase().includes(columnName.toLowerCase())) {
                columnIndex = i;
            }
        });
        
        console.log('Looking for column:', columnName, 'Found at index:', columnIndex);
        
        if (columnIndex < 0) {
            console.log('Column not found:', columnName);
            return;
        }
        
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        let foundCount = 0;
        
        // Support both single value and array of values
        const searchValues = Array.isArray(filterValue) 
            ? filterValue.map(v => v.trim().toUpperCase())
            : [filterValue.trim().toUpperCase()];
        
        console.log('Filtering by', columnName, '=', searchValues, 'in', rows.length, 'rows');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let found = false;
            
            if (cells[columnIndex]) {
                const cellText = cells[columnIndex].textContent.trim().toUpperCase();
                // Check if cell matches ANY of the search values
                for (const searchValue of searchValues) {
                    if (cellText === searchValue || cellText.includes(searchValue)) {
                        found = true;
                        break;
                    }
                }
            }
            
            if (found) {
                row.classList.remove('hidden-row');
                row.style.cssText = '';
                row.classList.add('table-warning', 'highlight-pulse');
                foundCount++;
                
                if (foundCount === 1) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                
                setTimeout(() => {
                    row.classList.remove('highlight-pulse');
                }, 3000);
            } else {
                row.classList.add('hidden-row');
                row.style.cssText = 'display: none !important; visibility: hidden !important;';
            }
        });
        
        // Create label for multiple values
        const filterLabel = Array.isArray(filterValue) 
            ? `${columnName}: ${filterValue.join(' or ')}`
            : `${columnName}: ${filterValue}`;
        
        console.log('Found', foundCount, 'matching rows for', filterLabel);
        
        // Add show all button
        this.addShowAllButton(pane, tbody, rows, filterLabel, foundCount);
    },

    /**
     * Filter table by age range (critical > 96hrs, warning 48-96hrs)
     */
    filterByAgeRange: function(paneSelector, rangeType) {
        const pane = document.querySelector(paneSelector);
        if (!pane) {
            console.log('Pane not found:', paneSelector);
            return;
        }
        
        const table = pane.querySelector('table');
        if (!table) {
            console.log('No table found in pane');
            return;
        }
        
        // Find the Age column index
        const headers = table.querySelectorAll('thead th');
        let ageColumnIndex = -1;
        headers.forEach((th, i) => {
            const headerText = th.textContent.trim().toLowerCase();
            if (headerText.includes('age') && !headerText.includes('manager')) {
                ageColumnIndex = i;
            }
        });
        
        console.log('Age column index:', ageColumnIndex, 'Range type:', rangeType);
        
        if (ageColumnIndex < 0) {
            console.log('Age column not found');
            return;
        }
        
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        let foundCount = 0;
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let found = false;
            
            if (cells[ageColumnIndex]) {
                const ageValue = parseFloat(cells[ageColumnIndex].textContent.trim());
                
                if (!isNaN(ageValue)) {
                    if (rangeType === 'critical' && ageValue > 96) {
                        found = true;
                    } else if (rangeType === 'warning' && ageValue >= 48 && ageValue <= 96) {
                        found = true;
                    }
                }
            }
            
            if (found) {
                row.classList.remove('hidden-row');
                row.style.cssText = '';
                row.classList.add('table-warning', 'highlight-pulse');
                foundCount++;
                
                if (foundCount === 1) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                
                setTimeout(() => {
                    row.classList.remove('highlight-pulse');
                }, 3000);
            } else {
                row.classList.add('hidden-row');
                row.style.cssText = 'display: none !important; visibility: hidden !important;';
            }
        });
        
        const rangeLabel = rangeType === 'critical' ? 'Age > 96 hours' : 'Age 48-96 hours';
        console.log('Found', foundCount, 'rows for', rangeLabel);
        
        this.addShowAllButton(pane, tbody, rows, rangeLabel, foundCount);
    },

    /**
     * Filter table to show only the agent's data and highlight (legacy - uses active pane)
     */
    filterAndHighlightAgent: function(agentName, category) {
        const activePane = document.querySelector('.tab-pane.active');
        if (activePane) {
            this.filterTableInPane(activePane, agentName);
        }
    },

    /**
     * Filter table in a specific pane by ID
     */
    filterAndHighlightAgentInPane: function(agentName, category, paneSelector) {
        const pane = document.querySelector(paneSelector);
        console.log('Looking for pane:', paneSelector, 'Found:', !!pane);
        
        if (!pane) {
            console.log('Pane not found, falling back to active pane');
            this.filterAndHighlightAgent(agentName, category);
            return;
        }
        
        this.filterTableInPane(pane, agentName);
    },

    /**
     * Filter table in a given pane element
     */
    filterTableInPane: function(pane, agentName) {
        const table = pane.querySelector('table');
        if (!table) {
            console.log('No table found in pane');
            return;
        }
        
        const tbody = table.querySelector('tbody');
        if (!tbody) {
            console.log('No tbody found in table');
            return;
        }
        
        // Find the agent/owner column index from headers
        const agentColumnIndex = this.findAgentColumnIndex(table);
        console.log('Agent column index:', agentColumnIndex);
        
        const rows = tbody.querySelectorAll('tr');
        let foundCount = 0;
        const searchName = agentName.trim().toUpperCase();
        
        console.log('Searching for agent:', searchName, 'in', rows.length, 'rows');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            let found = false;
            
            if (agentColumnIndex >= 0 && cells[agentColumnIndex]) {
                // Search only in the agent column
                const cellText = cells[agentColumnIndex].textContent.trim().toUpperCase();
                if (cellText === searchName) {
                    found = true;
                }
            } else {
                // Fallback: search in columns that look like agent names (short text, no @ symbol)
                cells.forEach(cell => {
                    const cellText = cell.textContent.trim();
                    // Only match if it's a short value (likely a name) and doesn't contain @ (not an email)
                    if (cellText.length < 30 && !cellText.includes('@') && !cellText.includes('/')) {
                        if (cellText.toUpperCase() === searchName) {
                            found = true;
                        }
                    }
                });
            }
            
            if (found) {
                // Show and highlight matching rows - remove hidden class if present
                row.classList.remove('hidden-row');
                row.style.cssText = '';  // Clear inline styles
                row.classList.add('table-warning', 'highlight-pulse');
                foundCount++;
                
                // Scroll to first match
                if (foundCount === 1) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                
                // Remove highlight after 3 seconds but keep visible
                setTimeout(() => {
                    row.classList.remove('highlight-pulse');
                }, 3000);
            } else {
                // Hide non-matching rows - use both class AND inline style for maximum compatibility
                row.classList.add('hidden-row');
                row.style.cssText = 'display: none !important; visibility: hidden !important;';
            }
        });
        
        console.log('Found', foundCount, 'matching rows for', searchName);
        
        // Add a "Show All" button if filtering was applied
        this.addShowAllButton(pane, tbody, rows, agentName, foundCount);
    },

    /**
     * Find the column index that contains agent/owner names
     */
    findAgentColumnIndex: function(table) {
        const headers = table.querySelectorAll('thead th');
        const agentHeaders = ['edited by', 'agent name', 'agent', 'case owner', 'owner', 'name'];
        
        let index = -1;
        headers.forEach((th, i) => {
            const headerText = th.textContent.trim().toLowerCase();
            agentHeaders.forEach(agentHeader => {
                if (headerText === agentHeader || headerText.includes(agentHeader)) {
                    index = i;
                }
            });
        });
        
        return index;
    },

    /**
     * Add a "Show All" button to restore full table
     */
    addShowAllButton: function(pane, tbody, rows, agentName, foundCount) {
        // Remove existing button if any
        const existingBtn = pane.querySelector('.show-all-btn');
        if (existingBtn) existingBtn.remove();
        
        // Create info bar with show all button
        const infoBar = document.createElement('div');
        infoBar.className = 'show-all-btn alert alert-info d-flex justify-content-between align-items-center mb-3';
        infoBar.innerHTML = `
            <span><i class="bi bi-funnel me-2"></i>Showing ${foundCount} rows for <strong>${agentName}</strong></span>
            <button class="btn btn-sm btn-primary" onclick="InsightsGenerator.showAllRows(this)">
                <i class="bi bi-eye me-1"></i>Show All Rows
            </button>
        `;
        
        // Insert before the table
        const tableContainer = pane.querySelector('.table-responsive') || pane.querySelector('table').parentElement;
        tableContainer.parentElement.insertBefore(infoBar, tableContainer);
    },

    /**
     * Show all rows in the table
     */
    showAllRows: function(button) {
        const pane = button.closest('.tab-pane');
        if (!pane) return;
        
        // Show all rows - remove hidden-row class AND clear inline styles
        const rows = pane.querySelectorAll('table tbody tr');
        rows.forEach(row => {
            row.classList.remove('hidden-row', 'table-warning');
            row.style.cssText = '';  // Clear inline styles
        });
        
        // Remove the info bar
        const infoBar = pane.querySelector('.show-all-btn');
        if (infoBar) infoBar.remove();
    },

    /**
     * Get insight count by type
     */
    getInsightCounts: function(insights) {
        return {
            critical: insights.filter(i => i.type === 'critical').length,
            warning: insights.filter(i => i.type === 'warning').length,
            info: insights.filter(i => i.type === 'info').length,
            total: insights.length
        };
    }
};

// Export for use in other modules
window.InsightsGenerator = InsightsGenerator;
