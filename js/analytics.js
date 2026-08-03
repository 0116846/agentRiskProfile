/**
 * Analytics Engine Module
 * Provides AI-powered anomaly detection, trend analysis, and statistical insights
 */

const Analytics = {
    // Thresholds for anomaly detection
    thresholds: {
        zScoreAnomaly: 2.0,      // Z-score threshold for anomaly
        zScoreWarning: 1.5,     // Z-score threshold for warning
        iqrMultiplier: 1.5,     // IQR multiplier for outlier detection
        ageHoursCritical: 96,   // Hours for critical case age
        ageHoursWarning: 48,    // Hours for warning case age
        shortCallsThreshold: 50, // Threshold for concerning short calls
        ronaThreshold: 30       // Threshold for concerning RONA
    },

    /**
     * Run full analysis on the dataset
     * @param {Object} data - Processed data from DataParser
     * @returns {Object} - Complete analysis results
     */
    analyze: function(data) {
        return {
            caseRecordType: this.analyzeCaseRecordType(data.caseRecordType || []),
            proactiveType: this.analyzeProactiveType(data.proactiveType || []),
            age48hrs: this.analyzeAge48hrs(data.age48hrs || []),
            emailChanges: this.analyzeEmailChanges(data.emailChanges || []),
            shortCalls: this.analyzeShortCalls(data.shortCalls || []),
            ronaTrend: this.analyzeRonaTrend(data.ronaTrend || []),
            anomalies: this.detectAllAnomalies(data),
            summary: this.generateSummaryStats(data)
        };
    },

    /**
     * Analyze Case Record Type data
     */
    analyzeCaseRecordType: function(data) {
        if (!data.length) return { distribution: {}, byOrigin: {}, byManager: {} };
        
        const distribution = this.countBy(data, 'recordType');
        const byOrigin = this.countBy(data, 'origin');
        const byManager = this.groupAndCount(data, 'manager', 'recordType');
        
        return {
            distribution,
            byOrigin,
            byManager,
            totalCases: data.length,
            mostCommonType: this.getMaxKey(distribution),
            mostCommonOrigin: this.getMaxKey(byOrigin)
        };
    },

    /**
     * Analyze Proactive Type data
     */
    analyzeProactiveType: function(data) {
        if (!data.length) return { distribution: {}, byManager: {} };
        
        const distribution = this.countBy(data, 'proactiveType');
        const byManager = this.groupAndCount(data, 'manager', 'proactiveType');
        
        return {
            distribution,
            byManager,
            totalCases: data.length,
            mostCommonType: this.getMaxKey(distribution)
        };
    },

    /**
     * Analyze Age 48hrs data
     */
    analyzeAge48hrs: function(data) {
        if (!data.length) return { stats: {}, critical: [], warnings: [], byOwner: {} };
        
        const ages = data.map(r => r.age).filter(a => !isNaN(a));
        const stats = this.calculateStats(ages);
        
        const critical = data.filter(r => r.age > this.thresholds.ageHoursCritical);
        const warnings = data.filter(r => r.age > this.thresholds.ageHoursWarning && r.age <= this.thresholds.ageHoursCritical);
        
        const byOwner = {};
        data.forEach(r => {
            if (!byOwner[r.caseOwner]) {
                byOwner[r.caseOwner] = { count: 0, totalAge: 0, critical: 0 };
            }
            byOwner[r.caseOwner].count++;
            byOwner[r.caseOwner].totalAge += r.age;
            if (r.age > this.thresholds.ageHoursCritical) {
                byOwner[r.caseOwner].critical++;
            }
        });
        
        // Calculate average age per owner
        Object.keys(byOwner).forEach(owner => {
            byOwner[owner].avgAge = byOwner[owner].totalAge / byOwner[owner].count;
        });
        
        return {
            stats,
            critical,
            warnings,
            byOwner,
            criticalCount: critical.length,
            warningCount: warnings.length,
            byOrigin: this.countBy(data, 'origin')
        };
    },

    /**
     * Analyze Email Changes data
     */
    analyzeEmailChanges: function(data) {
        if (!data.length) return { byAgent: {}, byType: {}, timeline: [], anomalies: [] };
        
        const byAgent = this.countBy(data, 'editedBy');
        const byType = this.countBy(data, 'changeType');
        
        // Analyze by date
        const byDate = {};
        data.forEach(r => {
            if (r.editDate) {
                const dateKey = r.editDate.toISOString().split('T')[0];
                byDate[dateKey] = (byDate[dateKey] || 0) + 1;
            }
        });
        
        const timeline = Object.entries(byDate)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Detect agents with anomalous email changes
        const agentCounts = Object.values(byAgent);
        const stats = this.calculateStats(agentCounts);
        const anomalies = [];
        
        Object.entries(byAgent).forEach(([agent, count]) => {
            const zScore = this.calculateZScore(count, stats.mean, stats.stdDev);
            if (zScore > this.thresholds.zScoreAnomaly) {
                anomalies.push({
                    agent,
                    count,
                    zScore,
                    severity: 'high',
                    percentAboveAvg: stats.mean > 0 ? (count / stats.mean).toFixed(1) : '0'
                });
            } else if (zScore > this.thresholds.zScoreWarning) {
                anomalies.push({
                    agent,
                    count,
                    zScore,
                    severity: 'medium',
                    percentAboveAvg: stats.mean > 0 ? (count / stats.mean).toFixed(1) : '0'
                });
            }
        });
        
        return {
            byAgent,
            byType,
            timeline,
            anomalies: anomalies.sort((a, b) => b.count - a.count),
            stats,
            suspiciousChanges: data.filter(r => r.changeType === 'punctuation' || r.changeType === 'minor_edit')
        };
    },

    /**
     * Analyze Short Calls data
     */
    analyzeShortCalls: function(data) {
        if (!data.length) return { stats: {}, outliers: [], rankings: [], aggregatedRankings: [] };
        
        // First, aggregate by agent name (sum counts for same agent)
        const agentTotals = {};
        data.forEach(r => {
            const key = (function(n){var w=n.trim().toUpperCase().split(/\s+/).filter(function(x){return x.length>0;}),s={},u=[];w.forEach(function(x){if(!s[x]){s[x]=1;u.push(x);}});return u.sort().join(' ');})(r.agentName || '');
            if (!key) return;

            if (!agentTotals[key]) {
                agentTotals[key] = { agentName: r.agentName, count: 0 };
            }
            agentTotals[key].count += r.count || 0;
        });

        // Convert to array
        const aggregatedData = Object.values(agentTotals);

        const counts = aggregatedData.map(r => r.count);
        const stats = this.calculateStats(counts);

        // Detect outliers using Z-score and IQR on aggregated data
        const outliers = [];
        const aggregatedRankings = aggregatedData.map(r => {
            const zScore = this.calculateZScore(r.count, stats.mean, stats.stdDev);
            const percentOfAvg = stats.mean > 0 ? (r.count / stats.mean).toFixed(1) : '0';
            const isOutlier = zScore > this.thresholds.zScoreAnomaly;
            const isWarning = zScore > this.thresholds.zScoreWarning;
            
            const result = {
                ...r,
                zScore,
                percentOfAvg,
                status: isOutlier ? 'outlier' : (isWarning ? 'warning' : 'normal'),
                vsAverage: r.count - stats.mean
            };
            
            if (isOutlier || isWarning) {
                outliers.push(result);
            }
            
            return result;
        }).sort((a, b) => b.count - a.count);
        
        // Also keep raw rankings for table display (non-aggregated)
        const rawRankings = data.map(r => {
            const zScore = this.calculateZScore(r.count, stats.mean, stats.stdDev);
            return {
                ...r,
                zScore,
                percentOfAvg: stats.mean > 0 ? (r.count / stats.mean).toFixed(1) : '0',
                status: zScore > this.thresholds.zScoreAnomaly ? 'outlier' : 
                       (zScore > this.thresholds.zScoreWarning ? 'warning' : 'normal'),
                vsAverage: r.count - stats.mean
            };
        }).sort((a, b) => b.count - a.count);
        
        return {
            stats,
            outliers: outliers.sort((a, b) => b.zScore - a.zScore),
            rankings: rawRankings,  // Raw data for table display
            aggregatedRankings,     // Aggregated by agent for insights
            total: data.reduce((sum, r) => sum + (r.count || 0), 0),
            topOffenders: aggregatedRankings.slice(0, 5)  // Use aggregated for insights
        };
    },

    /**
     * Analyze RONA Trend data
     */
    analyzeRonaTrend: function(data) {
        if (!data.length) return { stats: {}, outliers: [], rankings: [], aggregatedRankings: [] };
        
        // First, aggregate by agent name (sum RONA for same agent)
        const agentTotals = {};
        data.forEach(r => {
            const key = (function(n){var w=n.trim().toUpperCase().split(/\s+/).filter(function(x){return x.length>0;}),s={},u=[];w.forEach(function(x){if(!s[x]){s[x]=1;u.push(x);}});return u.sort().join(' ');})(r.agentName || '');
            if (!key) return;

            if (!agentTotals[key]) {
                agentTotals[key] = { agentName: r.agentName, rona: 0 };
            }
            agentTotals[key].rona += r.rona || 0;
        });

        // Convert to array
        const aggregatedData = Object.values(agentTotals);

        const ronas = aggregatedData.map(r => r.rona);
        const stats = this.calculateStats(ronas);

        const outliers = [];
        const aggregatedRankings = aggregatedData.map(r => {
            const zScore = this.calculateZScore(r.rona, stats.mean, stats.stdDev);
            const percentOfAvg = stats.mean > 0 ? (r.rona / stats.mean).toFixed(1) : '0';
            const isOutlier = zScore > this.thresholds.zScoreAnomaly;
            const isWarning = zScore > this.thresholds.zScoreWarning;
            
            const result = {
                ...r,
                zScore,
                percentOfAvg,
                status: isOutlier ? 'outlier' : (isWarning ? 'warning' : 'normal'),
                vsAverage: r.rona - stats.mean
            };
            
            if (isOutlier || isWarning) {
                outliers.push(result);
            }
            
            return result;
        }).sort((a, b) => b.rona - a.rona);
        
        // Also keep raw rankings for table display
        const rawRankings = data.map(r => {
            const zScore = this.calculateZScore(r.rona, stats.mean, stats.stdDev);
            return {
                ...r,
                zScore,
                percentOfAvg: stats.mean > 0 ? (r.rona / stats.mean).toFixed(1) : '0',
                status: zScore > this.thresholds.zScoreAnomaly ? 'outlier' : 
                       (zScore > this.thresholds.zScoreWarning ? 'warning' : 'normal'),
                vsAverage: r.rona - stats.mean
            };
        }).sort((a, b) => b.rona - a.rona);
        
        return {
            stats,
            outliers: outliers.sort((a, b) => b.zScore - a.zScore),
            rankings: rawRankings,  // Raw data for table display
            aggregatedRankings,     // Aggregated by agent for insights
            total: data.reduce((sum, r) => sum + (r.rona || 0), 0),
            topAgents: aggregatedRankings.slice(0, 5),  // Use aggregated for insights
            threshold: stats.mean * 2 // 2x average as threshold
        };
    },

    /**
     * Detect all anomalies across all data sets
     */
    detectAllAnomalies: function(data) {
        const anomalies = [];
        
        // Short calls anomalies
        if (data.shortCalls?.length) {
            const shortCallsAnalysis = this.analyzeShortCalls(data.shortCalls);
            shortCallsAnalysis.outliers.forEach(o => {
                anomalies.push({
                    type: 'short_calls',
                    agent: o.agentName,
                    value: o.count,
                    severity: o.status === 'outlier' ? 'high' : 'medium',
                    message: `${o.agentName} has ${o.count} short calls (${o.percentOfAvg}x average)`
                });
            });
        }
        
        // RONA anomalies
        if (data.ronaTrend?.length) {
            const ronaAnalysis = this.analyzeRonaTrend(data.ronaTrend);
            ronaAnalysis.outliers.forEach(o => {
                anomalies.push({
                    type: 'rona',
                    agent: o.agentName,
                    value: o.rona,
                    severity: o.status === 'outlier' ? 'high' : 'medium',
                    message: `${o.agentName} has RONA of ${o.rona} (${o.percentOfAvg}x average)`
                });
            });
        }
        
        // Email change anomalies
        if (data.emailChanges?.length) {
            const emailAnalysis = this.analyzeEmailChanges(data.emailChanges);
            emailAnalysis.anomalies.forEach(a => {
                anomalies.push({
                    type: 'email_changes',
                    agent: a.agent,
                    value: a.count,
                    severity: a.severity,
                    message: `${a.agent} made ${a.count} email changes (${a.percentAboveAvg}x average)`
                });
            });
        }
        
        // Critical age cases
        if (data.age48hrs?.length) {
            const ageAnalysis = this.analyzeAge48hrs(data.age48hrs);
            if (ageAnalysis.criticalCount > 0) {
                anomalies.push({
                    type: 'age_critical',
                    value: ageAnalysis.criticalCount,
                    severity: 'high',
                    message: `${ageAnalysis.criticalCount} cases are critically aged (over 96 hours)`
                });
            }
        }
        
        return anomalies.sort((a, b) => {
            const severityOrder = { high: 0, medium: 1, low: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    },

    /**
     * Generate summary statistics
     */
    generateSummaryStats: function(data) {
        return {
            totalRecords: {
                caseRecordType: data.caseRecordType?.length || 0,
                proactiveType: data.proactiveType?.length || 0,
                age48hrs: data.age48hrs?.length || 0,
                emailChanges: data.emailChanges?.length || 0,
                shortCalls: data.shortCalls?.length || 0,
                ronaTrend: data.ronaTrend?.length || 0
            },
            calculated: DataParser.getSummary()
        };
    },

    /**
     * Calculate Agent Risk Scores
     * Uses raw values with 0.25 weight each, capped at 100
     */
    calculateAgentRiskScores: function(data) {
        const agentMetrics = {};
        
        // Helper function to ensure agent exists in metrics
        const ensureAgent = (agent) => {
            if (!agentMetrics[agent]) {
                agentMetrics[agent] = { shortCalls: 0, rona: 0, emailChanges: 0, agedCases: 0 };
            }
        };
        
        // Helper to check if agent name is valid (filter out TOTAL and empty)
        const canonicalize = (name) => {
            if (!name) return '';
            var w = String(name).trim().toUpperCase().split(/\s+/).filter(x => x.length > 0);
            if (w.join(' ') === 'AUTOMATED PROCESS') return '';
            var s = {}, u = [];
            w.forEach(x => { if (!s[x]) { s[x] = 1; u.push(x); } });
            return u.sort().join(' ');
        };

        const isValidAgent = (agent) => {
            if (!agent) return false;
            return agent !== '' && agent !== 'TOTAL' && agent !== 'GRAND TOTAL';
        };

        if (data.shortCalls?.length) {
            data.shortCalls.forEach(row => {
                const agent = canonicalize(row.agentName);
                if (!isValidAgent(agent)) return;
                ensureAgent(agent);
                agentMetrics[agent].shortCalls += row.count || 0;
            });
        }

        if (data.ronaTrend?.length) {
            data.ronaTrend.forEach(row => {
                const agent = canonicalize(row.agentName);
                if (!isValidAgent(agent)) return;
                ensureAgent(agent);
                agentMetrics[agent].rona += row.rona || 0;
            });
        }

        if (data.emailChanges?.length) {
            data.emailChanges.forEach(row => {
                const agent = canonicalize(row.editedBy);
                if (!isValidAgent(agent)) return;
                ensureAgent(agent);
                agentMetrics[agent].emailChanges += 1;
            });
        }

        if (data.age48hrs?.length) {
            data.age48hrs.forEach(row => {
                const agent = canonicalize(row.caseOwner);
                if (!isValidAgent(agent)) return;
                ensureAgent(agent);
                if (row.age > 48) {
                    agentMetrics[agent].agedCases += 1;
                }
            });
        }
        
        // Convert to array
        const agentList = Object.entries(agentMetrics);
        
        if (agentList.length === 0) {
            return { rankings: [], counts: { critical: 0, high: 0, medium: 0, low: 0 }, highRiskAgents: [] };
        }
        
        // Calculate risk scores using raw values with 0.25 weight each
        const riskScores = agentList.map(([agent, metrics]) => {
            // Raw total (sum of all metrics)
            const rawTotal = metrics.shortCalls + metrics.rona + metrics.emailChanges + metrics.agedCases;
            
            // Risk score: 0.25 * each metric, capped at 100
            const totalRiskScore = Math.min(100, 
                (0.25 * metrics.shortCalls) + 
                (0.25 * metrics.rona) + 
                (0.25 * metrics.emailChanges) + 
                (0.25 * metrics.agedCases)
            );
            
            // Determine risk level
            let riskLevel, riskClass;
            if (totalRiskScore >= 60) {
                riskLevel = 'Critical';
                riskClass = 'danger';
            } else if (totalRiskScore >= 40) {
                riskLevel = 'High';
                riskClass = 'warning';
            } else if (totalRiskScore >= 20) {
                riskLevel = 'Medium';
                riskClass = 'info';
            } else {
                riskLevel = 'Low';
                riskClass = 'success';
            }
            
            return {
                agent,
                riskScore: Math.round(totalRiskScore),
                rawTotal,
                riskLevel,
                riskClass,
                // Raw values
                shortCalls: metrics.shortCalls || 0,
                rona: metrics.rona || 0,
                emailChanges: metrics.emailChanges || 0,
                agedCases: metrics.agedCases || 0
            };
        });
        
        // Sort by risk score (highest first)
        riskScores.sort((a, b) => b.riskScore - a.riskScore);
        
        // Assign original rank after sorting (1-based)
        riskScores.forEach((agent, index) => {
            agent.originalRank = index + 1;
        });
        
        // Count by risk level
        const riskCounts = {
            critical: riskScores.filter(r => r.riskLevel === 'Critical').length,
            high: riskScores.filter(r => r.riskLevel === 'High').length,
            medium: riskScores.filter(r => r.riskLevel === 'Medium').length,
            low: riskScores.filter(r => r.riskLevel === 'Low').length
        };
        
        return {
            rankings: riskScores,
            counts: riskCounts,
            highRiskAgents: riskScores.filter(r => r.riskLevel === 'Critical' || r.riskLevel === 'High')
        };
    },

    // ==================== Utility Functions ====================

    /**
     * Calculate basic statistics
     */
    calculateStats: function(values) {
        if (!values.length) return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0, q1: 0, q3: 0, iqr: 0 };
        
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);
        
        const median = n % 2 === 0 
            ? (sorted[n/2 - 1] + sorted[n/2]) / 2 
            : sorted[Math.floor(n/2)];
        
        const q1 = sorted[Math.floor(n * 0.25)];
        const q3 = sorted[Math.floor(n * 0.75)];
        const iqr = q3 - q1;
        
        return {
            mean: parseFloat(mean.toFixed(2)),
            stdDev: parseFloat(stdDev.toFixed(2)),
            min: Math.min(...values),
            max: Math.max(...values),
            median,
            q1,
            q3,
            iqr,
            count: n
        };
    },

    /**
     * Calculate Z-score
     */
    calculateZScore: function(value, mean, stdDev) {
        if (stdDev === 0) return 0;
        return (value - mean) / stdDev;
    },

    /**
     * Count occurrences by property
     */
    countBy: function(data, property) {
        return data.reduce((acc, item) => {
            const key = item[property] || 'Unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    },

    /**
     * Group and count by two properties
     */
    groupAndCount: function(data, groupBy, countBy) {
        const result = {};
        data.forEach(item => {
            const group = item[groupBy] || 'Unknown';
            const key = item[countBy] || 'Unknown';
            if (!result[group]) result[group] = {};
            result[group][key] = (result[group][key] || 0) + 1;
        });
        return result;
    },

    /**
     * Get key with maximum value
     */
    getMaxKey: function(obj) {
        let maxKey = null;
        let maxVal = -Infinity;
        Object.entries(obj).forEach(([key, val]) => {
            if (val > maxVal) {
                maxVal = val;
                maxKey = key;
            }
        });
        return maxKey;
    },

    /**
     * Perform linear regression for trend prediction
     */
    linearRegression: function(data) {
        if (!data.length) return { slope: 0, intercept: 0, predict: () => 0 };
        
        const n = data.length;
        const xValues = data.map((_, i) => i);
        const yValues = data.map(d => typeof d === 'object' ? d.value : d);
        
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((total, x, i) => total + x * yValues[i], 0);
        const sumX2 = xValues.reduce((total, x) => total + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        return {
            slope: parseFloat(slope.toFixed(4)),
            intercept: parseFloat(intercept.toFixed(4)),
            predict: (x) => slope * x + intercept,
            trend: slope > 0 ? 'increasing' : (slope < 0 ? 'decreasing' : 'stable')
        };
    },

    /**
     * Detect IQR-based outliers
     */
    detectIQROutliers: function(values) {
        const stats = this.calculateStats(values);
        const lowerBound = stats.q1 - this.thresholds.iqrMultiplier * stats.iqr;
        const upperBound = stats.q3 + this.thresholds.iqrMultiplier * stats.iqr;
        
        return {
            lowerBound,
            upperBound,
            outliers: values.filter(v => v < lowerBound || v > upperBound)
        };
    }
};

// Export for use in other modules
window.Analytics = Analytics;
