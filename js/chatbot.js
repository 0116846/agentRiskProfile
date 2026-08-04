/**
 * Smart Chatbot Module - Full-Power NLU Engine
 * Local NLP-powered chatbot that can answer ANY question about the dashboard data.
 * Supports conversation context, drill-downs, manager+agent combos, cross-metric analysis,
 * filtering, ranking, comparison, and every insight the dashboard can derive.
 * No API key required - runs entirely in the browser.
 */

const Chatbot = {
    // Chat state
    isOpen: false,
    isMaximized: false,
    messages: [],
    isTyping: false,

    // Conversation context for follow-up questions
    context: {
        lastAgent: null,
        lastManager: null,
        lastTopic: null,      // 'risk', 'shortCalls', 'rona', 'email', 'aged', 'caseRecord', 'proactive', 'summary', 'anomaly'
        lastInsight: null,
        lastResults: null,     // Store last result set for "tell me more" / "details"
        lastAgentList: null,   // Store last list of agents shown
    },

    // Greeting shown on first open
    greeting: `Hi! I'm your **Smart Dashboard Assistant**. I can answer *any* question about your agent data, drill down into details, and help you analyze performance.

Try asking me things like:
- "Give me a full summary"
- "Who are the top 5 riskiest agents?"
- "Under manager X, who is at most risk?"
- "Tell me about agent John"
- "Filter dashboard by manager X"
- "Filter by agent John"
- "Show insights for manager X"
- "Go to short calls tab"
- "Reset all filters"
- "What improvements do you recommend?"

**I can also control the dashboard for you** -- filter by manager/agent, navigate tabs, and generate scoped insights. Load your JSON data first, then ask away!`,

    /**
     * Initialize chatbot UI and events
     */
    init: function () {
        this.createUI();
        this.bindEvents();
        this.messages.push({ role: 'bot', text: this.greeting, time: new Date() });
    },

    /**
     * Create the chatbot UI elements
     */
    createUI: function () {
        const fab = document.createElement('div');
        fab.id = 'chatbot-fab';
        fab.innerHTML = '<i class="bi bi-chat-dots-fill"></i>';
        fab.title = 'Ask Smart Assistant';
        document.body.appendChild(fab);

        const badge = document.createElement('span');
        badge.id = 'chatbot-badge';
        badge.textContent = '1';
        fab.appendChild(badge);

        const panel = document.createElement('div');
        panel.id = 'chatbot-panel';
        panel.classList.add('chatbot-closed');
        panel.innerHTML = `
            <div class="chatbot-header">
                <div class="chatbot-header-left">
                    <i class="bi bi-robot me-2"></i>
                    <span class="chatbot-title">Smart Assistant</span>
                    <span class="chatbot-status">
                        <span class="chatbot-status-dot"></span> Ready
                    </span>
                </div>
                <div class="chatbot-header-right">
                    <button class="chatbot-btn" id="chatbot-clear" title="Clear chat">
                        <i class="bi bi-trash"></i>
                    </button>
                    <button class="chatbot-btn" id="chatbot-maximize" title="Maximize">
                        <i class="bi bi-arrows-fullscreen"></i>
                    </button>
                    <button class="chatbot-btn" id="chatbot-close" title="Close">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </div>
            <div class="chatbot-messages" id="chatbot-messages"></div>
            <div class="chatbot-suggestions" id="chatbot-suggestions">
                <button class="chatbot-suggestion" data-q="Give me a full summary">📊 Summary</button>
                <button class="chatbot-suggestion" data-q="Who are the top 5 riskiest agents?">🔥 Top Risk</button>
                <button class="chatbot-suggestion" data-q="Which manager needs the most attention?">👀 Manager Focus</button>
                <button class="chatbot-suggestion" data-q="Show all insights">💡 Insights</button>
                <button class="chatbot-suggestion" data-q="Show anomalies and outliers">⚠️ Anomalies</button>
                <button class="chatbot-suggestion" data-q="Who are the best performing agents?">⭐ Top Performers</button>
                <button class="chatbot-suggestion" data-q="Which agents have issues in multiple areas?">🚨 Multi-Issue</button>
                <button class="chatbot-suggestion" data-q="Show aged cases over 72 hours">⏰ Critical Aging</button>
                <button class="chatbot-suggestion" data-q="Show short calls stats">📞 Short Calls</button>
                <button class="chatbot-suggestion" data-q="Show RONA overview">📱 RONA</button>
                <button class="chatbot-suggestion" data-q="Show email changes analysis">📧 Emails</button>
                <button class="chatbot-suggestion" data-q="Compare all managers">📈 Compare Mgrs</button>
                <button class="chatbot-suggestion" data-q="Show team stats">👥 Team Stats</button>
                <button class="chatbot-suggestion" data-q="Go to short calls tab">🔀 Go To Tab</button>
                <button class="chatbot-suggestion" data-q="Reset filters">🧹 Clear Filters</button>
                <button class="chatbot-suggestion" data-q="Export all data as excel">📥 Download All</button>
                <button class="chatbot-suggestion" data-q="What improvements do you recommend?">🎯 Actions</button>
                <button class="chatbot-suggestion" data-q="What filters are active?">🔍 Active Filters</button>
                <button class="chatbot-suggestion" data-q="Switch to dark mode">🌙 Dark Mode</button>
                <button class="chatbot-suggestion" data-q="Help">❓ Help</button>
            </div>
            <div class="chatbot-input-area">
                <input type="text" id="chatbot-input" placeholder="Ask me anything about your data..." autocomplete="off" />
                <button id="chatbot-send" title="Send">
                    <i class="bi bi-send-fill"></i>
                </button>
            </div>
        `;
        document.body.appendChild(panel);
    },

    /**
     * Bind all event listeners
     */
    bindEvents: function () {
        document.getElementById('chatbot-fab').addEventListener('click', () => this.toggle());
        document.getElementById('chatbot-close').addEventListener('click', () => this.toggle());
        document.getElementById('chatbot-send').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatbot-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        document.getElementById('chatbot-clear').addEventListener('click', () => {
            this.messages = [{ role: 'bot', text: this.greeting, time: new Date() }];
            this.context = { lastAgent: null, lastManager: null, lastTopic: null, lastInsight: null, lastResults: null, lastAgentList: null };
            this.renderMessages();
            this._restoreOriginalSuggestions();
        });
        document.getElementById('chatbot-maximize').addEventListener('click', () => this.toggleMaximize());
        document.querySelectorAll('.chatbot-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('chatbot-input').value = btn.dataset.q;
                this.sendMessage();
            });
        });
    },

    /**
     * Toggle chat panel open/closed
     */
    toggle: function () {
        this.isOpen = !this.isOpen;
        const panel = document.getElementById('chatbot-panel');
        const fab = document.getElementById('chatbot-fab');
        const badge = document.getElementById('chatbot-badge');

        if (this.isOpen) {
            panel.classList.remove('chatbot-closed');
            panel.classList.add('chatbot-open');
            fab.classList.add('chatbot-fab-active');
            badge.style.display = 'none';
            this.renderMessages();
            setTimeout(() => document.getElementById('chatbot-input').focus(), 300);
        } else {
            panel.classList.remove('chatbot-open');
            panel.classList.add('chatbot-closed');
            fab.classList.remove('chatbot-fab-active');
            // Also reset maximize when closing
            if (this.isMaximized) {
                this.isMaximized = false;
                panel.classList.remove('chatbot-maximized');
                const maxBtn = document.getElementById('chatbot-maximize');
                maxBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
                maxBtn.title = 'Maximize';
            }
        }
    },

    /**
     * Toggle maximize / restore the chat panel
     */
    toggleMaximize: function () {
        this.isMaximized = !this.isMaximized;
        const panel = document.getElementById('chatbot-panel');
        const btn = document.getElementById('chatbot-maximize');

        if (this.isMaximized) {
            panel.classList.add('chatbot-maximized');
            btn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
            btn.title = 'Restore';
        } else {
            panel.classList.remove('chatbot-maximized');
            btn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
            btn.title = 'Maximize';
        }

        // Re-scroll to bottom after resize transition
        setTimeout(() => {
            const container = document.getElementById('chatbot-messages');
            container.scrollTop = container.scrollHeight;
        }, 400);
    },

    /**
     * Send user message and generate response
     */
    sendMessage: function () {
        const input = document.getElementById('chatbot-input');
        const text = input.value.trim();
        if (!text || this.isTyping) return;

        this.messages.push({ role: 'user', text, time: new Date() });
        input.value = '';
        this.renderMessages();
        document.getElementById('chatbot-suggestions').style.display = 'none';

        this.isTyping = true;
        this.renderMessages();

        const delay = 300 + Math.random() * 500;
        setTimeout(() => {
            const response = this.generateResponse(text);
            this.isTyping = false;
            this.messages.push({ role: 'bot', text: response, time: new Date() });
            this.renderMessages();
            this.showContextualSuggestions();
        }, delay);
    },

    _restoreOriginalSuggestions: function() {
        var container = document.getElementById('chatbot-suggestions');
        container.innerHTML =
            '<button class="chatbot-suggestion" data-q="Give me a full summary">📊 Summary</button>' +
            '<button class="chatbot-suggestion" data-q="Who are the top 5 riskiest agents?">🔥 Top Risk</button>' +
            '<button class="chatbot-suggestion" data-q="Which manager needs the most attention?">👀 Manager Focus</button>' +
            '<button class="chatbot-suggestion" data-q="Show all insights">💡 Insights</button>' +
            '<button class="chatbot-suggestion" data-q="Show anomalies and outliers">⚠️ Anomalies</button>' +
            '<button class="chatbot-suggestion" data-q="Who are the best performing agents?">⭐ Top Performers</button>' +
            '<button class="chatbot-suggestion" data-q="Which agents have issues in multiple areas?">🚨 Multi-Issue</button>' +
            '<button class="chatbot-suggestion" data-q="Show aged cases over 72 hours">⏰ Critical Aging</button>' +
            '<button class="chatbot-suggestion" data-q="Show short calls stats">📞 Short Calls</button>' +
            '<button class="chatbot-suggestion" data-q="Show RONA overview">📱 RONA</button>' +
            '<button class="chatbot-suggestion" data-q="Show email changes analysis">📧 Emails</button>' +
            '<button class="chatbot-suggestion" data-q="Compare all managers">📈 Compare Mgrs</button>' +
            '<button class="chatbot-suggestion" data-q="Show team stats">👥 Team Stats</button>' +
            '<button class="chatbot-suggestion" data-q="Go to short calls tab">🔀 Go To Tab</button>' +
            '<button class="chatbot-suggestion" data-q="Reset filters">🧹 Clear Filters</button>' +
            '<button class="chatbot-suggestion" data-q="Export all data as excel">📥 Download All</button>' +
            '<button class="chatbot-suggestion" data-q="What improvements do you recommend?">🎯 Actions</button>' +
            '<button class="chatbot-suggestion" data-q="What filters are active?">🔍 Active Filters</button>' +
            '<button class="chatbot-suggestion" data-q="Switch to dark mode">🌙 Dark Mode</button>' +
            '<button class="chatbot-suggestion" data-q="Help">❓ Help</button>';
        container.style.display = 'flex';
        var self = this;
        container.querySelectorAll('.chatbot-suggestion').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.getElementById('chatbot-input').value = btn.dataset.q;
                self.sendMessage();
            });
        });
    },

    /**
     * Show contextual suggestion chips based on conversation context
     */
    showContextualSuggestions: function () {
        const container = document.getElementById('chatbot-suggestions');
        const chips = [];

        // Build contextual suggestions based on last context
        if (this.context.lastAgent) {
            const agent = this.context.lastAgent;
            chips.push({ label: `More on ${agent}`, q: `Tell me more about ${agent}` });
            chips.push({ label: `Filter by ${agent}`, q: `Filter by ${agent}` });
            chips.push({ label: `Why risky?`, q: `Why is ${agent} risky?` });
        }
        if (this.context.lastManager) {
            const mgr = this.context.lastManager;
            chips.push({ label: `${mgr}'s team`, q: `Who are the agents under ${mgr}?` });
            chips.push({ label: `Filter ${mgr}`, q: `Filter by manager ${mgr}` });
            chips.push({ label: `${mgr} insights`, q: `Insights for manager ${mgr}` });
        }
        if (this.context.lastTopic) {
            chips.push({ label: 'Drill down', q: 'Drill down' });
            chips.push({ label: 'Tell me more', q: 'Tell me more' });
        }

        // Always add some general suggestions to fill up to ~4-6 chips
        const generalChips = [
            { label: 'Summary', q: 'Give me a full summary' },
            { label: 'Top Risk', q: 'Who are the top 5 riskiest agents?' },
            { label: 'Manager Focus', q: 'Which manager needs the most attention?' },
            { label: 'All Insights', q: 'Show all insights' },
            { label: 'Anomalies', q: 'Show anomalies and outliers' },
            { label: 'Actions', q: 'What improvements do you recommend?' },
            { label: 'Filters', q: 'What filters are active?' },
            { label: 'Reset', q: 'Reset filters' }
        ];

        // Fill remaining slots with general chips (avoid duplicates)
        const usedLabels = new Set(chips.map(c => c.label));
        for (const gc of generalChips) {
            if (chips.length >= 6) break;
            if (!usedLabels.has(gc.label)) {
                chips.push(gc);
                usedLabels.add(gc.label);
            }
        }

        // Render chips
        container.innerHTML = chips.map(c =>
            `<button class="chatbot-suggestion" data-q="${c.q}">${c.label}</button>`
        ).join('');

        // Re-bind click events
        container.querySelectorAll('.chatbot-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('chatbot-input').value = btn.dataset.q;
                this.sendMessage();
            });
        });

        container.style.display = 'flex';
    },

    /**
     * Render all messages to the chat panel
     */
    renderMessages: function () {
        const container = document.getElementById('chatbot-messages');
        let html = '';

        this.messages.forEach((msg) => {
            const timeStr = msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isBot = msg.role === 'bot';
            html += `
                <div class="chatbot-msg ${isBot ? 'chatbot-msg-bot' : 'chatbot-msg-user'} fade-in">
                    ${isBot ? '<div class="chatbot-avatar"><i class="bi bi-robot"></i></div>' : ''}
                    <div class="chatbot-bubble ${isBot ? 'chatbot-bubble-bot' : 'chatbot-bubble-user'}">
                        ${this.formatMessage(msg.text)}
                        <div class="chatbot-time">${timeStr}</div>
                    </div>
                    ${!isBot ? '<div class="chatbot-avatar chatbot-avatar-user"><i class="bi bi-person-fill"></i></div>' : ''}
                </div>
            `;
        });

        if (this.isTyping) {
            html += `
                <div class="chatbot-msg chatbot-msg-bot fade-in">
                    <div class="chatbot-avatar"><i class="bi bi-robot"></i></div>
                    <div class="chatbot-bubble chatbot-bubble-bot">
                        <div class="chatbot-typing">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    },

    /**
     * Format message text (markdown-lite)
     */
    formatMessage: function (text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n- /g, '\n&bull; ')
            .replace(/\n(\d+)\. /g, '\n$1. ')
            .replace(/\n/g, '<br>');
    },

    // ==================== CORE NLU ENGINE ====================

    /**
     * Master response generator
     */
    generateResponse: function (question) {
        const q = question.toLowerCase().trim();

        if (!App.state.dataLoaded) {
            return "It looks like no data has been loaded yet. Please upload a JSON file first, then ask me your questions!";
        }

        const intent = this.detectIntent(q, question);

        try {
            switch (intent.type) {
                case 'greeting': return this.handleGreeting();
                case 'help': return this.handleHelp();
                case 'summary': return this.handleSummary(intent);
                case 'risk_top': return this.handleTopRisk(intent);
                case 'risk_bottom': return this.handleBottomRisk(intent);
                case 'risk_agent': return this.handleAgentRisk(intent);
                case 'risk_level_filter': return this.handleRiskLevelFilter(intent);
                case 'risk_above': return this.handleRiskAbove(intent);
                case 'risk_distribution': return this.handleRiskDistribution();
                case 'agent_info': return this.handleAgentInfo(intent);
                case 'agent_performing': return this.handleAgentPerforming(intent);
                case 'agent_not_performing': return this.handleAgentNotPerforming(intent);
                case 'manager_info': return this.handleManagerInfo(intent);
                case 'manager_focus': return this.handleManagerFocus();
                case 'manager_agents': return this.handleManagerAgents(intent);
                case 'manager_risk': return this.handleManagerRisk(intent);
                case 'manager_worst_agent': return this.handleManagerWorstAgent(intent);
                case 'manager_best_agent': return this.handleManagerBestAgent(intent);
                case 'manager_compare': return this.handleManagerCompare(intent);
                case 'manager_list': return this.handleManagerList();
                case 'critical_cases': return this.handleCriticalCases();
                case 'aged_cases': return this.handleAgedCases(intent);
                case 'aged_by_owner': return this.handleAgedByOwner();
                case 'short_calls': return this.handleShortCalls(intent);
                case 'short_calls_top': return this.handleShortCallsTop(intent);
                case 'short_calls_above': return this.handleShortCallsAbove(intent);
                case 'rona': return this.handleRona(intent);
                case 'rona_top': return this.handleRonaTop(intent);
                case 'email_changes': return this.handleEmailChanges(intent);
                case 'email_suspicious': return this.handleEmailSuspicious();
                case 'email_by_type': return this.handleEmailByType();
                case 'anomalies': return this.handleAnomalies();
                case 'case_record': return this.handleCaseRecord();
                case 'case_record_origin': return this.handleCaseRecordOrigin();
                case 'case_record_by_manager': return this.handleCaseRecordByManager();
                case 'proactive_type': return this.handleProactiveType();
                case 'proactive_by_manager': return this.handleProactiveByManager();
                case 'compare_agents': return this.handleCompareAgents(intent);
                case 'cross_metric': return this.handleCrossMetric(intent);
                case 'team_stats': return this.handleTeamStats();
                case 'improvements': return this.handleImprovements();
                case 'insights_all': return this.handleAllInsights();
                case 'count_query': return this.handleCountQuery(intent);
                case 'percentage_query': return this.handlePercentageQuery(intent);
                case 'date_info': return this.handleDateInfo();
                case 'drilldown': return this.handleDrilldown(intent);
                case 'followup_more': return this.handleFollowupMore();
                case 'followup_who': return this.handleFollowupWho();
                case 'followup_why': return this.handleFollowupWhy();
                case 'list_agents': return this.handleListAgents(intent);
                case 'agent_multi_issues': return this.handleAgentMultiIssues();
                case 'best_agents': return this.handleBestAgents(intent);
                case 'thank': return this.handleThank();
                case 'filter_manager': return this.handleFilterManager(intent);
                case 'filter_agent': return this.handleFilterAgent(intent);
                case 'filter_date': return this.handleFilterDate(intent);
                case 'reset_filter': return this.handleResetFilter();
                case 'navigate_tab': return this.handleNavigateTab(intent);
                case 'export': return this.handleExport(intent);
                case 'insights_manager': return this.handleInsightsForManager(intent);
                case 'insights_agent': return this.handleInsightsForAgent(intent);
                case 'current_filter': return this.handleCurrentFilter();
                case 'agent_metric': return this.handleAgentMetric(intent);
                case 'theme_switch': return this.handleThemeSwitch(intent);
                case 'list_managers': return this.handleManagerList();
                default: return this.handleUnknown(q);
            }
        } catch (e) {
            console.error('Chatbot error:', e);
            return "I encountered an error processing that question. Could you try rephrasing it?";
        }
    },

    /**
     * Intent detection engine - comprehensive pattern matching
     */
    detectIntent: function (q, original) {

        // === Greetings & Thanks ===
        if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|greetings)\b/.test(q)) return { type: 'greeting' };
        if (/^(thanks?|thank\s*you|thx|ty|great|awesome|perfect|nice|cool)\b/.test(q)) return { type: 'thank' };
        if (/^(help|what can you|how do i|what do you|commands|guide|what.*ask)\b/.test(q)) return { type: 'help' };

        // === Date Filter (must be before agent/manager filter to avoid misdetection) ===
        if (/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d{0,2}\s*(?:to|through|till|until|-)\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(q) ||
            /(?:from|select|filter|show|set|date|data)\s.*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d/i.test(q) ||
            /\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\s*(?:to|-)\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/i.test(q)) {
            const dates = this._extractDates(q);
            if (dates.start || dates.end) return { type: 'filter_date', ...dates };
        }

        // === Dashboard Control: Filter, Navigate, Reset, Theme ===
        // Theme switching
        if (/dark\s*mode|night\s*mode|switch\s*to\s*dark|enable\s*dark|go\s*dark/.test(q)) return { type: 'theme_switch', theme: 'dark' };
        if (/light\s*mode|day\s*mode|switch\s*to\s*light|enable\s*light|go\s*light|bright\s*mode/.test(q)) return { type: 'theme_switch', theme: 'light' };

        // List managers
        if (/list\s*(all\s*)?managers|all\s*managers|show\s*managers|how\s*many\s*managers|which\s*managers/.test(q)) return { type: 'list_managers' };

        // Reset / clear filters
        if (/reset|clear\s*(all)?\s*(filter|selection)|remove\s*filter|show\s*all\s*(agent|data|manager)|unfilter|yeet\s*filter/.test(q)) return { type: 'reset_filter' };

        // Current filter status
        if (/current\s*filter|what.*(filter|selected|active)|which\s*(manager|agent)\s*is\s*(selected|filtered|active)/.test(q)) return { type: 'current_filter' };

        // Filter by manager (explicit)
        if (/filter.*(by|for|to)\s*(manager|team)|select\s*manager|switch\s*to\s*manager|show\s*(only|data)\s*(for|of)\s*manager|apply\s*manager/.test(q)) {
            const mgr = this.extractManagerName(q);
            return { type: 'filter_manager', manager: mgr };
        }

        // Filter by agent (explicit)
        if (/filter.*(by|for|to)\s*agent|select\s*agent|switch\s*to\s*agent|show\s*(only|data)\s*(for|of)\s*agent|apply\s*agent/.test(q)) {
            const agent = this.extractAgentName(q);
            return { type: 'filter_agent', agent };
        }

        // "Filter by [name]" - detect whether it's manager or agent
        if (/^filter\s*(by|for|to)?\s+/i.test(q) || /^show\s*(only|data)\s*(for|of)\s+/i.test(q) || /^select\s+/i.test(q)) {
            const mgr = this.extractManagerName(q);
            const agent = this.extractAgentName(q);
            if (mgr) return { type: 'filter_manager', manager: mgr };
            if (agent) return { type: 'filter_agent', agent };
        }

        // Navigate to tabs
        if (/go\s*to|navigate\s*to|switch\s*to.*(tab|section)|show\s*me.*(tab|section)|take\s*me\s*to|open.*(tab|section)/.test(q)) {
            const tab = this._detectTab(q);
            if (tab) return { type: 'navigate_tab', tab };
        }

        // Insights for specific manager
        if (/insight.*(for|of|under)\s*(manager)?|manager.*insight/.test(q)) {
            const mgr = this.extractManagerName(q);
            if (mgr) return { type: 'insights_manager', manager: mgr };
        }

        // Insights for specific agent
        if (/insight.*(for|of|about)\s*(agent)?|agent.*insight/.test(q)) {
            const agent = this.extractAgentName(q);
            if (agent) return { type: 'insights_agent', agent };
        }

        // === Follow-up & Drill-down (context-aware) ===
        // Only match very short/vague follow-ups, not full questions with specific keywords
        if (/^(tell me more|more details|more info|elaborate|expand|go deeper|explain more|can you explain)\s*[?.!]?\s*$/i.test(q)) return { type: 'followup_more' };
        if (/^(who|which\s*(agents?|persons?|ones?))\s*[?.!]?\s*$/i.test(q) && this.context.lastResults) return { type: 'followup_who' };
        if (/^(why|why\s*is\s*that|reason|cause)\s*[?.!]?\s*$/i.test(q) && this.context.lastAgent) return { type: 'followup_why' };
        if (/^(drill\s*down|deep\s*dive|break\s*(it\s*)?down)\s*[?.!]?\s*$/i.test(q) && this.context.lastTopic) return { type: 'drilldown', topic: this.context.lastTopic };

        // === Date / Time Info ===
        if (/when.*(last|data|update|refresh)|date range|data period|how old.*(data)|last record/.test(q)) return { type: 'date_info' };

        // === Export / Download ===
        if (/download|export|csv|save.*data|get.*csv|extract.*data|dump.*data/.test(q)) {
            if (/all|every|entire|full|complete|everything/.test(q)) return { type: 'export', tab: 'all' };
            if (/short\s*call/.test(q)) return { type: 'export', tab: 'shortCalls' };
            if (/\brona\b/.test(q)) return { type: 'export', tab: 'rona' };
            if (/email/.test(q)) return { type: 'export', tab: 'emailChanges' };
            if (/aged?\s*(case|48)|48\s*h/.test(q)) return { type: 'export', tab: 'age48' };
            if (/case\s*record/.test(q)) return { type: 'export', tab: 'caseRecord' };
            if (/cases?\s*report/.test(q)) return { type: 'export', tab: 'casesReport' };
            if (/proactive/.test(q)) return { type: 'export', tab: 'proactive' };
            return { type: 'export', tab: 'current' };
        }

        // === Summary / Overview (with manager/agent context) ===
        // First check if "overview" is paired with a specific metric - route to that metric instead
        if (/summary|overview|dashboard|overall|everything|report|status|how.*(things|team|doing|going|look)|big picture|snapshot|brief|quick\s*look|run\s*down/.test(q)) {
            if (/short\s*call/.test(q)) return { type: 'short_calls' };
            if (/\brona\b/.test(q)) return { type: 'rona' };
            if (/email/.test(q)) return { type: 'email_changes' };
            if (/aged?\s*case|48/.test(q)) return { type: 'aged_cases' };
            if (/case\s*record/.test(q)) return { type: 'case_record' };
            if (/proactive/.test(q)) return { type: 'proactive_type' };
            if (/anomal|outlier/.test(q)) return { type: 'anomalies' };
            if (/risk/.test(q)) return { type: 'risk_distribution' };

            if (/(?:summary|overview|report|status|insight)\s*(?:for|of|under|about)\s+/i.test(q)) {
                const mgr = this.extractManagerName(q);
                const agent = this.extractAgentName(q);
                if (mgr) return { type: 'insights_manager', manager: mgr };
                if (agent) return { type: 'insights_agent', agent };
            }

            var dateRange = this._extractDateRange(q);
            if (dateRange) return { type: 'summary', dateRange: dateRange };
            return { type: 'summary' };
        }

        // === All Insights ===
        if (/all\s*insight|every\s*insight|show\s*insight|list\s*insight|what.*(insight|finding)/.test(q)) return { type: 'insights_all' };

        // === Compare Agents ===
        if (/compare|versus|vs\b|difference between|side.*(by|to).*side/.test(q)) {
            const agents = this.extractMultipleAgentNames(q);
            if (agents.length >= 2) return { type: 'compare_agents', agents };
            const managers = this.extractMultipleManagerNames(q);
            if (managers.length >= 2) return { type: 'manager_compare', managers };
        }

        // === Cross-metric / Multi-issue agents ===
        if (/both.*(high|bad|poor)|multiple.*(issue|problem|metric|area)|agents?.*(issue|problem|flag).*multiple|multi/i.test(q)) return { type: 'agent_multi_issues' };
        if (/(high|bad).*(short call|rona|email|aged).*(and|&).*(short call|rona|email|aged)/i.test(q)) {
            const metrics = [];
            if (/short\s*call/i.test(q)) metrics.push('shortCalls');
            if (/rona/i.test(q)) metrics.push('rona');
            if (/email/i.test(q)) metrics.push('email');
            if (/aged?|48/i.test(q)) metrics.push('aged');
            return { type: 'cross_metric', metrics };
        }

        // === Manager-specific queries (MUST be checked before generic agent queries) ===
        // "under manager X" / "manager X's team" / "for manager X"
        const managerInQ = this.extractManagerName(q);

        if (managerInQ) {
            // "Filter dashboard by manager X" / "show dashboard for manager X"
            if (/filter|select|switch|apply|set\s*to|change\s*to|show\s*(only|dashboard)/.test(q)) {
                return { type: 'filter_manager', manager: managerInQ };
            }
            // "Insights for manager X" / "manager X insights"
            if (/insight|finding|observation/.test(q)) {
                return { type: 'insights_manager', manager: managerInQ };
            }
            // "Under manager X, who is at most risk / not performing / worst agent"
            if (/who.*(risk|worst|concern|not\s*perform|poor|bad|flag|critical|attention|high)|worst\s*agent|riskiest|not\s*perform|poor\s*perform|underperform/.test(q)) {
                return { type: 'manager_worst_agent', manager: managerInQ };
            }
            // "Under manager X, who is best / good / performing well"
            if (/who.*(best|good|well|top\s*perform|low\s*risk|star)|best\s*agent|top\s*perform|star\s*perform/.test(q)) {
                return { type: 'manager_best_agent', manager: managerInQ };
            }
            // "How many agents under manager X" / "who are the agents under manager X" / "list agents"
            if (/how\s*many\s*agent|who\s*are|list\s*agent|agents?\s*(under|of|in|for)|team\s*(member|composition|size)/.test(q)) {
                return { type: 'manager_agents', manager: managerInQ };
            }
            // "Manager X short calls" / "manager X rona" / "manager X email changes"
            if (/short\s*call/.test(q)) return { type: 'manager_risk', manager: managerInQ, metric: 'shortCalls' };
            if (/rona/.test(q)) return { type: 'manager_risk', manager: managerInQ, metric: 'rona' };
            if (/email/.test(q)) return { type: 'manager_risk', manager: managerInQ, metric: 'email' };
            if (/aged?\s*case|48/.test(q)) return { type: 'manager_risk', manager: managerInQ, metric: 'aged' };
            // "Manager X risk" / "risk under manager X" / "manager X performance"
            if (/risk|perform|stat|metric|detail|data|info|score|how|overview/.test(q)) {
                return { type: 'manager_risk', manager: managerInQ };
            }
            // Generic manager info
            return { type: 'manager_info', manager: managerInQ };
        }

        // === Manager Focus / Which manager ===
        if (/which\s*manager.*(worst|risk|attention|concern|focus|bad|issue|problem|poor)|manager.*(focus|attention|concern|worst|issue|problem|need|require)|worst\s*manager|manager.*need/.test(q)) return { type: 'manager_focus' };
        if (/list.*manager|all\s*manager|show.*manager|how\s*many\s*manager/.test(q)) return { type: 'manager_list' };

        // === Agent not performing / performing well ===
        if (/not\s*perform|under\s*perform|poor\s*perform|bad\s*perform|worst\s*perform|low\s*perform|struggling|failing/.test(q)) {
            const agent = this.extractAgentName(q);
            return { type: 'agent_not_performing', agent };
        }
        if (/best\s*perform|top\s*perform|star\s*perform|good\s*perform|well\s*perform|excellent/.test(q)) {
            const agent = this.extractAgentName(q);
            return { type: 'best_agents', count: this.extractNumber(q) || 5 };
        }

        // === Risk queries ===
        if (/(top|highest|worst|most|riskiest).*(risk|agent|score|dangerous|concern)|risk.*(top|highest|worst|most|leader|rank|board)|who.*(risk|concern|attention|watch|flag|worst)/.test(q)) {
            return { type: 'risk_top', count: this.extractNumber(q) || 5 };
        }
        if (/(bottom|lowest|least|safest|best).*(risk|score|agent)/.test(q)) {
            return { type: 'risk_bottom', count: this.extractNumber(q) || 5 };
        }
        if (/risk\s*score.*(above|over|greater|more\s*than|higher\s*than|exceed|\>)\s*(\d+)/.test(q) || /above\s*(\d+).*risk|score.*(above|over)\s*(\d+)/.test(q)) {
            const num = this.extractNumber(q) || 50;
            return { type: 'risk_above', threshold: num };
        }
        if (/(how\s*many|count|number).*(critical|high\s*risk|medium|low\s*risk)/.test(q) || /critical.*how\s*many|how\s*many.*critical/.test(q)) {
            return { type: 'count_query', subject: 'risk' };
        }
        if (/(percent|proportion|ratio|distribution).*(risk|critical|high|agent)/.test(q) || /(risk|agent).*(percent|proportion|distribution|breakdown)/.test(q)) {
            return { type: 'risk_distribution' };
        }
        if (/\b(critical|high)\s*risk\s*(agent|list|who)|agents?\s*at\s*(critical|high)/.test(q)) {
            const level = /critical/.test(q) ? 'Critical' : 'High';
            return { type: 'risk_level_filter', level };
        }

        // === Short Calls queries ===
        if (/(top|highest|worst|most).*(short\s*call)|short\s*call.*(top|highest|worst|most|rank|leader)/.test(q)) {
            return { type: 'short_calls_top', count: this.extractNumber(q) || 5 };
        }
        if (/short\s*call.*(above|over|more\s*than|greater|exceed|\>)\s*(\d+)/.test(q)) {
            return { type: 'short_calls_above', threshold: this.extractNumber(q) || 50 };
        }
        if (/short\s*call|short-call|shortcall|low.*(call|duration)/.test(q)) {
            const agent = this.extractAgentName(q);
            return { type: 'short_calls', agent };
        }

        // === RONA queries ===
        if (/(top|highest|worst|most).*(rona)|rona.*(top|highest|worst|most|rank)/.test(q)) {
            return { type: 'rona_top', count: this.extractNumber(q) || 5 };
        }
        if (/\brona\b|ring.*(no|not).*(answer)/.test(q)) {
            const agent = this.extractAgentName(q);
            return { type: 'rona', agent };
        }

        // === Email queries ===
        if (/suspicious|punctuation|minor.*(edit|change)|intentional.*(email|change)/.test(q)) return { type: 'email_suspicious' };
        if (/email.*(type|category|breakdown|kind)|type.*(email|change)/.test(q)) return { type: 'email_by_type' };
        if (/email.*(change|modif|edit|alter)|change.*email/.test(q)) {
            const agent = this.extractAgentName(q);
            return { type: 'email_changes', agent };
        }

        // === Case Record queries ===
        if (/origin.*(case|record|most|distrib)|case.*origin|by\s*origin|which\s*origin/.test(q)) return { type: 'case_record_origin' };
        if (/case\s*record.*(manager|by\s*manager)|manager.*(case\s*record)/.test(q)) return { type: 'case_record_by_manager' };
        if (/case\s*record|record\s*type|case\s*type|incident|case\s*distribut/.test(q)) return { type: 'case_record' };

        // === Proactive Type queries ===
        if (/proactive.*(manager|by\s*manager)|manager.*(proactive)/.test(q)) return { type: 'proactive_by_manager' };
        if (/proactive|social\s*media.*internal|internal.*social/.test(q)) return { type: 'proactive_type' };

        // === Aged Cases queries ===
        if (/critical.*(case|aged|old|hour)|case.*critical|over\s*96/.test(q)) return { type: 'critical_cases' };
        if (/aged?\s*(case|by|per).*(owner|agent)|who.*(most|highest).*(aged|old|pending|backlog)|case.*owner|backlog/.test(q)) return { type: 'aged_by_owner' };
        if (/aged?\s*case|48.*(hour|hr)|old\s*case|pending\s*case|overdue|backlog|case\s*age/.test(q)) {
            return { type: 'aged_cases', threshold: this.extractNumber(q) };
        }

        // === Anomalies ===
        if (/anomal|outlier|unusual|suspicious|abnormal|irregular|flag|deviat/.test(q)) return { type: 'anomalies' };

        // === Count & Percentage queries ===
        if (/(how\s*many|count|number|total)\s*(agent|manager|case|record)/.test(q)) {
            return { type: 'count_query', subject: q };
        }
        if (/(percent|proportion|ratio)/.test(q)) {
            return { type: 'percentage_query', subject: q };
        }

        // === Team Stats ===
        if (/team.*(stat|average|mean|perf)|average|mean|total\s*(agent|count)|overall.*(metric|stat)/.test(q)) return { type: 'team_stats' };

        // === Improvements / Recommendations ===
        if (/improve|recommend|suggest|action|what\s*should|coaching|training|next\s*step|plan|remediat/.test(q)) return { type: 'improvements' };

        // === List agents ===
        if (/list\s*(all\s*)?(agent|member)|all\s*agent|show.*(agent|member)/.test(q)) {
            return { type: 'list_agents', manager: this.extractManagerName(q) };
        }

        // === Agent-specific metric query (e.g. "how many RONA does X have for Jan?") ===
        if (/how\s*many|count.*for|total.*for|what.*(rona|short|email|aged|case).*(?:does|for|of|has)|(?:rona|short|email|aged)\s*(?:calls?|count)?\s*(?:for|of|does)\s*/i.test(q)) {
            var agent = this.extractAgentName(q);
            if (agent) {
                var metric = null;
                if (/rona/i.test(q)) metric = 'rona';
                else if (/short\s*call/i.test(q)) metric = 'shortCalls';
                else if (/email/i.test(q)) metric = 'emailChanges';
                else if (/aged|age\s*48|old\s*case/i.test(q)) metric = 'agedCases';
                else if (/case/i.test(q)) metric = 'cases';
                if (metric) return { type: 'agent_metric', agent: agent, metric: metric };
            }
        }

        // === Specific agent info ===
        if (/tell\s*me\s*about|info\s*(on|about|for)|details?\s*(on|about|for)|how\s*is\s*.*(doing|performing)|profile|everything.*(about|on)/.test(q)) {
            const agent = this.extractAgentName(q);
            if (agent) return { type: 'agent_info', agent };
        }

        // === Agent risk score query ===
        if (/risk.*(score|level)?\s*(of|for)|score\s*(of|for)/.test(q)) {
            const agent = this.extractAgentName(q);
            if (agent) return { type: 'risk_agent', agent };
        }

        // === Simple keyword catch-all (single words or short phrases) ===
        if (/^risk(s|y|iest)?\s*$/i.test(q) || /^risk\s*(score|level|analysis|report|overview|data)?\s*$/i.test(q)) {
            return { type: 'risk_top', count: 5 };
        }
        if (/^short\s*call(s)?\s*$/i.test(q)) {
            return { type: 'short_calls', count: 5 };
        }
        if (/^rona\s*$/i.test(q)) {
            return { type: 'rona', count: 5 };
        }
        if (/^email(s)?\s*(change)?s?\s*$/i.test(q)) {
            return { type: 'email_changes', count: 5 };
        }
        if (/^aged?\s*(case)?s?\s*$/i.test(q) || /^aging\s*$/i.test(q)) {
            return { type: 'aged_cases' };
        }
        if (/^critical\s*(case)?s?\s*$/i.test(q)) {
            return { type: 'critical_cases' };
        }
        if (/^anomal(y|ies)?\s*$/i.test(q) || /^outlier(s)?\s*$/i.test(q)) {
            return { type: 'anomalies' };
        }
        if (/^insight(s)?\s*$/i.test(q)) {
            return { type: 'insights_all' };
        }
        if (/^manager(s)?\s*$/i.test(q)) {
            return { type: 'manager_list' };
        }
        if (/^agent(s)?\s*$/i.test(q)) {
            return { type: 'list_agents', count: 10 };
        }
        if (/^action(s)?\s*$/i.test(q) || /^recommend(ation)?s?\s*$/i.test(q) || /^improve(ment)?s?\s*$/i.test(q)) {
            return { type: 'improvements' };
        }
        if (/^stat(s|istics)?\s*$/i.test(q) || /^metric(s)?\s*$/i.test(q)) {
            return { type: 'team_stats' };
        }
        if (/^case\s*record(s)?\s*$/i.test(q)) {
            return { type: 'case_record' };
        }
        if (/^proactive\s*$/i.test(q)) {
            return { type: 'proactive_type' };
        }
        if (/^filter(s)?\s*$/i.test(q)) {
            return { type: 'current_filter' };
        }

        // === Fallback: check for agent name in question ===
        const fallbackAgent = this.extractAgentName(q);
        if (fallbackAgent) return { type: 'agent_info', agent: fallbackAgent };

        // === Fallback: check for manager name ===
        const fallbackManager = this.extractManagerName(q);
        if (fallbackManager) return { type: 'manager_info', manager: fallbackManager };

        return { type: 'unknown' };
    },

    // ==================== INTENT HANDLERS ====================

    handleGreeting: function () {
        const greetings = [
            "Hello! How can I help you with the dashboard today? Ask me anything about agents, managers, risk scores, or performance metrics.",
            "Hi there! I'm ready to help. You can ask about risk scores, specific agents or managers, anomalies, or any metric on the dashboard.",
            "Hey! What would you like to know? I can analyze any aspect of your agent performance data."
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    },

    handleThank: function () {
        const responses = [
            "You're welcome! Let me know if you have more questions.",
            "Happy to help! Feel free to ask anything else.",
            "Anytime! I'm here whenever you need more insights."
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    },

    handleHelp: function () {
        return `Here's everything I can do — I control the full dashboard:

**🎛️ Dashboard Control**
- "Filter by manager [name]" — filters entire dashboard
- "Filter by agent [name]" — filters entire dashboard
- "Filter by date Jan 2026" / "Show data from 01/01 to 01/31"
- "Reset filters" / "Clear all" / "No Cap filters"
- "What filters are active?"
- "List all managers"

**🔀 Navigation**
- "Go to short calls tab" / "Open RONA" / "Show email changes"
- "Switch to proactive" / "Take me to aged cases"

**🎨 Theme**
- "Dark mode" / "Light mode" / "Night mode"

**🔥 Risk Analysis**
- "Top 5 riskiest agents" / "Bottom 5 safest"
- "Risk score above 50" / "How many critical agents?"
- "Best performing agents" / "Risk distribution"

**👤 Agent Deep-Dive**
- "Tell me about [agent name]"
- "Insights for [agent name]"
- "Compare [agent A] and [agent B]"
- "Multi-issue agents" / "Agents flagged in 3+ areas"

**👔 Manager Analysis**
- "Which manager needs the most attention?"
- "Agents under manager X" / "Manager X's worst agent"
- "Compare manager X and Y" / "Manager risk ranking"

**📊 Metrics**
- "Short calls stats" / "RONA overview" / "Email changes"
- "Proactive type breakdown" / "Case record distribution"
- "Suspicious email changes" / "Team stats"

**⏰ Cases & Aging**
- "Critical cases" / "Aged cases over 72 hours"
- "Who has the most aged cases?" / "Aged by owner"

**💡 Insights & Actions**
- "Full summary" / "All insights" / "Anomalies"
- "Insights for manager X" / "What should we improve?"

**📥 Export & Download**
- "Download all data as Excel" / "Export short calls CSV"
- "Download RONA" / "Export everything"

**💬 Follow-ups**
- "Tell me more" / "Why?" / "Drill down" / "Who?"`;
    },

    // === SUMMARY ===
    handleSummary: function (intent) {
        var dateRange = intent && intent.dateRange;
        var data, analysis, riskData;

        if (dateRange && App.state.isJsonSource && App.state.rawJsonData) {
            var reparsed = JsonDataLoader.parse(App.state.rawJsonData, dateRange.start, dateRange.end);
            var tempData = {
                caseRecordType: reparsed.caseRecordType,
                proactiveType: reparsed.proactiveType,
                age48hrs: reparsed.age48hrs,
                emailChanges: reparsed.emailChanges,
                shortCalls: reparsed.shortCalls,
                ronaTrend: reparsed.ronaTrend
            };
            data = tempData;
            analysis = Analytics.analyze(data);
            riskData = Analytics.calculateAgentRiskScores(data);
        } else {
            riskData = this._getRiskData();
            if (!riskData) return "No risk data available. Please load data first.";
            data = App.currentData;
            analysis = App.currentAnalysis;
        }

        const totalAgents = riskData.rankings.length;
        const managerStats = DataParser.getManagerStats(data);

        let r = dateRange
            ? `**Summary for ${dateRange.label}**\n\n`
            : `**Dashboard Summary**\n\n`;
        r += `**Agents & Risk:**\n`;
        r += `- Total Agents: **${totalAgents}**\n`;
        r += `- Critical Risk: **${riskData.counts.critical}** | High: **${riskData.counts.high}** | Medium: **${riskData.counts.medium}** | Low: **${riskData.counts.low}**\n`;
        if (totalAgents > 0) {
            const avgRisk = (riskData.rankings.reduce((s, x) => s + x.riskScore, 0) / totalAgents).toFixed(1);
            r += `- Average Risk Score: **${avgRisk}**\n`;
        }

        const caseCount = (data.caseRecordType?.length || 0);
        const shortCallsTotal = data.shortCalls?.reduce((s, r) => s + r.count, 0) || 0;
        const ronaTotal = data.ronaTrend?.reduce((s, r) => s + r.rona, 0) || 0;
        const emailCount = data.emailChanges?.length || 0;
        const over48 = data.age48hrs?.filter(r => r.age > 48).length || 0;

        r += `\n**Data Counts:**\n`;
        r += `- Case Records: **${caseCount.toLocaleString()}**\n`;
        r += `- Short Calls Total: **${shortCallsTotal.toLocaleString()}**\n`;
        r += `- RONA Total: **${ronaTotal.toLocaleString()}**\n`;
        r += `- Email Changes: **${emailCount.toLocaleString()}**\n`;
        r += `- Aged Cases (48hrs+): **${over48}**\n`;

        r += `\n**Managers:** ${managerStats.length} total\n`;
        const highFocusMgrs = managerStats.filter(m => m.focusLevel === 'High');
        if (highFocusMgrs.length > 0) {
            r += `- High Focus: ${highFocusMgrs.map(m => `**${m.manager}**`).join(', ')}\n`;
        }

        if (analysis?.anomalies?.length > 0) {
            r += `\n**Anomalies:** ${analysis.anomalies.length} detected (${analysis.anomalies.filter(a => a.severity === 'high').length} high severity)\n`;
        }

        if (riskData.counts.critical + riskData.counts.high > 0) {
            r += `\n**Action Required:** ${riskData.counts.critical + riskData.counts.high} agents need immediate attention.`;
        } else {
            r += `\n**Status:** All agents are within acceptable risk levels.`;
        }

        this.context.lastTopic = 'summary';
        return r;
    },

    // === RISK QUERIES ===
    handleTopRisk: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const count = Math.min(intent.count || 5, riskData.rankings.length);
        const top = riskData.rankings.slice(0, count);

        let r = `**Top ${count} Riskiest Agents:**\n\n`;
        top.forEach((a, i) => {
            r += `**${i + 1}. ${a.agent}** - Score: **${a.riskScore}** (${a.riskLevel})\n`;
            r += `   Short Calls: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n\n`;
        });

        this.context.lastTopic = 'risk';
        this.context.lastAgentList = top;
        this.context.lastResults = top;
        return r;
    },

    handleBottomRisk: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const count = Math.min(intent.count || 5, riskData.rankings.length);
        const bottom = [...riskData.rankings].reverse().slice(0, count);

        let r = `**${count} Lowest Risk Agents (Best Performing):**\n\n`;
        bottom.forEach((a, i) => {
            r += `**${i + 1}. ${a.agent}** - Score: **${a.riskScore}** (${a.riskLevel})\n`;
            r += `   Short Calls: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n\n`;
        });

        this.context.lastTopic = 'risk';
        this.context.lastAgentList = bottom;
        return r;
    },

    handleRiskAbove: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const threshold = intent.threshold || 50;
        const filtered = riskData.rankings.filter(a => a.riskScore >= threshold);

        if (filtered.length === 0) return `No agents have a risk score above ${threshold}.`;

        let r = `**Agents with Risk Score >= ${threshold}:** (${filtered.length} found)\n\n`;
        filtered.forEach((a, i) => {
            r += `${i + 1}. **${a.agent}** - Score: **${a.riskScore}** (${a.riskLevel}) | SC: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n`;
        });

        this.context.lastTopic = 'risk';
        this.context.lastAgentList = filtered;
        this.context.lastResults = filtered;
        return r;
    },

    handleRiskLevelFilter: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const level = intent.level || 'Critical';
        const filtered = riskData.rankings.filter(a => a.riskLevel === level);

        if (filtered.length === 0) return `No agents at ${level} risk level.`;

        let r = `**${level} Risk Agents:** (${filtered.length})\n\n`;
        filtered.forEach((a, i) => {
            const mgr = this._getAgentManager(a.agent);
            r += `${i + 1}. **${a.agent}** - Score: ${a.riskScore} | Manager: ${mgr}\n`;
            r += `   SC: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n\n`;
        });

        this.context.lastAgentList = filtered;
        this.context.lastResults = filtered;
        return r;
    },

    handleRiskDistribution: function () {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const total = riskData.rankings.length;
        const c = riskData.counts;
        const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : '0';

        let r = `**Risk Distribution:**\n\n`;
        r += `- Critical: **${c.critical}** agents (${pct(c.critical)}%)\n`;
        r += `- High: **${c.high}** agents (${pct(c.high)}%)\n`;
        r += `- Medium: **${c.medium}** agents (${pct(c.medium)}%)\n`;
        r += `- Low: **${c.low}** agents (${pct(c.low)}%)\n\n`;
        r += `Total: **${total}** agents`;

        this.context.lastTopic = 'risk';
        return r;
    },

    handleAgentRisk: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();
        const match = this._findAgent(intent.agent);
        if (!match) return this._agentNotFound(intent.agent);

        this.context.lastAgent = match.agent;
        this.context.lastTopic = 'risk';

        let r = `**Risk Score for ${match.agent}:**\n\n`;
        r += `- Risk Score: **${match.riskScore}** (${match.riskLevel})\n`;
        r += `- Rank: **#${match.originalRank}** out of ${riskData.rankings.length}\n`;
        r += `- Short Calls: ${match.shortCalls}\n`;
        r += `- RONA: ${match.rona}\n`;
        r += `- Email Changes: ${match.emailChanges}\n`;
        r += `- Aged Cases: ${match.agedCases}\n\n`;
        r += `Ask "tell me more" for a full profile.`;
        return r;
    },

    // === AGENT QUERIES ===
    handleAgentInfo: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();
        const match = this._findAgent(intent.agent);
        if (!match) return this._agentNotFound(intent.agent);

        this.context.lastAgent = match.agent;
        this.context.lastTopic = 'agent';

        const mgr = this._getAgentManager(match.agent);
        const analysis = App.currentAnalysis;
        const data = App.currentData;

        let r = `**Full Agent Profile: ${match.agent}**\n\n`;
        r += `**Risk Assessment:**\n`;
        r += `- Risk Score: **${match.riskScore}** (${match.riskLevel})\n`;
        r += `- Rank: #${match.originalRank} of ${riskData.rankings.length}\n`;
        r += `- Manager: **${mgr}**\n\n`;

        r += `**Metric Breakdown:**\n`;
        r += `- Short Calls: **${match.shortCalls}**`;
        if (analysis?.shortCalls?.stats) r += ` (team avg: ${analysis.shortCalls.stats.mean.toFixed(0)})`;
        r += `\n`;

        r += `- RONA: **${match.rona}**`;
        if (analysis?.ronaTrend?.stats) r += ` (team avg: ${analysis.ronaTrend.stats.mean.toFixed(1)})`;
        r += `\n`;

        r += `- Email Changes: **${match.emailChanges}**`;
        if (analysis?.emailChanges?.stats) r += ` (team avg: ${analysis.emailChanges.stats.mean.toFixed(1)})`;
        r += `\n`;

        r += `- Aged Cases: **${match.agedCases}**\n\n`;

        // Determine strengths and weaknesses
        const metrics = [
            { name: 'Short Calls', value: match.shortCalls, avg: analysis?.shortCalls?.stats?.mean || 0 },
            { name: 'RONA', value: match.rona, avg: analysis?.ronaTrend?.stats?.mean || 0 },
            { name: 'Email Changes', value: match.emailChanges, avg: analysis?.emailChanges?.stats?.mean || 0 },
            { name: 'Aged Cases', value: match.agedCases, avg: 0 }
        ];
        const aboveAvg = metrics.filter(m => m.avg > 0 && m.value > m.avg * 1.5);
        const belowAvg = metrics.filter(m => m.avg > 0 && m.value < m.avg * 0.5);

        if (aboveAvg.length > 0) {
            r += `**Concerns:** ${aboveAvg.map(m => `${m.name} (${(m.value / m.avg).toFixed(1)}x avg)`).join(', ')}\n`;
        }
        if (belowAvg.length > 0) {
            r += `**Strengths:** ${belowAvg.map(m => m.name).join(', ')} are well below average\n`;
        }
        if (aboveAvg.length === 0 && match.riskLevel === 'Low') {
            r += `**Status:** This agent is performing well across all metrics!`;
        }

        // Case record type breakdown
        if (data?.caseRecordType) {
            const agentCases = data.caseRecordType.filter(c => c.caseOwner && c.caseOwner.toUpperCase().trim() === match.agent.toUpperCase().trim());
            if (agentCases.length > 0) {
                const typeCounts = {};
                agentCases.forEach(c => {
                    const t = c.recordType || 'Unknown';
                    typeCounts[t] = (typeCounts[t] || 0) + 1;
                });
                r += `\n**Case Record Types:** (${agentCases.length} total)\n`;
                Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
                    r += `- ${type}: **${count}**\n`;
                });
            }
        }

        // Check for aged case details
        if (match.agedCases > 0 && data?.age48hrs) {
            const agentCases = data.age48hrs.filter(c => c.caseOwner && c.caseOwner.toUpperCase().trim() === match.agent.toUpperCase().trim());
            if (agentCases.length > 0) {
                r += `\n\n**Aged Cases Detail:**\n`;
                agentCases.sort((a, b) => b.age - a.age).slice(0, 5).forEach(c => {
                    r += `- Case ${c.caseNumber}: ${c.age.toFixed(0)} hrs (${c.status})\n`;
                });
            }
        }

        this.context.lastResults = match;
        return r;
    },

    handleAgentPerforming: function (intent) {
        if (intent.agent) {
            return this.handleAgentInfo(intent);
        }
        return this.handleBestAgents({ count: 5 });
    },

    handleAgentNotPerforming: function (intent) {
        if (intent.agent) {
            return this.handleAgentInfo(intent);
        }
        return this.handleTopRisk({ count: 5 });
    },

    handleBestAgents: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const count = Math.min(intent.count || 5, riskData.rankings.length);
        const best = [...riskData.rankings].reverse().slice(0, count);

        let r = `**Top ${count} Best Performing Agents (Lowest Risk):**\n\n`;
        best.forEach((a, i) => {
            const mgr = this._getAgentManager(a.agent);
            r += `**${i + 1}. ${a.agent}** - Score: **${a.riskScore}** (${a.riskLevel}) | Manager: ${mgr}\n`;
        });

        this.context.lastAgentList = best;
        return r;
    },

    handleAgentMultiIssues: function () {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const multiIssue = riskData.rankings.filter(a => {
            let issues = 0;
            if (a.shortCalls > 0) issues++;
            if (a.rona > 0) issues++;
            if (a.emailChanges > 0) issues++;
            if (a.agedCases > 0) issues++;
            return issues >= 3;
        });

        if (multiIssue.length === 0) return "No agents have issues across 3 or more metric areas.";

        let r = `**Agents with Issues in Multiple Areas (3+):** (${multiIssue.length})\n\n`;
        multiIssue.forEach((a, i) => {
            const areas = [];
            if (a.shortCalls > 0) areas.push(`Short Calls: ${a.shortCalls}`);
            if (a.rona > 0) areas.push(`RONA: ${a.rona}`);
            if (a.emailChanges > 0) areas.push(`Email: ${a.emailChanges}`);
            if (a.agedCases > 0) areas.push(`Aged: ${a.agedCases}`);
            r += `**${i + 1}. ${a.agent}** (Score: ${a.riskScore}, ${a.riskLevel})\n`;
            r += `   ${areas.join(' | ')}\n\n`;
        });

        this.context.lastAgentList = multiIssue;
        return r;
    },

    handleCrossMetric: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const metrics = intent.metrics || [];
        const filtered = riskData.rankings.filter(a => {
            return metrics.every(m => {
                if (m === 'shortCalls') return a.shortCalls > 0;
                if (m === 'rona') return a.rona > 0;
                if (m === 'email') return a.emailChanges > 0;
                if (m === 'aged') return a.agedCases > 0;
                return false;
            });
        });

        const metricNames = metrics.map(m => ({ shortCalls: 'Short Calls', rona: 'RONA', email: 'Email Changes', aged: 'Aged Cases' }[m])).join(' AND ');

        if (filtered.length === 0) return `No agents have high values in both ${metricNames}.`;

        let r = `**Agents with high ${metricNames}:** (${filtered.length})\n\n`;
        filtered.sort((a, b) => b.riskScore - a.riskScore).slice(0, 10).forEach((a, i) => {
            r += `${i + 1}. **${a.agent}** - Score: ${a.riskScore} | SC: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n`;
        });

        this.context.lastAgentList = filtered;
        return r;
    },

    // === MANAGER QUERIES ===
    handleManagerFocus: function () {
        const managerStats = DataParser.getManagerStats();
        if (!managerStats.length) return "No manager data available.";

        let r = `**Managers Ranked by Focus Priority:**\n\n`;
        managerStats.forEach((m, i) => {
            const emoji = m.focusLevel === 'High' ? '!!' : m.focusLevel === 'Medium' ? '!' : '';
            r += `**${i + 1}. ${m.manager}** ${emoji ? `(${m.focusLevel} Priority)` : `(${m.focusLevel})`}\n`;
            r += `   Agents: ${m.agentCount} | Aged: ${m.agedCases} | Short Calls: ${m.shortCalls} | RONA: ${m.rona} | Email: ${m.emailChanges}\n\n`;
        });

        if (managerStats[0].focusLevel === 'High') {
            r += `\n**Recommendation:** ${managerStats[0].manager}'s team needs immediate attention.`;
        }

        this.context.lastTopic = 'manager';
        return r;
    },

    handleManagerList: function () {
        const managerStats = DataParser.getManagerStats();
        if (!managerStats.length) return "No manager data available.";

        let r = `**All Managers:** (${managerStats.length})\n\n`;
        managerStats.forEach((m, i) => {
            r += `${i + 1}. **${m.manager}** - ${m.agentCount} agents | Focus: ${m.focusLevel}\n`;
        });
        return r;
    },

    handleManagerInfo: function (intent) {
        const match = this._findManager(intent.manager);
        if (!match) return this._managerNotFound(intent.manager);

        this.context.lastManager = match.manager;
        this.context.lastTopic = 'manager';

        let r = `**Manager Profile: ${match.manager}**\n\n`;
        r += `- Agents: **${match.agentCount}** (${match.agents.join(', ')})\n`;
        r += `- Focus Level: **${match.focusLevel}** (Score: ${match.focusScore})\n\n`;
        r += `**Team Metrics:**\n`;
        r += `- Aged Cases: **${match.agedCases}** (${match.criticalAgedCases} critical)\n`;
        r += `- Short Calls: **${match.shortCalls}**\n`;
        r += `- RONA: **${match.rona}**\n`;
        r += `- Email Changes: **${match.emailChanges}**\n`;

        // Show risk breakdown of agents under this manager
        const riskData = this._getRiskData();
        if (riskData) {
            const agentSet = new Set(match.agents.map(a => a.toUpperCase().trim()));
            const teamRisk = riskData.rankings.filter(a => agentSet.has(a.agent.toUpperCase().trim()));

            if (teamRisk.length > 0) {
                r += `\n**Agent Risk Breakdown:**\n`;
                teamRisk.sort((a, b) => b.riskScore - a.riskScore).forEach(a => {
                    r += `- ${a.agent}: Score **${a.riskScore}** (${a.riskLevel})\n`;
                });
            }
        }

        r += `\n**Actions:** Say "filter by ${match.manager}" to apply on dashboard, or "insights for ${match.manager}" for detailed findings.`;

        this.context.lastResults = match;
        return r;
    },

    handleManagerAgents: function (intent) {
        const match = this._findManager(intent.manager);
        if (!match) return this._managerNotFound(intent.manager);

        this.context.lastManager = match.manager;

        const riskData = this._getRiskData();
        const agentSet = new Set(match.agents.map(a => a.toUpperCase().trim()));
        const teamRisk = riskData ? riskData.rankings.filter(a => agentSet.has(a.agent.toUpperCase().trim())) : [];

        let r = `**Agents under ${match.manager}:** (${match.agentCount})\n\n`;
        if (teamRisk.length > 0) {
            teamRisk.sort((a, b) => b.riskScore - a.riskScore).forEach((a, i) => {
                r += `${i + 1}. **${a.agent}** - Risk: ${a.riskScore} (${a.riskLevel}) | SC: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n`;
            });
        } else {
            match.agents.forEach((a, i) => {
                r += `${i + 1}. ${a}\n`;
            });
        }

        this.context.lastAgentList = teamRisk;
        return r;
    },

    handleManagerRisk: function (intent) {
        return this.handleManagerInfo(intent);
    },

    handleManagerWorstAgent: function (intent) {
        const match = this._findManager(intent.manager);
        if (!match) return this._managerNotFound(intent.manager);

        this.context.lastManager = match.manager;
        this.context.lastTopic = 'manager';

        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const agentSet = new Set(match.agents.map(a => a.toUpperCase().trim()));
        const teamRisk = riskData.rankings.filter(a => agentSet.has(a.agent.toUpperCase().trim()));

        if (teamRisk.length === 0) return `No risk data found for agents under ${match.manager}.`;

        teamRisk.sort((a, b) => b.riskScore - a.riskScore);
        const worst = teamRisk.slice(0, Math.min(5, teamRisk.length));

        let r = `**Highest Risk Agents under ${match.manager}:**\n\n`;
        worst.forEach((a, i) => {
            r += `**${i + 1}. ${a.agent}** - Score: **${a.riskScore}** (${a.riskLevel})\n`;
            r += `   SC: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n\n`;
        });

        if (worst[0].riskScore >= 40) {
            r += `**Action:** ${worst[0].agent} is the highest concern and needs coaching from ${match.manager}.`;
        }

        this.context.lastAgentList = worst;
        this.context.lastResults = worst;
        return r;
    },

    handleManagerBestAgent: function (intent) {
        const match = this._findManager(intent.manager);
        if (!match) return this._managerNotFound(intent.manager);

        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const agentSet = new Set(match.agents.map(a => a.toUpperCase().trim()));
        const teamRisk = riskData.rankings.filter(a => agentSet.has(a.agent.toUpperCase().trim()));

        if (teamRisk.length === 0) return `No risk data found for agents under ${match.manager}.`;

        teamRisk.sort((a, b) => a.riskScore - b.riskScore);
        const best = teamRisk.slice(0, Math.min(5, teamRisk.length));

        let r = `**Best Performing Agents under ${match.manager}:**\n\n`;
        best.forEach((a, i) => {
            r += `**${i + 1}. ${a.agent}** - Score: **${a.riskScore}** (${a.riskLevel})\n`;
        });
        return r;
    },

    handleManagerCompare: function (intent) {
        const managers = intent.managers;
        if (!managers || managers.length < 2) return 'Please specify two managers to compare.';

        const m1 = this._findManager(managers[0]);
        const m2 = this._findManager(managers[1]);
        if (!m1) return this._managerNotFound(managers[0]);
        if (!m2) return this._managerNotFound(managers[1]);

        let r = `**Manager Comparison:**\n\n`;
        r += `| Metric | ${m1.manager} | ${m2.manager} |\n`;
        r += `|---|---|---|\n`;
        r += `| Agents | ${m1.agentCount} | ${m2.agentCount} |\n`;
        r += `| Focus Level | ${m1.focusLevel} | ${m2.focusLevel} |\n`;
        r += `| Aged Cases | ${m1.agedCases} | ${m2.agedCases} |\n`;
        r += `| Critical Aged | ${m1.criticalAgedCases} | ${m2.criticalAgedCases} |\n`;
        r += `| Short Calls | ${m1.shortCalls} | ${m2.shortCalls} |\n`;
        r += `| RONA | ${m1.rona} | ${m2.rona} |\n`;
        r += `| Email Changes | ${m1.emailChanges} | ${m2.emailChanges} |\n\n`;

        const better = m1.focusScore <= m2.focusScore ? m1 : m2;
        r += `**${better.manager}**'s team is performing better overall.`;
        return r;
    },

    // === AGED CASES ===
    handleCriticalCases: function () {
        const data = App.currentData;
        if (!data?.age48hrs) return "No aged case data available.";

        const critical = data.age48hrs.filter(r => r.age > 96);
        const warning = data.age48hrs.filter(r => r.age > 48 && r.age <= 96);

        let r = `**Case Age Status:**\n\n`;
        r += `- Critical (>96 hrs): **${critical.length}** cases\n`;
        r += `- Warning (48-96 hrs): **${warning.length}** cases\n`;
        r += `- Total Aged Cases: **${data.age48hrs.length}**\n\n`;

        if (critical.length > 0) {
            r += `**Critical Cases:**\n`;
            critical.sort((a, b) => b.age - a.age).slice(0, 10).forEach(c => {
                r += `- Case ${c.caseNumber}: **${c.age.toFixed(0)} hrs** | Owner: ${c.caseOwner} | Manager: ${c.manager} | Origin: ${c.origin}\n`;
            });
            if (critical.length > 10) r += `...and ${critical.length - 10} more.\n`;
            r += `\n**Action:** These cases need immediate resolution.`;
        } else {
            r += `**Good News:** No critically aged cases!`;
        }

        this.context.lastTopic = 'aged';
        this.context.lastResults = critical;
        return r;
    },

    handleAgedCases: function (intent) {
        const data = App.currentData;
        if (!data?.age48hrs) return "No aged case data available.";

        const threshold = intent.threshold || 48;
        const filtered = data.age48hrs.filter(r => r.age > threshold);

        let r = `**Cases Aged Over ${threshold} Hours:** (${filtered.length})\n\n`;
        if (filtered.length === 0) return `No cases found over ${threshold} hours.`;

        filtered.sort((a, b) => b.age - a.age).slice(0, 15).forEach(c => {
            r += `- Case ${c.caseNumber}: **${c.age.toFixed(0)} hrs** | Owner: ${c.caseOwner} | Manager: ${c.manager}\n`;
        });
        if (filtered.length > 15) r += `...and ${filtered.length - 15} more.\n`;

        this.context.lastTopic = 'aged';
        this.context.lastResults = filtered;
        return r;
    },

    handleAgedByOwner: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.age48hrs?.byOwner) return "No aged case data available.";

        const byOwner = analysis.age48hrs.byOwner;
        const sorted = Object.entries(byOwner).sort((a, b) => b[1].count - a[1].count);

        let r = `**Aged Cases by Owner:**\n\n`;
        sorted.slice(0, 10).forEach(([owner, data], i) => {
            r += `**${i + 1}. ${owner}** - ${data.count} cases | Avg Age: ${data.avgAge.toFixed(0)} hrs | Critical: ${data.critical}\n`;
        });

        this.context.lastTopic = 'aged';
        return r;
    },

    // === SHORT CALLS ===
    handleShortCalls: function (intent) {
        const analysis = App.currentAnalysis;
        if (!analysis?.shortCalls) return "No short calls data available.";

        const sc = analysis.shortCalls;

        if (intent.agent) {
            const match = this._findInList(intent.agent, sc.aggregatedRankings || sc.rankings, 'agentName');
            if (!match) return `No short call data for "${intent.agent}".`;

            this.context.lastAgent = match.agentName;
            this.context.lastTopic = 'shortCalls';
            return `**Short Calls for ${match.agentName}:**\n\n- Count: **${match.count}**\n- Status: **${match.status}**\n- vs Average: ${match.vsAverage > 0 ? '+' : ''}${match.vsAverage.toFixed(0)}\n- Compared to Average: ${match.percentOfAvg}x\n- Z-Score: ${match.zScore.toFixed(2)}`;
        }

        let r = `**Short Calls Overview:**\n\n`;
        r += `- Total Short Calls: **${sc.total}**\n`;
        r += `- Team Average: **${sc.stats.mean.toFixed(0)}** per agent\n`;
        r += `- Median: **${sc.stats.median}**\n`;
        r += `- Highest: **${sc.stats.max}** | Lowest: **${sc.stats.min}**\n`;
        r += `- Std Dev: **${sc.stats.stdDev.toFixed(1)}**\n`;
        r += `- Outliers: **${sc.outliers.length}**\n\n`;

        if (sc.topOffenders?.length > 0) {
            r += `**Highest Volume Agents:**\n`;
            sc.topOffenders.slice(0, 5).forEach((a, i) => {
                r += `${i + 1}. **${a.agentName}**: ${a.count} (${a.status})\n`;
            });
        }

        this.context.lastTopic = 'shortCalls';
        return r;
    },

    handleShortCallsTop: function (intent) {
        const analysis = App.currentAnalysis;
        if (!analysis?.shortCalls) return "No short calls data available.";

        const ranked = analysis.shortCalls.aggregatedRankings || analysis.shortCalls.rankings || [];
        const count = Math.min(intent.count || 5, ranked.length);
        const top = ranked.slice(0, count);

        let r = `**Top ${count} Agents by Short Calls:**\n\n`;
        top.forEach((a, i) => {
            r += `${i + 1}. **${a.agentName}**: **${a.count}** short calls (${a.status}) | Z-Score: ${a.zScore.toFixed(2)}\n`;
        });

        this.context.lastTopic = 'shortCalls';
        this.context.lastAgentList = top;
        return r;
    },

    handleShortCallsAbove: function (intent) {
        const analysis = App.currentAnalysis;
        if (!analysis?.shortCalls) return "No short calls data available.";

        const ranked = analysis.shortCalls.aggregatedRankings || analysis.shortCalls.rankings || [];
        const threshold = intent.threshold || 50;
        const filtered = ranked.filter(a => a.count > threshold);

        if (filtered.length === 0) return `No agents have short calls above ${threshold}.`;

        let r = `**Agents with Short Calls > ${threshold}:** (${filtered.length})\n\n`;
        filtered.forEach((a, i) => {
            r += `${i + 1}. **${a.agentName}**: ${a.count} (${a.status})\n`;
        });
        return r;
    },

    // === RONA ===
    handleRona: function (intent) {
        const analysis = App.currentAnalysis;
        if (!analysis?.ronaTrend) return "No RONA data available.";

        const rona = analysis.ronaTrend;

        if (intent.agent) {
            const match = this._findInList(intent.agent, rona.aggregatedRankings || rona.rankings, 'agentName');
            if (!match) return `No RONA data for "${intent.agent}".`;

            this.context.lastAgent = match.agentName;
            this.context.lastTopic = 'rona';
            return `**RONA for ${match.agentName}:**\n\n- RONA Count: **${match.rona}**\n- Status: **${match.status}**\n- vs Average: ${match.vsAverage > 0 ? '+' : ''}${match.vsAverage.toFixed(0)}\n- Compared to Average: ${match.percentOfAvg}x\n- Z-Score: ${match.zScore.toFixed(2)}`;
        }

        let r = `**RONA Overview:**\n\n`;
        r += `- Total RONA: **${rona.total}**\n`;
        r += `- Team Average: **${rona.stats.mean.toFixed(1)}** per agent\n`;
        r += `- Median: **${rona.stats.median}**\n`;
        r += `- Highest: **${rona.stats.max}** | Lowest: **${rona.stats.min}**\n`;
        r += `- Std Dev: **${rona.stats.stdDev.toFixed(1)}**\n`;
        r += `- Outliers: **${rona.outliers.length}**\n`;
        r += `- Threshold (2x avg): **${rona.threshold.toFixed(0)}**\n\n`;

        if (rona.topAgents?.length > 0) {
            r += `**Highest RONA Agents:**\n`;
            rona.topAgents.slice(0, 5).forEach((a, i) => {
                r += `${i + 1}. **${a.agentName}**: ${a.rona} (${a.status})\n`;
            });
        }

        this.context.lastTopic = 'rona';
        return r;
    },

    handleRonaTop: function (intent) {
        const analysis = App.currentAnalysis;
        if (!analysis?.ronaTrend) return "No RONA data available.";

        const ranked = analysis.ronaTrend.aggregatedRankings || analysis.ronaTrend.rankings || [];
        const count = Math.min(intent.count || 5, ranked.length);
        const top = ranked.slice(0, count);

        let r = `**Top ${count} Agents by RONA:**\n\n`;
        top.forEach((a, i) => {
            r += `${i + 1}. **${a.agentName}**: **${a.rona}** RONA (${a.status}) | Z-Score: ${a.zScore.toFixed(2)}\n`;
        });

        this.context.lastTopic = 'rona';
        this.context.lastAgentList = top;
        return r;
    },

    // === EMAIL CHANGES ===
    handleEmailChanges: function (intent) {
        const analysis = App.currentAnalysis;
        if (!analysis?.emailChanges) return "No email change data available.";

        const ec = analysis.emailChanges;

        if (intent.agent) {
            const agentName = intent.agent;
            const count = ec.byAgent[agentName] || ec.byAgent[agentName.toUpperCase()];
            if (count !== undefined) {
                this.context.lastAgent = agentName;
                this.context.lastTopic = 'email';
                return `**Email Changes for ${agentName}:** ${count} changes`;
            }
            const key = Object.keys(ec.byAgent).find(k => k.toUpperCase().includes(agentName.toUpperCase()));
            if (key) {
                this.context.lastAgent = key;
                return `**Email Changes for ${key}:** ${ec.byAgent[key]} changes`;
            }
            return `No email change data for "${agentName}".`;
        }

        const totalChanges = App.currentData?.emailChanges?.length || 0;
        let r = `**Email Changes Overview:**\n\n`;
        r += `- Total Changes: **${totalChanges}**\n`;
        r += `- Average per Agent: **${ec.stats.mean.toFixed(1)}**\n`;
        r += `- Agents Involved: **${Object.keys(ec.byAgent).length}**\n`;
        r += `- Anomalies: **${ec.anomalies.length}**\n\n`;

        if (ec.anomalies.length > 0) {
            r += `**Suspicious Activity:**\n`;
            ec.anomalies.slice(0, 5).forEach((a, i) => {
                r += `${i + 1}. **${a.agent}**: ${a.count} changes (${a.percentAboveAvg}x avg) - ${a.severity}\n`;
            });
        }

        if (Object.keys(ec.byType).length > 0) {
            r += `\n**Change Types:**\n`;
            Object.entries(ec.byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
                const label = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                r += `- ${label}: ${count}\n`;
            });
        }

        // Top agents by email changes
        const sortedAgents = Object.entries(ec.byAgent).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (sortedAgents.length > 0) {
            r += `\n**Top Agents by Email Changes:**\n`;
            sortedAgents.forEach(([agent, count], i) => {
                r += `${i + 1}. **${agent}**: ${count}\n`;
            });
        }

        this.context.lastTopic = 'email';
        return r;
    },

    handleEmailSuspicious: function () {
        const data = App.currentData;
        if (!data?.emailChanges) return "No email data available.";

        const punctuation = data.emailChanges.filter(r => r.changeType === 'punctuation');
        const minor = data.emailChanges.filter(r => r.changeType === 'minor_edit');

        let r = `**Suspicious Email Changes:**\n\n`;
        r += `- Punctuation Changes: **${punctuation.length}**\n`;
        r += `- Minor Edits: **${minor.length}**\n\n`;

        const allSuspicious = [...punctuation, ...minor];
        if (allSuspicious.length === 0) return "No suspicious email changes detected.";

        // Group by agent
        const byAgent = {};
        allSuspicious.forEach(e => {
            const agent = e.editedBy || 'Unknown';
            byAgent[agent] = (byAgent[agent] || 0) + 1;
        });

        const sorted = Object.entries(byAgent).sort((a, b) => b[1] - a[1]);
        r += `**By Agent:**\n`;
        sorted.slice(0, 10).forEach(([agent, count], i) => {
            r += `${i + 1}. **${agent}**: ${count} suspicious changes\n`;
        });

        if (punctuation.length > 0) {
            r += `\n**Sample Punctuation Changes:**\n`;
            punctuation.slice(0, 3).forEach(e => {
                r += `- By ${e.editedBy}: "${e.oldValue}" -> "${e.newValue}"\n`;
            });
        }

        this.context.lastTopic = 'email';
        return r;
    },

    handleEmailByType: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.emailChanges) return "No email data available.";

        const ec = analysis.emailChanges;
        const total = App.currentData?.emailChanges?.length || 0;

        let r = `**Email Changes by Type:**\n\n`;
        Object.entries(ec.byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            const label = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
            r += `- **${label}**: ${count} (${pct}%)\n`;
        });

        this.context.lastTopic = 'email';
        return r;
    },

    // === ANOMALIES ===
    handleAnomalies: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.anomalies) return "No anomaly data available.";

        const anomalies = analysis.anomalies;
        if (anomalies.length === 0) return "**No significant anomalies detected.** All metrics appear within normal ranges.";

        const high = anomalies.filter(a => a.severity === 'high');
        const med = anomalies.filter(a => a.severity === 'medium');

        let r = `**Detected Anomalies: ${anomalies.length} total**\n\n`;

        if (high.length > 0) {
            r += `**High Severity (${high.length}):**\n`;
            high.forEach(a => r += `- ${a.message}\n`);
            r += `\n`;
        }
        if (med.length > 0) {
            r += `**Medium Severity (${med.length}):**\n`;
            med.forEach(a => r += `- ${a.message}\n`);
        }

        this.context.lastTopic = 'anomaly';
        this.context.lastResults = anomalies;
        return r;
    },

    // === CASE RECORD QUERIES ===
    handleCaseRecord: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.caseRecordType) return "No case record data available.";

        const crt = analysis.caseRecordType;

        let r = `**Case Record Type Distribution:**\n\n`;
        r += `- Total Cases: **${crt.totalCases}**\n`;
        r += `- Most Common Type: **${crt.mostCommonType}**\n`;
        r += `- Most Common Origin: **${crt.mostCommonOrigin}**\n\n`;

        r += `**By Record Type:**\n`;
        Object.entries(crt.distribution).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            const pct = ((count / crt.totalCases) * 100).toFixed(1);
            r += `- ${type}: **${count}** (${pct}%)\n`;
        });

        this.context.lastTopic = 'caseRecord';
        return r;
    },

    handleCaseRecordOrigin: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.caseRecordType) return "No case record data available.";

        const crt = analysis.caseRecordType;

        let r = `**Cases by Origin:**\n\n`;
        Object.entries(crt.byOrigin).sort((a, b) => b[1] - a[1]).forEach(([origin, count]) => {
            const pct = ((count / crt.totalCases) * 100).toFixed(1);
            r += `- **${origin}**: ${count} (${pct}%)\n`;
        });

        this.context.lastTopic = 'caseRecord';
        return r;
    },

    handleCaseRecordByManager: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.caseRecordType?.byManager) return "No case record data available.";

        const byManager = analysis.caseRecordType.byManager;

        let r = `**Case Records by Manager:**\n\n`;
        Object.entries(byManager).sort((a, b) => {
            const totalA = Object.values(a[1]).reduce((s, v) => s + v, 0);
            const totalB = Object.values(b[1]).reduce((s, v) => s + v, 0);
            return totalB - totalA;
        }).forEach(([manager, types]) => {
            const total = Object.values(types).reduce((s, v) => s + v, 0);
            r += `**${manager}** (${total} cases): `;
            r += Object.entries(types).map(([t, c]) => `${t}: ${c}`).join(', ');
            r += `\n`;
        });

        return r;
    },

    // === PROACTIVE TYPE ===
    handleProactiveType: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.proactiveType) return "No proactive type data available.";

        const pt = analysis.proactiveType;

        if (!pt.totalCases || pt.totalCases === 0) {
            return "**Proactive Type:** No proactive type data found in the current dataset. The source data may not include proactive type classifications.";
        }

        let r = `**Proactive Type Distribution:**\n\n`;
        r += `- Total Cases: **${pt.totalCases}**\n`;
        r += `- Most Common: **${pt.mostCommonType || 'N/A'}**\n\n`;

        Object.entries(pt.distribution).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            const pct = ((count / pt.totalCases) * 100).toFixed(1);
            r += `- **${type}**: ${count} (${pct}%)\n`;
        });

        this.context.lastTopic = 'proactive';
        return r;
    },

    handleProactiveByManager: function () {
        const analysis = App.currentAnalysis;
        if (!analysis?.proactiveType?.byManager) return "No proactive type data available.";

        const byManager = analysis.proactiveType.byManager;

        let r = `**Proactive Types by Manager:**\n\n`;
        Object.entries(byManager).forEach(([manager, types]) => {
            const total = Object.values(types).reduce((s, v) => s + v, 0);
            r += `**${manager}** (${total}): `;
            r += Object.entries(types).map(([t, c]) => `${t}: ${c}`).join(', ');
            r += `\n`;
        });

        return r;
    },

    // === COMPARE AGENTS ===
    handleCompareAgents: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        if (!intent.agents || intent.agents.length < 2) return 'Please specify two agent names to compare, like: "Compare John and Jane"';

        const a1 = this._findAgent(intent.agents[0]);
        const a2 = this._findAgent(intent.agents[1]);
        if (!a1) return this._agentNotFound(intent.agents[0]);
        if (!a2) return this._agentNotFound(intent.agents[1]);

        let r = `**Agent Comparison: ${a1.agent} vs ${a2.agent}**\n\n`;
        r += `| Metric | ${a1.agent} | ${a2.agent} |\n`;
        r += `|---|---|---|\n`;
        r += `| Risk Score | ${a1.riskScore} (${a1.riskLevel}) | ${a2.riskScore} (${a2.riskLevel}) |\n`;
        r += `| Rank | #${a1.originalRank} | #${a2.originalRank} |\n`;
        r += `| Short Calls | ${a1.shortCalls} | ${a2.shortCalls} |\n`;
        r += `| RONA | ${a1.rona} | ${a2.rona} |\n`;
        r += `| Email Changes | ${a1.emailChanges} | ${a2.emailChanges} |\n`;
        r += `| Aged Cases | ${a1.agedCases} | ${a2.agedCases} |\n\n`;

        const better = a1.riskScore <= a2.riskScore ? a1 : a2;
        const worse = a1.riskScore > a2.riskScore ? a1 : a2;
        r += `**${better.agent}** has a lower risk (${better.riskScore} vs ${worse.riskScore}).`;

        return r;
    },

    // === TEAM STATS ===
    handleTeamStats: function () {
        const summary = DataParser.getSummary();
        const riskData = this._getRiskData();
        const analysis = App.currentAnalysis;
        if (!riskData) return this._noData();

        const avgRisk = riskData.rankings.length > 0
            ? (riskData.rankings.reduce((s, r) => s + r.riskScore, 0) / riskData.rankings.length).toFixed(1)
            : 0;

        let r = `**Team Statistics:**\n\n`;
        r += `- Total Agents: **${riskData.rankings.length}**\n`;
        r += `- Average Risk Score: **${avgRisk}**\n`;
        r += `- Highest Risk Score: **${riskData.rankings[0]?.riskScore || 0}** (${riskData.rankings[0]?.agent || 'N/A'})\n`;
        r += `- Lowest Risk Score: **${riskData.rankings[riskData.rankings.length - 1]?.riskScore || 0}** (${riskData.rankings[riskData.rankings.length - 1]?.agent || 'N/A'})\n\n`;

        if (analysis?.shortCalls?.stats) {
            const s = analysis.shortCalls.stats;
            r += `**Short Calls:** Avg: ${s.mean.toFixed(0)} | Med: ${s.median} | Max: ${s.max} | StdDev: ${s.stdDev.toFixed(1)}\n`;
        }
        if (analysis?.ronaTrend?.stats) {
            const s = analysis.ronaTrend.stats;
            r += `**RONA:** Avg: ${s.mean.toFixed(1)} | Med: ${s.median} | Max: ${s.max} | StdDev: ${s.stdDev.toFixed(1)}\n`;
        }
        if (analysis?.emailChanges?.stats) {
            const s = analysis.emailChanges.stats;
            r += `**Email Changes:** Avg: ${s.mean.toFixed(1)} | Med: ${s.median} | Max: ${s.max}\n`;
        }

        r += `\n- Total Cases: **${summary.totalCases.toLocaleString()}**\n`;
        r += `- Aged Cases (48hrs+): **${summary.over48hrs}**`;

        this.context.lastTopic = 'team';
        return r;
    },

    // === ALL INSIGHTS ===
    handleAllInsights: function () {
        const analysis = App.currentAnalysis;
        const data = App.currentData;
        if (!analysis || !data) return this._noData();

        const insights = InsightsGenerator.generateInsights(analysis, data);
        if (insights.length === 0) return "No significant insights to report at this time.";

        let r = `**All Dashboard Insights (${insights.length}):**\n\n`;
        insights.forEach((ins, i) => {
            const icon = ins.type === 'critical' ? '!!' : ins.type === 'warning' ? '!' : '';
            r += `**${i + 1}. [${ins.category}]** ${icon} ${ins.message}\n`;
            if (ins.action) r += `   *Action:* ${ins.action}\n`;
            r += `\n`;
        });

        this.context.lastTopic = 'insights';
        this.context.lastResults = insights;
        return r;
    },

    // === IMPROVEMENTS ===
    handleImprovements: function () {
        const riskData = this._getRiskData();
        const analysis = App.currentAnalysis;
        const data = App.currentData;
        if (!riskData) return this._noData();

        let r = `**Recommended Actions:**\n\n`;
        let n = 0;

        const critical = riskData.rankings.filter(a => a.riskLevel === 'Critical');
        if (critical.length > 0) {
            n++;
            r += `**${n}. Immediate Coaching for Critical Agents**\n`;
            r += `${critical.length} agent(s) at Critical risk: ${critical.map(a => a.agent).join(', ')}.\n`;
            r += `Schedule 1-on-1 coaching sessions. Focus on their highest contributing metric.\n\n`;
        }

        const high = riskData.rankings.filter(a => a.riskLevel === 'High');
        if (high.length > 0) {
            n++;
            r += `**${n}. Monitor High Risk Agents**\n`;
            r += `${high.length} agent(s) at High risk. Set up weekly check-ins and metric tracking.\n\n`;
        }

        if (analysis?.shortCalls?.outliers?.length > 2) {
            n++;
            r += `**${n}. Short Call Training**\n`;
            r += `${analysis.shortCalls.outliers.length} agents have abnormal short calls. Team training on call quality recommended.\n\n`;
        }

        if (analysis?.ronaTrend?.outliers?.length > 0) {
            n++;
            r += `**${n}. RONA / Availability Review**\n`;
            r += `${analysis.ronaTrend.outliers.length} agents with high RONA. Review scheduling and system availability.\n\n`;
        }

        if (analysis?.emailChanges?.anomalies?.length > 0) {
            n++;
            r += `**${n}. Email Change Audit**\n`;
            r += `${analysis.emailChanges.anomalies.length} agents with suspicious email changes. Conduct policy compliance review.\n\n`;
        }

        const criticalCases = data?.age48hrs?.filter(c => c.age > 96) || [];
        if (criticalCases.length > 0) {
            n++;
            r += `**${n}. Aged Case Resolution**\n`;
            r += `${criticalCases.length} cases over 96 hours. Assign resources for immediate closure.\n\n`;
        }

        const highFocusManagers = DataParser.getManagerStats().filter(m => m.focusLevel === 'High');
        if (highFocusManagers.length > 0) {
            n++;
            r += `**${n}. Manager Engagement**\n`;
            r += `Managers needing support: ${highFocusManagers.map(m => m.manager).join(', ')}. Share team metrics and discuss improvement plans.\n\n`;
        }

        if (n === 0) {
            r = "**Great news!** No critical improvements needed. The team is performing within acceptable parameters. Continue regular monitoring.";
        }

        this.context.lastTopic = 'improvements';
        return r;
    },

    // === COUNT & PERCENTAGE QUERIES ===
    handleCountQuery: function (intent) {
        const riskData = this._getRiskData();
        const data = App.currentData;
        if (!riskData) return this._noData();

        const subject = typeof intent.subject === 'string' ? intent.subject : '';

        if (/agent/.test(subject)) return `Total agents: **${riskData.rankings.length}**`;
        if (/manager/.test(subject)) return `Total managers: **${DataParser.getManagerStats().length}**`;
        if (/critical/.test(subject)) {
            const criticalAgents = riskData.counts.critical;
            const criticalCases = data?.age48hrs?.filter(c => c.age > 96).length || 0;
            return `**Critical counts:**\n- Critical Risk Agents: **${criticalAgents}**\n- Critically Aged Cases (>96hrs): **${criticalCases}**`;
        }
        if (/case|record/.test(subject)) return `Total cases: **${(data?.caseRecordType?.length || 0) + (data?.proactiveType?.length || 0)}**`;

        return this.handleTeamStats();
    },

    handlePercentageQuery: function (intent) {
        return this.handleRiskDistribution();
    },

    // === DATE INFO ===
    handleDateInfo: function () {
        const dateRange = DataParser.getDateRange();
        const lastUpdate = App.state.lastUpdateTime;

        let r = `**Data Information:**\n\n`;
        r += `- Data Period: **${dateRange.range}**\n`;
        if (dateRange.lastRecord) r += `- Last Record: **${dateRange.lastRecord}**\n`;
        if (lastUpdate) r += `- Dashboard Last Refreshed: **${lastUpdate.toLocaleString()}**\n`;
        return r;
    },

    // === LIST AGENTS ===
    handleListAgents: function (intent) {
        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        if (intent.manager) {
            return this.handleManagerAgents(intent);
        }

        let r = `**All Agents:** (${riskData.rankings.length})\n\n`;
        riskData.rankings.forEach((a, i) => {
            r += `${i + 1}. **${a.agent}** - Score: ${a.riskScore} (${a.riskLevel})\n`;
        });
        return r;
    },

    // === FOLLOW-UP / DRILL-DOWN HANDLERS ===
    handleFollowupMore: function () {
        if (this.context.lastAgent) {
            return this.handleAgentInfo({ agent: this.context.lastAgent });
        }
        if (this.context.lastManager) {
            return this.handleManagerInfo({ manager: this.context.lastManager });
        }
        if (this.context.lastTopic === 'risk' && this.context.lastAgentList) {
            // Show more details about listed agents
            let r = `**Detailed View of Previously Listed Agents:**\n\n`;
            this.context.lastAgentList.slice(0, 10).forEach((a, i) => {
                const mgr = this._getAgentManager(a.agent || a.agentName);
                r += `**${i + 1}. ${a.agent || a.agentName}** | Manager: ${mgr}\n`;
                if (a.riskScore !== undefined) r += `   Risk: ${a.riskScore} (${a.riskLevel}) | SC: ${a.shortCalls} | RONA: ${a.rona} | Email: ${a.emailChanges} | Aged: ${a.agedCases}\n`;
                if (a.count !== undefined) r += `   Count: ${a.count} (${a.status})\n`;
                r += `\n`;
            });
            return r;
        }
        if (this.context.lastTopic) {
            return this.handleDrilldown({ topic: this.context.lastTopic });
        }
        return "Could you specify what you'd like more details about? For example, ask about a specific agent, manager, or metric.";
    },

    handleFollowupWho: function () {
        if (this.context.lastResults && Array.isArray(this.context.lastResults)) {
            let r = `**Agents from previous results:**\n\n`;
            this.context.lastResults.slice(0, 10).forEach((a, i) => {
                const name = a.agent || a.agentName || a.caseOwner || 'Unknown';
                r += `${i + 1}. **${name}**\n`;
            });
            return r;
        }
        return "I don't have a previous result to reference. Try asking a specific question first.";
    },

    handleFollowupWhy: function () {
        if (this.context.lastAgent) {
            const match = this._findAgent(this.context.lastAgent);
            if (match) {
                const metrics = [
                    { name: 'Short Calls', value: match.shortCalls },
                    { name: 'RONA', value: match.rona },
                    { name: 'Email Changes', value: match.emailChanges },
                    { name: 'Aged Cases', value: match.agedCases }
                ].filter(m => m.value > 0).sort((a, b) => b.value - a.value);

                let r = `**Why ${match.agent} has a risk score of ${match.riskScore}:**\n\n`;
                r += `The risk score is calculated as: 0.25 * ShortCalls + 0.25 * RONA + 0.25 * EmailChanges + 0.25 * AgedCases (capped at 100).\n\n`;
                r += `**Contributing Factors (highest first):**\n`;
                metrics.forEach(m => {
                    const contribution = (0.25 * m.value).toFixed(1);
                    r += `- ${m.name}: ${m.value} (contributes ${contribution} to score)\n`;
                });

                if (metrics.length > 0) {
                    r += `\n**Primary driver:** ${metrics[0].name} with a value of ${metrics[0].value}.`;
                }
                return r;
            }
        }
        return "Could you specify what you'd like me to explain? Try: \"Why is [agent name] at risk?\"";
    },

    handleDrilldown: function (intent) {
        const topic = intent.topic || this.context.lastTopic;
        switch (topic) {
            case 'risk': return this.handleRiskDistribution();
            case 'shortCalls': return this.handleShortCallsTop({ count: 10 });
            case 'rona': return this.handleRonaTop({ count: 10 });
            case 'email': return this.handleEmailSuspicious();
            case 'aged': return this.handleAgedByOwner();
            case 'caseRecord': return this.handleCaseRecordOrigin();
            case 'proactive': return this.handleProactiveByManager();
            case 'summary': return this.handleAllInsights();
            case 'anomaly': return this.handleAnomalies();
            case 'manager': return this.handleManagerFocus();
            case 'improvements': return this.handleAllInsights();
            case 'agent': return this.context.lastAgent ? this.handleAgentInfo({ agent: this.context.lastAgent }) : this.handleTopRisk({ count: 10 });
            default: return "What would you like to drill down into? Ask about risk, short calls, RONA, email changes, aged cases, or any specific agent/manager.";
        }
    },

    // === DASHBOARD CONTROL: FILTER, NAVIGATE, RESET ===

    /**
     * Filter the dashboard by manager (actually changes the UI dropdown and refreshes)
     */
    handleFilterManager: function (intent) {
        if (!intent.manager) {
            const managers = DataParser.getManagerStats();
            return `Which manager would you like to filter by? Available managers:\n${managers.map(m => `- **${m.manager}**`).join('\n')}\n\nSay: "Filter by [manager name]"`;
        }

        const match = this._findManager(intent.manager);
        if (!match) return this._managerNotFound(intent.manager);

        // Actually apply the filter on the dashboard UI
        const select = document.getElementById('managerFilter');
        if (select) {
            // Find the option that matches this manager
            let found = false;
            for (let option of select.options) {
                if (option.value === match.manager) {
                    select.value = match.manager;
                    found = true;
                    break;
                }
            }

            if (found) {
                App.state.currentManager = match.manager;
                App.state.currentAgent = '';
                document.getElementById('agentFilter').value = '';
                App.refreshDashboard();
                App.populateAgentFilter();

                this.context.lastManager = match.manager;
                return `**Dashboard filtered by: ${match.manager}**\n\nThe dashboard is now showing data only for ${match.manager}'s team (${match.agentCount} agents).\n\nAll charts, tables, and insights are now scoped to this manager. You can:\n- "Show insights for ${match.manager}"\n- "Who is at most risk under ${match.manager}?"\n- "Reset filters" to go back to all data`;
            }
        }

        return `I found manager ${match.manager} but couldn't apply the filter. Try selecting them from the Manager dropdown manually.`;
    },

    /**
     * Filter the dashboard by agent
     */
    handleFilterAgent: function (intent) {
        if (!intent.agent) {
            return `Which agent would you like to filter by? Say: "Filter by [agent name]"`;
        }

        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const match = this._findAgent(intent.agent);
        if (!match) return this._agentNotFound(intent.agent);

        // Apply the agent filter on the dashboard
        const select = document.getElementById('agentFilter');
        if (select) {
            let found = false;
            for (let option of select.options) {
                if (option.value === match.agent) {
                    select.value = match.agent;
                    found = true;
                    break;
                }
            }

            // If not in dropdown, add it temporarily
            if (!found) {
                const option = document.createElement('option');
                option.value = match.agent;
                option.textContent = match.agent;
                select.appendChild(option);
                select.value = match.agent;
            }

            App.state.currentAgent = match.agent;
            App.refreshDashboard();

            this.context.lastAgent = match.agent;
            const mgr = this._getAgentManager(match.agent);
            return `**Dashboard filtered by agent: ${match.agent}**\n\nAll charts, tables, and insights now show data only for ${match.agent}.\n- Manager: ${mgr}\n- Risk Score: ${match.riskScore} (${match.riskLevel})\n\nYou can:\n- "Show insights for ${match.agent}"\n- "Tell me about ${match.agent}"\n- "Reset filters" to go back to all data`;
        }

        return `I found agent ${match.agent} but couldn't apply the filter.`;
    },

    /**
     * Reset all dashboard filters
     */
    handleResetFilter: function () {
        const managerSelect = document.getElementById('managerFilter');
        const agentSelect = document.getElementById('agentFilter');

        if (managerSelect) managerSelect.value = '';
        if (agentSelect) agentSelect.value = '';

        App.state.currentManager = '';
        App.state.currentAgent = '';
        App.refreshDashboard();
        App.populateAgentFilter();

        this.context.lastManager = null;
        this.context.lastAgent = null;

        return "**All filters cleared.** The dashboard is now showing data for all managers and all agents.";
    },

    handleFilterDate: function (intent) {
        if (!App.state.dataLoaded) return "Please load data first.";

        const startInput = document.getElementById('startDate');
        const endInput = document.getElementById('endDate');

        if (intent.start) startInput.value = intent.start;
        if (intent.end) endInput.value = intent.end;

        App.applyDateFilter();

        const from = intent.start || startInput.value || 'start';
        const to = intent.end || endInput.value || 'end';

        return `**Date filter applied:** ${from} to ${to}\n\nThe dashboard has been updated. You can now ask me about the data in this date range.`;
    },

    _extractDates: function (q) {
        const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

        const guessYear = (m, d) => {
            const now = new Date();
            return now.getFullYear().toString();
        };

        const results = [];

        const re1 = /(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/g;
        let m;
        while ((m = re1.exec(q)) !== null) {
            const month = m[1].padStart(2, '0');
            const day = m[2].padStart(2, '0');
            results.push(`${m[3]}-${month}-${day}`);
        }

        const re2 = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/gi;
        while ((m = re2.exec(q)) !== null) {
            const mon = months[m[1].toLowerCase().substring(0, 3)];
            const day = m[2].padStart(2, '0');
            const year = m[3] || guessYear(mon, day);
            results.push(`${year}-${mon}-${day}`);
        }

        const re3 = /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*(?:\s+(\d{4}))?/gi;
        while ((m = re3.exec(q)) !== null) {
            const mon = months[m[2].toLowerCase().substring(0, 3)];
            const day = m[1].padStart(2, '0');
            const year = m[3] || guessYear(mon, day);
            results.push(`${year}-${mon}-${day}`);
        }

        const unique = [...new Set(results)].sort();

        if (unique.length >= 2) return { start: unique[0], end: unique[unique.length - 1] };
        if (unique.length === 1) return { start: unique[0], end: unique[0] };
        return {};
    },

    /**
     * Show current filter status
     */
    handleCurrentFilter: function () {
        const mgr = App.state.currentManager;
        const agent = App.state.currentAgent;

        if (!mgr && !agent) return "**No filters active.** The dashboard is showing all data.\n\nSay \"filter by [manager/agent name]\" to apply a filter.";

        let r = `**Active Filters:**\n`;
        if (mgr) r += `- Manager: **${mgr}**\n`;
        if (agent) r += `- Agent: **${agent}**\n`;
        r += `\nSay "reset filters" to clear.`;
        return r;
    },

    /**
     * Export data as CSV
     */
    handleExport: function (intent) {
        var tabNames = { caseRecord: 'Case Record Type', casesReport: 'Cases Report', proactive: 'Proactive Type', age48: 'Age 48hrs', emailChanges: 'Email Changes', shortCalls: 'Short Calls', rona: 'RONA Trend', all: 'All Data' };
        var tab = intent.tab || 'current';
        if (tab === 'current') {
            App.exportToCSV();
            return "📥 Downloading CSV for the currently active tab. Check your downloads folder!";
        }
        var count = App.exportTabCSV(tab);
        if (tab === 'all') return "📥 Exporting all " + count + " datasets as separate CSV files. Check your downloads folder!";
        if (count > 0) return "📥 Downloaded **" + (tabNames[tab] || tab) + "** data as CSV. Check your downloads folder!";
        return "No data available for " + (tabNames[tab] || tab) + ". Make sure data is loaded first.";
    },

    /**
     * Navigate to a specific dashboard tab
     */
    handleNavigateTab: function (intent) {
        if (!intent.tab) return "Which tab would you like to see? Options: Case Record, Proactive, Age 48hrs, Email Changes, Short Calls, RONA";

        const tabMapping = {
            'caseRecord': 'caseRecord-tab',
            'proactive': 'proactive-tab',
            'age48': 'age48-tab',
            'emailChanges': 'emailChanges-tab',
            'shortCalls': 'shortCalls-tab',
            'rona': 'rona-tab'
        };

        const tabNames = {
            'caseRecord': 'Case Record Type',
            'proactive': 'Proactive Type',
            'age48': 'Age 48hrs',
            'emailChanges': 'Email Changes',
            'shortCalls': 'Short Calls',
            'rona': 'RONA Trend'
        };

        const tabId = tabMapping[intent.tab];
        const tabName = tabNames[intent.tab];

        if (tabId) {
            const tabButton = document.getElementById(tabId);
            if (tabButton) {
                tabButton.click();
                setTimeout(() => {
                    document.querySelector('.tab-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 200);

                this.context.lastTopic = intent.tab === 'shortCalls' ? 'shortCalls' :
                                          intent.tab === 'rona' ? 'rona' :
                                          intent.tab === 'emailChanges' ? 'email' :
                                          intent.tab === 'age48' ? 'aged' :
                                          intent.tab === 'caseRecord' ? 'caseRecord' : 'proactive';

                return `**Navigated to ${tabName} tab.** The dashboard is now showing the ${tabName} view.\n\nAsk me anything about this data, like:\n- "Show me the highest volume agents"\n- "Tell me more"`;
            }
        }

        return "I couldn't find that tab. Available tabs: Case Record, Proactive, Age 48hrs, Email Changes, Short Calls, RONA";
    },

    /**
     * Generate insights specifically for a manager's team
     */
    handleInsightsForManager: function (intent) {
        if (!intent.manager) {
            const managers = DataParser.getManagerStats();
            return `Which manager? Available: ${managers.map(m => m.manager).join(', ')}`;
        }

        const match = this._findManager(intent.manager);
        if (!match) return this._managerNotFound(intent.manager);

        this.context.lastManager = match.manager;
        this.context.lastTopic = 'insights';

        // Get filtered data for this manager
        const filteredData = DataParser.filterByManager(match.manager);
        const analysis = Analytics.analyze(filteredData);
        const insights = InsightsGenerator.generateInsights(analysis, filteredData);
        const riskData = Analytics.calculateAgentRiskScores(filteredData);

        let r = `**Insights for ${match.manager}'s Team** (${match.agentCount} agents):\n\n`;

        // Risk summary for this team
        if (riskData.rankings.length > 0) {
            const critCount = riskData.rankings.filter(a => a.riskLevel === 'Critical').length;
            const highCount = riskData.rankings.filter(a => a.riskLevel === 'High').length;
            const avgScore = (riskData.rankings.reduce((s, a) => s + a.riskScore, 0) / riskData.rankings.length).toFixed(1);

            r += `**Team Risk:**\n`;
            r += `- Average Risk Score: **${avgScore}**\n`;
            if (critCount > 0) r += `- Critical Risk: **${critCount}** agents\n`;
            if (highCount > 0) r += `- High Risk: **${highCount}** agents\n`;

            // Worst agent
            const worst = riskData.rankings[0];
            if (worst && worst.riskScore >= 20) {
                r += `- Highest Risk: **${worst.agent}** (Score: ${worst.riskScore})\n`;
            }
            r += `\n`;
        }

        // Team metrics
        r += `**Team Metrics:**\n`;
        r += `- Aged Cases: **${match.agedCases}** (${match.criticalAgedCases} critical)\n`;
        r += `- Short Calls: **${match.shortCalls}**\n`;
        r += `- RONA: **${match.rona}**\n`;
        r += `- Email Changes: **${match.emailChanges}**\n\n`;

        // Generated insights for this manager's data
        if (insights.length > 0) {
            r += `**Key Findings (${insights.length}):**\n`;
            insights.slice(0, 8).forEach((ins, i) => {
                const flag = ins.type === 'critical' ? '!!' : ins.type === 'warning' ? '!' : '';
                r += `${i + 1}. [${ins.category}] ${flag} ${ins.message}\n`;
                if (ins.action) r += `   *Action:* ${ins.action}\n`;
            });
        } else {
            r += `**No significant concerns** detected for this team.`;
        }

        r += `\n\nSay "filter by ${match.manager}" to apply this filter to the dashboard.`;

        this.context.lastResults = insights;
        return r;
    },

    /**
     * Generate insights specifically for a single agent
     */
    handleInsightsForAgent: function (intent) {
        if (!intent.agent) return "Which agent would you like insights for?";

        const riskData = this._getRiskData();
        if (!riskData) return this._noData();

        const match = this._findAgent(intent.agent);
        if (!match) return this._agentNotFound(intent.agent);

        this.context.lastAgent = match.agent;
        this.context.lastTopic = 'insights';

        const data = App.currentData;
        const analysis = App.currentAnalysis;
        const mgr = this._getAgentManager(match.agent);

        let r = `**Insights for ${match.agent}:**\n\n`;
        r += `Manager: **${mgr}** | Risk: **${match.riskScore}** (${match.riskLevel}) | Rank: #${match.originalRank}\n\n`;

        const findings = [];

        // Short calls insight
        if (match.shortCalls > 0 && analysis?.shortCalls?.stats) {
            const avg = analysis.shortCalls.stats.mean;
            const timesAvg = avg > 0 ? (match.shortCalls / avg).toFixed(1) : '0';
            if (match.shortCalls > avg * 1.5) {
                findings.push({ severity: 'high', text: `Short Calls (**${match.shortCalls}**) is ${timesAvg}x team average (${avg.toFixed(0)}). Needs call handling review.` });
            } else if (match.shortCalls > avg) {
                findings.push({ severity: 'medium', text: `Short Calls (${match.shortCalls}) is above team average (${avg.toFixed(0)}).` });
            } else {
                findings.push({ severity: 'good', text: `Short Calls (${match.shortCalls}) is within acceptable range.` });
            }
        }

        // RONA insight
        if (match.rona > 0 && analysis?.ronaTrend?.stats) {
            const avg = analysis.ronaTrend.stats.mean;
            const timesAvg = avg > 0 ? (match.rona / avg).toFixed(1) : '0';
            if (match.rona > avg * 2) {
                findings.push({ severity: 'high', text: `RONA (**${match.rona}**) is ${timesAvg}x team average (${avg.toFixed(1)}). Investigate availability.` });
            } else if (match.rona > avg) {
                findings.push({ severity: 'medium', text: `RONA (${match.rona}) is above team average (${avg.toFixed(1)}).` });
            } else {
                findings.push({ severity: 'good', text: `RONA (${match.rona}) is within acceptable range.` });
            }
        }

        // Email changes insight
        if (match.emailChanges > 0 && analysis?.emailChanges?.stats) {
            const avg = analysis.emailChanges.stats.mean;
            if (match.emailChanges > avg * 1.5) {
                findings.push({ severity: 'high', text: `Email Changes (**${match.emailChanges}**) significantly above average (${avg.toFixed(1)}). Audit recommended.` });
            } else {
                findings.push({ severity: 'good', text: `Email Changes (${match.emailChanges}) within normal range.` });
            }
        }

        // Aged cases insight
        if (match.agedCases > 0) {
            const agentCases = data?.age48hrs?.filter(c => c.caseOwner && c.caseOwner.toUpperCase().trim() === match.agent.toUpperCase().trim()) || [];
            const critCases = agentCases.filter(c => c.age > 96);
            if (critCases.length > 0) {
                findings.push({ severity: 'high', text: `Has **${critCases.length}** critically aged cases (>96 hrs). Immediate resolution needed.` });
            } else {
                findings.push({ severity: 'medium', text: `Has ${match.agedCases} aged cases. Monitor for SLA breaches.` });
            }
        }

        // Overall assessment
        const highFindings = findings.filter(f => f.severity === 'high');
        const medFindings = findings.filter(f => f.severity === 'medium');
        const goodFindings = findings.filter(f => f.severity === 'good');

        if (highFindings.length > 0) {
            r += `**Concerns:**\n`;
            highFindings.forEach(f => r += `- !! ${f.text}\n`);
            r += `\n`;
        }
        if (medFindings.length > 0) {
            r += `**Watch Areas:**\n`;
            medFindings.forEach(f => r += `- ! ${f.text}\n`);
            r += `\n`;
        }
        if (goodFindings.length > 0) {
            r += `**Good:**\n`;
            goodFindings.forEach(f => r += `- ${f.text}\n`);
            r += `\n`;
        }

        if (highFindings.length === 0 && medFindings.length === 0) {
            r += `**Overall:** ${match.agent} is performing well with no major concerns.\n`;
        } else if (highFindings.length >= 2) {
            r += `**Overall:** ${match.agent} has multiple critical issues. Coaching session recommended.\n`;
        }

        r += `\nSay "filter by ${match.agent}" to see only this agent's data on the dashboard.`;

        return r;
    },

    /**
     * Detect which tab the user wants to navigate to
     */
    _detectTab: function (q) {
        if (/case\s*record|record\s*type/.test(q)) return 'caseRecord';
        if (/proactive/.test(q)) return 'proactive';
        if (/age|48\s*hr|aged|aging|old\s*case/.test(q)) return 'age48';
        if (/email/.test(q)) return 'emailChanges';
        if (/short\s*call/.test(q)) return 'shortCalls';
        if (/rona/.test(q)) return 'rona';
        return null;
    },

    // === UNKNOWN ===
    handleUnknown: function (q) {
        // Try context-aware fallback
        if (this.context.lastAgent) {
            return `I'm not sure what you mean. Were you asking about **${this.context.lastAgent}**? Try:\n- "Tell me about ${this.context.lastAgent}"\n- "Risk score of ${this.context.lastAgent}"\n- "Short calls for ${this.context.lastAgent}"`;
        }

        return `I'm not sure how to answer that. Here are some things I can help with:\n\n- "Give me a summary"\n- "Who are the riskiest agents?"\n- "Under manager X, who is at most risk?"\n- "Tell me about [agent name]"\n- "How many critical cases?"\n- "Show me short calls stats"\n- "What improvements do you recommend?"\n\nType **help** for a complete list.`;
    },

    // ==================== UTILITY FUNCTIONS ====================

    _getRiskData: function () {
        return App.currentRiskData;
    },

    _noData: function () {
        return "No data available. Please load your JSON data first.";
    },

    _agentNotFound: function (name) {
        const riskData = this._getRiskData();
        if (riskData && riskData.rankings.length > 0) {
            const suggestions = riskData.rankings.slice(0, 5).map(r => r.agent);
            return `I couldn't find an agent matching "${name}". Available agents include: ${suggestions.join(', ')}... \n\nTry using the exact name from the leaderboard.`;
        }
        return `I couldn't find an agent matching "${name}".`;
    },

    _managerNotFound: function (name) {
        const managers = DataParser.getManagerStats();
        if (managers.length > 0) {
            return `I couldn't find a manager matching "${name}". Available managers: ${managers.map(m => m.manager).join(', ')}`;
        }
        return `I couldn't find a manager matching "${name}".`;
    },

    _findAgent: function (name) {
        const riskData = this._getRiskData();
        if (!riskData || !name) return null;
        return this._findInList(name, riskData.rankings, 'agent');
    },

    _findInList: function (name, list, key) {
        if (!name || !list || name.trim().length < 2) return null;
        const upper = name.toUpperCase().trim();

        // Exact match
        let match = list.find(r => (r[key] || '').toUpperCase().trim() === upper);
        if (match) return match;

        // Contains match (search name is inside agent name) - only if name is meaningful length
        if (upper.length >= 3) {
            match = list.find(r => (r[key] || '').toUpperCase().includes(upper));
            if (match) return match;
        }

        // Reverse contains (agent name is inside search name) - only for agent names >= 3 chars
        match = list.find(r => {
            const agentName = (r[key] || '').toUpperCase().trim();
            return agentName.length >= 3 && upper.includes(agentName);
        });
        if (match) return match;

        // Word match - only for words >= 3 chars matching agent names >= 3 chars
        const words = upper.split(/\s+/).filter(w => w.length >= 3);
        for (const word of words) {
            match = list.find(r => {
                const agentName = (r[key] || '').toUpperCase().trim();
                return agentName.length >= 3 && agentName.includes(word);
            });
            if (match) return match;
        }
        return null;
    },

    _findManager: function (name) {
        if (!name) return null;
        const stats = DataParser.getManagerStats();
        const upper = name.toUpperCase().trim();

        let match = stats.find(m => m.manager.toUpperCase().trim() === upper);
        if (match) return match;

        match = stats.find(m => m.manager.toUpperCase().includes(upper));
        if (match) return match;

        const words = upper.split(/\s+/).filter(w => w.length >= 3);
        for (const word of words) {
            match = stats.find(m => m.manager.toUpperCase().includes(word));
            if (match) return match;
        }
        return null;
    },

    _getAgentManager: function (agentName) {
        if (!agentName) return 'Unknown';
        const map = DataParser.buildAgentManagerMapping();
        if (map[agentName]) return map[agentName];
        const needle = agentName.trim().toUpperCase();
        for (const [key, val] of Object.entries(map)) {
            if (key.trim().toUpperCase() === needle) return val;
        }
        return 'Unknown';
    },

    extractNumber: function (q) {
        const match = q.match(/\b(\d+)\b/);
        return match ? parseInt(match[1]) : null;
    },

    extractAgentName: function (q) {
        const riskData = this._getRiskData();
        if (!riskData || !riskData.rankings.length) return null;

        // Remove common words to isolate the name
        const cleaned = q.replace(
            /\b(tell me about|info on|info about|info for|details? on|details? about|details? for|how is|doing|performing|what|who|the|risk|score|of|for|about|agent|show|me|get|find|check|status|short\s*calls?|rona|email|changes?|under|manager|compare|versus|vs|and|with|to|between|has|have|most|least|highest|lowest|best|worst|top|bottom|aged?\s*cases?|is|at|not|are|their|this|that|can|you|please|give|full|summary|overview|dashboard|overall|report|brief|quick|look|run|down|everything|big|picture|snapshot|insight|insights|filter|select|reset|clear|current|active|navigate|open|switch|go|tab|total|average|mean|team|stat|stats|all|list|count|number|how\s*many|percent|critical|high|medium|low|good|bad|poor|need|attention|concern|why|reason|recommend|improve|suggest|action|anomal|outlier|also|only|just|more|very|much|any|some|each|every|should|could|would|will|shall|may|might|must|been|being|was|were|did|does|do|had|having|its|own|same|than|too|now|then|here|there|when|where|which|while|both|but|nor|yet|so|because|since|before|after|during|above|below|from|into|through|until|upon|within|without)\b/gi, ' '
        ).replace(/\s+/g, ' ').trim();

        // If cleaned string is empty or too short after stop-word removal, no agent name found
        if (!cleaned || cleaned.length < 2) return null;

        // Try to match against known agents
        for (const r of riskData.rankings) {
            const agentUpper = r.agent.toUpperCase().trim();
            const cleanedUpper = cleaned.toUpperCase().trim();
            if (!cleanedUpper) continue;
            // Exact match
            if (cleanedUpper === agentUpper) return r.agent;
            // Cleaned contains agent name (only if agent name is >= 2 chars)
            if (agentUpper.length >= 2 && cleanedUpper.includes(agentUpper)) return r.agent;
            // Agent name contains cleaned (only if cleaned is >= 3 chars)
            if (cleanedUpper.length >= 3 && agentUpper.includes(cleanedUpper)) return r.agent;
        }

        // Partial word match - only for words >= 3 chars
        const words = cleaned.split(/\s+/).filter(w => w.length >= 3);
        for (const word of words) {
            const wordUpper = word.toUpperCase();
            for (const r of riskData.rankings) {
                if (r.agent.toUpperCase().trim().length >= 2 && r.agent.toUpperCase().includes(wordUpper)) return r.agent;
            }
        }

        return null;
    },

    _extractDateRange: function(q) {
        var months = { jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6, aug:7, august:7, sep:8, september:8, oct:9, october:9, nov:10, november:10, dec:11, december:11 };
        var now = new Date();
        var year = now.getFullYear();

        // "jan 2" or "january 2" or "2 jan" — specific date
        var m = q.match(/(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i);
        if (!m) m = q.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\b)/i);
        if (m) {
            var day, mon;
            if (/^\d/.test(m[1])) { day = parseInt(m[1]); mon = months[m[2].toLowerCase()]; }
            else { mon = months[m[1].toLowerCase()]; day = parseInt(m[2]); }
            if (mon !== undefined && day >= 1 && day <= 31) {
                var d = new Date(year, mon, day);
                var fmt = function(dt) { return dt.toISOString().split('T')[0]; };
                return { start: fmt(d), end: fmt(d), label: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) };
            }
        }

        // "january" or "jan" alone — whole month
        var mm = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i);
        if (mm) {
            var mon = months[mm[1].toLowerCase()];
            if (mon !== undefined) {
                var start = new Date(year, mon, 1);
                var end = new Date(year, mon + 1, 0);
                var fmt = function(dt) { return dt.toISOString().split('T')[0]; };
                return { start: fmt(start), end: fmt(end), label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
            }
        }

        // "2026-01-02" or "01/02/2026"
        var dm = q.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dm) {
            return { start: dm[0], end: dm[0], label: new Date(dm[0]).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) };
        }

        return null;
    },

    extractManagerName: function (q) {
        const managers = DataParser.getManagerStats();
        if (!managers.length) return null;

        // Check for exact manager name in the question
        for (const m of managers) {
            if (q.toUpperCase().includes(m.manager.toUpperCase())) return m.manager;
        }

        // Check for partial/word match (but only for meaningful words >= 3 chars)
        const words = q.split(/\s+/).filter(w => w.length >= 3);
        const skipWords = new Set(['the', 'who', 'are', 'under', 'manager', 'for', 'agent', 'risk', 'most', 'least', 'how', 'many', 'what', 'show', 'tell', 'about', 'info', 'detail', 'with', 'high', 'low', 'best', 'worst', 'not', 'performing', 'team', 'has', 'have', 'compare', 'and', 'short', 'call', 'calls', 'rona', 'email', 'aged', 'case', 'cases', 'focus', 'attention', 'concern', 'need', 'which', 'list', 'all', 'full', 'summary', 'overview', 'dashboard', 'overall', 'report', 'brief', 'quick', 'look', 'run', 'down', 'everything', 'big', 'picture', 'snapshot', 'insight', 'insights', 'filter', 'select', 'reset', 'clear', 'current', 'active', 'navigate', 'open', 'switch', 'tab', 'total', 'average', 'mean', 'stat', 'stats', 'count', 'number', 'percent', 'critical', 'medium', 'good', 'bad', 'poor', 'why', 'reason', 'recommend', 'improve', 'suggest', 'action', 'anomaly', 'outlier', 'also', 'only', 'just', 'more', 'very', 'much', 'any', 'some', 'each', 'every', 'should', 'could', 'would', 'will', 'shall', 'may', 'might', 'must', 'been', 'being', 'was', 'were', 'did', 'does', 'had', 'having', 'its', 'own', 'same', 'than', 'too', 'now', 'then', 'here', 'there', 'when', 'where', 'while', 'both', 'but', 'nor', 'yet', 'because', 'since', 'before', 'after', 'during', 'above', 'below', 'from', 'into', 'through', 'until', 'upon', 'within', 'without', 'give', 'please', 'can', 'you', 'this', 'that']);

        for (const word of words) {
            if (skipWords.has(word.toLowerCase())) continue;
            for (const m of managers) {
                if (m.manager.toUpperCase().includes(word.toUpperCase())) return m.manager;
            }
        }

        return null;
    },

    extractMultipleAgentNames: function (q) {
        const riskData = this._getRiskData();
        if (!riskData) return [];

        const agents = [];
        const parts = q.split(/\b(and|vs|versus|with|to|&)\b/i);

        for (const part of parts) {
            const cleaned = part.replace(/\b(compare|and|vs|versus|with|to|agent|between|difference|side|by)\b/gi, '').trim();
            if (cleaned.length < 2) continue;

            for (const r of riskData.rankings) {
                if (r.agent.toUpperCase().includes(cleaned.toUpperCase()) ||
                    cleaned.toUpperCase().includes(r.agent.toUpperCase())) {
                    if (!agents.includes(r.agent)) agents.push(r.agent);
                }
            }
        }
        return agents;
    },

    extractMultipleManagerNames: function (q) {
        const managers = DataParser.getManagerStats();
        if (!managers.length) return [];

        const found = [];
        const parts = q.split(/\b(and|vs|versus|with|to|&)\b/i);

        for (const part of parts) {
            for (const m of managers) {
                if (part.toUpperCase().includes(m.manager.toUpperCase())) {
                    if (!found.includes(m.manager)) found.push(m.manager);
                }
            }
        }
        return found;
    },

    handleAgentMetric: function(intent) {
        var data = App.currentData;
        if (!data) return this._noData();
        var match = this._findAgent(intent.agent);
        if (!match) return this._agentNotFound(intent.agent);
        this.context.lastAgent = match.agent;
        this.context.lastTopic = intent.metric;

        var agentName = match.agent;
        var nameUpper = agentName.toUpperCase().trim();
        var metric = intent.metric;
        var metricNames = { rona: 'RONA', shortCalls: 'Short Calls', emailChanges: 'Email Changes', agedCases: 'Aged Cases', cases: 'Total Cases' };

        var dateInfo = '';
        var startEl = document.getElementById('startDate');
        var endEl = document.getElementById('endDate');
        if (startEl && startEl.value && endEl && endEl.value) {
            dateInfo = ' (filtered: ' + startEl.value + ' to ' + endEl.value + ')';
        }

        var r = '**' + (metricNames[metric] || metric) + ' for ' + agentName + '**' + dateInfo + '\n\n';

        if (metric === 'rona' && data.ronaTrend) {
            var rows = data.ronaTrend.filter(function(row) { return row.agentName && row.agentName.toUpperCase().trim() === nameUpper; });
            var total = rows.reduce(function(s, row) { return s + (row.rona || 0); }, 0);
            r += '- Total RONA: **' + total + '**\n';
            r += '- Records: **' + rows.length + '**\n';
            if (rows.length > 0) {
                var avg = (total / rows.length).toFixed(1);
                r += '- Average per record: **' + avg + '**\n';
            }
            var teamTotal = data.ronaTrend.reduce(function(s, row) { return s + (row.rona || 0); }, 0);
            var teamAvg = data.ronaTrend.length ? (teamTotal / data.ronaTrend.length).toFixed(1) : 0;
            r += '- Team average: **' + teamAvg + '** per agent\n';
            r += total > teamAvg * 1.5 ? '\n⚠️ **Above team average** — needs attention' : '\n✅ Within normal range';
        } else if (metric === 'shortCalls' && data.shortCalls) {
            var rows = data.shortCalls.filter(function(row) { return row.agentName && row.agentName.toUpperCase().trim() === nameUpper; });
            var total = rows.reduce(function(s, row) { return s + (row.count || 0); }, 0);
            r += '- Total Short Calls: **' + total + '**\n';
            var teamTotal = data.shortCalls.reduce(function(s, row) { return s + (row.count || 0); }, 0);
            var teamAvg = data.shortCalls.length ? (teamTotal / data.shortCalls.length).toFixed(0) : 0;
            r += '- Team average: **' + teamAvg + '** per agent\n';
            r += total > teamAvg * 1.5 ? '\n⚠️ **Above team average**' : '\n✅ Within normal range';
        } else if (metric === 'emailChanges' && data.emailChanges) {
            var rows = data.emailChanges.filter(function(row) { return row.editedBy && row.editedBy.toUpperCase().trim() === nameUpper; });
            r += '- Total Email Changes: **' + rows.length + '**\n';
            if (rows.length > 0) {
                var types = {};
                rows.forEach(function(row) { var t = row.changeType || 'Unknown'; types[t] = (types[t] || 0) + 1; });
                r += '- By type:\n';
                Object.entries(types).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(e) { r += '  - ' + e[0] + ': **' + e[1] + '**\n'; });
            }
        } else if (metric === 'agedCases' && data.age48hrs) {
            var rows = data.age48hrs.filter(function(row) { return row.caseOwner && row.caseOwner.toUpperCase().trim() === nameUpper; });
            var aged = rows.filter(function(row) { return row.age > 48; });
            var critical = rows.filter(function(row) { return row.age > 96; });
            r += '- Total cases in age tracking: **' + rows.length + '**\n';
            r += '- Aged (>48hrs): **' + aged.length + '**\n';
            r += '- Critical (>96hrs): **' + critical.length + '**\n';
            if (critical.length > 0) {
                r += '\n**Critical cases:**\n';
                critical.sort(function(a, b) { return b.age - a.age; }).slice(0, 5).forEach(function(c) {
                    r += '- Case ' + c.caseNumber + ': **' + c.age.toFixed(0) + ' hrs**\n';
                });
            }
        } else if (metric === 'cases' && data.caseRecordType) {
            var rows = data.caseRecordType.filter(function(row) { return row.caseOwner && row.caseOwner.toUpperCase().trim() === nameUpper; });
            r += '- Total Cases: **' + rows.length + '**\n';
            if (rows.length > 0) {
                var types = {};
                rows.forEach(function(row) { var t = row.recordType || 'Unknown'; types[t] = (types[t] || 0) + 1; });
                r += '- By type:\n';
                Object.entries(types).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(e) { r += '  - ' + e[0] + ': **' + e[1] + '**\n'; });
            }
        } else {
            r += 'No data found for this metric.';
        }

        return r;
    },

    handleThemeSwitch: function(intent) {
        return "This dashboard runs in light mode only.";
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Chatbot.init();
});

// Export for global access
window.Chatbot = Chatbot;
