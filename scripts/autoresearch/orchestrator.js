'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var ROOT = path.resolve(__dirname, '..', '..');
var EVAL_SCRIPT_PATH = path.join(ROOT, 'scripts', 'evaluate_pipeline_wrapper.js');
var REPORT_DIR = path.join(ROOT, 'reports', 'autoresearch');
var RUNS_DIR = path.join(REPORT_DIR, 'runs');
var TASKS_DIR = path.join(REPORT_DIR, 'tasks');
var LAST_EVAL_PATH = path.join(REPORT_DIR, 'last_eval.json');
var HISTORY_PATH = path.join(REPORT_DIR, 'history.jsonl');
var LAST_ORCHESTRATION_PATH = path.join(REPORT_DIR, 'last_orchestration.json');
var CONFIG_PATH = path.join(ROOT, 'docs', 'llm', 'autoresearch', 'runtime', 'config.json');

function main() {
    var config = loadConfig();
    ensureDir(REPORT_DIR);
    ensureDir(RUNS_DIR);
    ensureDir(TASKS_DIR);

    runEvaluation();

    var metrics = readJson(LAST_EVAL_PATH);
    var methodCatalog = loadMethodCatalog(config.methodCatalogPath);
    var runId = buildRunId();
    var runDir = path.join(RUNS_DIR, runId);
    ensureDir(runDir);

    var decisions = buildDecisions(metrics, config);
    var nextTaskHint = pickNextTaskHint(metrics, config);
    var tasks = buildTasks(metrics, decisions, config, methodCatalog, nextTaskHint);
    var artifacts = writeTaskArtifacts(tasks, runDir);

    var plan = {
        runId: runId,
        generatedAt: new Date().toISOString(),
        metricsSnapshot: buildMetricsSnapshot(metrics),
        targets: config.targets,
        decisions: decisions,
        nextTaskHint: nextTaskHint,
        tasks: tasks,
        artifacts: artifacts
    };

    writeJson(path.join(runDir, 'run_plan.json'), plan);
    writeText(path.join(runDir, 'orchestrator_brief.md'), buildOrchestratorBrief(plan));
    writeJson(LAST_ORCHESTRATION_PATH, plan);
    appendHistory(plan);

    var dispatchResult = dispatchMethods(tasks, artifacts, config);
    writeJson(path.join(runDir, 'dispatch_result.json'), dispatchResult);

    console.log('[autoresearch] run=' + runId);
    console.log('[autoresearch] objective=' + formatNum(metrics.objectiveScore, 4));
    console.log('[autoresearch] tasks=' + tasks.length + ', method_jobs=' + dispatchResult.totalJobs + ', dispatched=' + dispatchResult.dispatchedCount);
    console.log('[autoresearch] next_task=' + nextTaskHint.id + ' (gap=' + formatNum(nextTaskHint.gap, 4) + ')');
    console.log('[autoresearch] plan=' + path.join(runDir, 'run_plan.json'));
}

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error('Missing config: ' + CONFIG_PATH);
    }

    var raw = readJson(CONFIG_PATH);
    return {
        targets: {
            speechRecall: toNumber(raw.targets && raw.targets.speechRecall, 0.93),
            reviewRecall: toNumber(raw.targets && raw.targets.reviewRecall, 0.20),
            ignoreRecall: toNumber(raw.targets && raw.targets.ignoreRecall, 0.94),
            durationGoodOrNearRatio: toNumber(raw.targets && raw.targets.durationGoodOrNearRatio, 0.70),
            objectiveScore: toNumber(raw.targets && raw.targets.objectiveScore, 0.82)
        },
        maxDelegatedTasks: Math.max(1, toInt(raw.maxDelegatedTasks, 3)),
        maxMethodsPerTask: Math.max(1, toInt(raw.maxMethodsPerTask, 2)),
        methodCatalogPath: resolveRootPath(String(raw.methodCatalogPath || 'docs/llm/autoresearch/runtime/method_catalog.json')),
        autoDispatch: !!raw.autoDispatch,
        agentCommandTemplate: String(raw.agentCommandTemplate || '')
    };
}

function loadMethodCatalog(catalogPath) {
    if (!fs.existsSync(catalogPath)) {
        throw new Error('Method catalog not found: ' + catalogPath);
    }
    var catalog = readJson(catalogPath);
    return ensureObject(catalog);
}

function runEvaluation() {
    var res = childProcess.spawnSync(process.execPath, [EVAL_SCRIPT_PATH], {
        cwd: ROOT,
        encoding: 'utf8'
    });
    if (res.status !== 0) {
        throw new Error('evaluate_pipeline failed: ' + (res.stderr || res.stdout || 'unknown error'));
    }
}

function buildDecisions(metrics, config) {
    var decisions = [];
    var recall = ensureObject(metrics.recall);
    var duration = ensureObject(metrics.durationQuality);
    var targets = config.targets;

    if (toNumber(recall.speech, 0) < targets.speechRecall) decisions.push('speech_recall_below_target');
    if (toNumber(recall.review, 0) < targets.reviewRecall) decisions.push('review_recall_below_target');
    if (toNumber(recall.ignore, 0) < targets.ignoreRecall) decisions.push('ignore_recall_below_target');
    if (toNumber(duration.goodOrNearRatio, 0) < targets.durationGoodOrNearRatio) decisions.push('duration_quality_below_target');
    if (toNumber(metrics.objectiveScore, 0) < targets.objectiveScore) decisions.push('objective_below_target');

    if (decisions.length === 0) {
        decisions.push('all_targets_met_keep_hardening');
    }
    return decisions;
}

function pickNextTaskHint(metrics, config) {
    var gaps = [
        { id: 'review_recall', gap: Math.max(0, config.targets.reviewRecall - toNumber(metrics.recall && metrics.recall.review, 0)) },
        { id: 'duration_quality', gap: Math.max(0, config.targets.durationGoodOrNearRatio - toNumber(metrics.durationQuality && metrics.durationQuality.goodOrNearRatio, 0)) },
        { id: 'speech_recall', gap: Math.max(0, config.targets.speechRecall - toNumber(metrics.recall && metrics.recall.speech, 0)) },
        { id: 'ignore_recall', gap: Math.max(0, config.targets.ignoreRecall - toNumber(metrics.recall && metrics.recall.ignore, 0)) },
        { id: 'objective', gap: Math.max(0, config.targets.objectiveScore - toNumber(metrics.objectiveScore, 0)) }
    ];

    gaps.sort(function (a, b) {
        if (a.gap !== b.gap) return b.gap - a.gap;
        return a.id < b.id ? -1 : 1;
    });

    return gaps[0];
}

function buildTasks(metrics, decisions, config, methodCatalog, nextTaskHint) {
    var tasks = [];

    if (hasDecision(decisions, 'review_recall_below_target')) {
        tasks.push(makeTask('review-calibrator', 'Improve review recall without hurting speech recall', 1, [
            'Apply at least one code change in preview decision logic.',
            'Try at least two distinct methods from catalog and compare outcomes.',
            'Keep speech recall regression under 1.5 percentage points.'
        ], metrics, methodCatalog, config.maxMethodsPerTask));
    }

    if (hasDecision(decisions, 'duration_quality_below_target')) {
        tasks.push(makeTask('duration-specialist', 'Improve segment duration approximation quality (good/near ratio)', 1, [
            'Change padding/merge behavior in code, not only parameter logs.',
            'Test multiple strategies and report duration-quality deltas.',
            'Preserve overall objective while lifting duration good/near ratio.'
        ], metrics, methodCatalog, config.maxMethodsPerTask));
    }

    if (hasDecision(decisions, 'ignore_recall_below_target')) {
        tasks.push(makeTask('silence-pruner', 'Increase ignore recall by reducing false positive speech spans', 2, [
            'Adjust suppression behavior in overlap/noise-sensitive regions.',
            'Prove no major speech recall collapse via evaluation.'
        ], metrics, methodCatalog, config.maxMethodsPerTask));
    }

    if (hasDecision(decisions, 'speech_recall_below_target')) {
        tasks.push(makeTask('speech-retainer', 'Recover missed speech while preserving precision', 2, [
            'Tune VAD/continuity to recover quiet valid speech.',
            'Avoid broad relaxations that inflate false positives.'
        ], metrics, methodCatalog, config.maxMethodsPerTask));
    }

    tasks.push(makeTask('validator', 'Validate candidates and accept only objective-improving code', 3, [
        'Run `npm run check` and evaluator for each candidate.',
        'Reject patches with lower objective or unstable recalls.'
    ], metrics, methodCatalog, 1));

    tasks.sort(function (a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.agent < b.agent ? -1 : 1;
    });

    var sliced = tasks.slice(0, Math.max(tasks.length, config.maxDelegatedTasks + 1));
    prioritizeHintAgent(sliced, nextTaskHint);
    return sliced;
}

function prioritizeHintAgent(tasks, hint) {
    var preferred = mapHintToAgent(hint && hint.id);
    if (!preferred) return;

    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].agent === preferred) {
            tasks[i].priority = 0;
        }
    }

    tasks.sort(function (a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.agent < b.agent ? -1 : 1;
    });
}

function mapHintToAgent(hintId) {
    if (hintId === 'review_recall') return 'review-calibrator';
    if (hintId === 'duration_quality') return 'duration-specialist';
    if (hintId === 'speech_recall') return 'speech-retainer';
    if (hintId === 'ignore_recall') return 'silence-pruner';
    if (hintId === 'objective') return 'validator';
    return null;
}

function makeTask(agent, goal, priority, actions, metrics, methodCatalog, maxMethodsPerTask) {
    var id = agent + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    var methods = selectMethods(methodCatalog, agent, maxMethodsPerTask);

    return {
        id: id,
        agent: agent,
        goal: goal,
        priority: priority,
        actions: actions,
        methods: methods,
        context: {
            objectiveScore: toNumber(metrics.objectiveScore, 0),
            speechRecall: toNumber(metrics.recall && metrics.recall.speech, 0),
            reviewRecall: toNumber(metrics.recall && metrics.recall.review, 0),
            ignoreRecall: toNumber(metrics.recall && metrics.recall.ignore, 0),
            durationGoodOrNearRatio: toNumber(metrics.durationQuality && metrics.durationQuality.goodOrNearRatio, 0)
        }
    };
}

function selectMethods(methodCatalog, agent, maxMethodsPerTask) {
    var methods = methodCatalog[agent];
    if (!Array.isArray(methods) || methods.length === 0) {
        return [{
            id: 'generic_patch',
            title: 'Generic targeted patch',
            hypothesis: 'A focused code patch can improve current weakest metric.',
            codeScope: ['packages/analyzer/src/defaults/analyzer_defaults.js'],
            editStrategy: ['Make one small measurable code change and evaluate.']
        }];
    }
    return methods.slice(0, Math.max(1, maxMethodsPerTask));
}

function writeTaskArtifacts(tasks, runDir) {
    var artifacts = {
        tasks: {},
        methodQueue: []
    };

    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        var taskFileName = (i + 1) + '_' + sanitizeName(task.agent) + '.md';
        var runTaskPath = path.join(runDir, taskFileName);
        var latestTaskPath = path.join(TASKS_DIR, taskFileName);

        writeText(runTaskPath, buildTaskBrief(task));
        writeText(latestTaskPath, buildTaskBrief(task));

        var methodFiles = [];
        for (var m = 0; m < task.methods.length; m++) {
            var method = task.methods[m];
            var methodFileName = (i + 1) + '_' + sanitizeName(task.agent) + '_method_' + (m + 1) + '_' + sanitizeName(method.id) + '.md';
            var runMethodPath = path.join(runDir, methodFileName);
            var latestMethodPath = path.join(TASKS_DIR, methodFileName);

            writeText(runMethodPath, buildMethodBrief(task, method));
            writeText(latestMethodPath, buildMethodBrief(task, method));

            methodFiles.push({
                methodId: method.id,
                runPath: runMethodPath,
                latestPath: latestMethodPath
            });

            artifacts.methodQueue.push({
                taskId: task.id,
                taskAgent: task.agent,
                methodId: method.id,
                methodTitle: method.title,
                promptFile: runMethodPath
            });
        }

        artifacts.tasks[task.id] = {
            runPath: runTaskPath,
            latestPath: latestTaskPath,
            methodFiles: methodFiles
        };
    }

    writeJson(path.join(runDir, 'method_queue.json'), artifacts.methodQueue);
    return artifacts;
}

function buildTaskBrief(task) {
    var lines = [];
    lines.push('# Task Brief: ' + task.agent);
    lines.push('');
    lines.push('## Goal');
    lines.push(task.goal);
    lines.push('');
    lines.push('## Priority');
    lines.push(String(task.priority));
    lines.push('');
    lines.push('## Current Metrics');
    lines.push('- objectiveScore: ' + formatNum(task.context.objectiveScore, 4));
    lines.push('- speechRecall: ' + formatNum(task.context.speechRecall, 4));
    lines.push('- reviewRecall: ' + formatNum(task.context.reviewRecall, 4));
    lines.push('- ignoreRecall: ' + formatNum(task.context.ignoreRecall, 4));
    lines.push('- durationGoodOrNearRatio: ' + formatNum(task.context.durationGoodOrNearRatio, 4));
    lines.push('');
    lines.push('## Required Actions');
    for (var i = 0; i < task.actions.length; i++) {
        lines.push((i + 1) + '. ' + task.actions[i]);
    }
    lines.push('');
    lines.push('## Methods To Try');
    for (i = 0; i < task.methods.length; i++) {
        lines.push((i + 1) + '. ' + task.methods[i].id + ' - ' + task.methods[i].title);
    }
    lines.push('');
    lines.push('## Guardrails');
    lines.push('1. Apply real code edits, not only metric comments.');
    lines.push('2. Keep runtime entry points stable.');
    lines.push('3. No dual-path legacy fallback without hard reason.');
    lines.push('4. End with `npm run check` and `node scripts/evaluate_pipeline.js`.');
    lines.push('5. Report before/after objective + recalls + duration ratio.');
    lines.push('');
    return lines.join('\n');
}

function buildMethodBrief(task, method) {
    var lines = [];
    lines.push('# Method Trial: ' + method.id);
    lines.push('');
    lines.push('## Parent Task');
    lines.push('- agent: ' + task.agent);
    lines.push('- goal: ' + task.goal);
    lines.push('');
    lines.push('## Method');
    lines.push('- title: ' + method.title);
    lines.push('- hypothesis: ' + method.hypothesis);
    lines.push('');
    lines.push('## Code Scope');
    for (var i = 0; i < (method.codeScope || []).length; i++) {
        lines.push('- ' + method.codeScope[i]);
    }
    lines.push('');
    lines.push('## Edit Strategy');
    for (i = 0; i < (method.editStrategy || []).length; i++) {
        lines.push((i + 1) + '. ' + method.editStrategy[i]);
    }
    lines.push('');
    lines.push('## Required Runbook');
    lines.push('1. Implement one focused patch for this method.');
    lines.push('2. Run `npm run check`.');
    lines.push('3. Run `node scripts/evaluate_pipeline.js`.');
    lines.push('4. Output a short report: changed files, metric deltas, keep/reject recommendation.');
    lines.push('');
    return lines.join('\n');
}

function buildOrchestratorBrief(plan) {
    var lines = [];
    lines.push('# Autoresearch Orchestrator Brief');
    lines.push('');
    lines.push('Run: `' + plan.runId + '`');
    lines.push('');
    lines.push('## Next Best Task Hint');
    lines.push('- id: ' + plan.nextTaskHint.id);
    lines.push('- gap: ' + formatNum(plan.nextTaskHint.gap, 4));
    lines.push('');
    lines.push('## Metrics Snapshot');
    lines.push('- objectiveScore: ' + formatNum(plan.metricsSnapshot.objectiveScore, 4));
    lines.push('- speechRecall: ' + formatNum(plan.metricsSnapshot.speechRecall, 4));
    lines.push('- reviewRecall: ' + formatNum(plan.metricsSnapshot.reviewRecall, 4));
    lines.push('- ignoreRecall: ' + formatNum(plan.metricsSnapshot.ignoreRecall, 4));
    lines.push('- durationGoodOrNearRatio: ' + formatNum(plan.metricsSnapshot.durationGoodOrNearRatio, 4));
    lines.push('');
    lines.push('## Decisions');
    for (var i = 0; i < plan.decisions.length; i++) {
        lines.push('- ' + plan.decisions[i]);
    }
    lines.push('');
    lines.push('## Delegation');
    for (i = 0; i < plan.tasks.length; i++) {
        var task = plan.tasks[i];
        lines.push((i + 1) + '. ' + task.agent + ' - ' + task.goal + ' (' + task.methods.length + ' methods)');
    }
    lines.push('');
    return lines.join('\n');
}

function dispatchMethods(tasks, artifacts, config) {
    var result = {
        totalJobs: artifacts.methodQueue.length,
        dispatchedCount: 0,
        attempted: []
    };

    if (!config.autoDispatch || !config.agentCommandTemplate) {
        return result;
    }

    var allowedAgents = {};
    var limit = Math.min(config.maxDelegatedTasks, tasks.length);
    for (var i = 0; i < limit; i++) {
        allowedAgents[tasks[i].agent] = true;
    }

    for (i = 0; i < artifacts.methodQueue.length; i++) {
        var job = artifacts.methodQueue[i];
        if (!allowedAgents[job.taskAgent]) continue;

        var command = renderCommandTemplate(config.agentCommandTemplate, {
            prompt_file: quoteForShell(job.promptFile),
            repo_root: quoteForShell(ROOT),
            task_agent: job.taskAgent,
            method_id: job.methodId,
            method_title: quoteForShell(job.methodTitle)
        });

        var run = childProcess.spawnSync(command, {
            cwd: ROOT,
            shell: true,
            encoding: 'utf8'
        });

        result.attempted.push({
            taskAgent: job.taskAgent,
            methodId: job.methodId,
            command: command,
            status: run.status,
            stdout: trimOutput(run.stdout),
            stderr: trimOutput(run.stderr)
        });

        if (run.status === 0) result.dispatchedCount++;
    }

    return result;
}

function renderCommandTemplate(template, values) {
    var rendered = String(template || '');
    var keys = Object.keys(values);
    for (var i = 0; i < keys.length; i++) {
        var token = '{' + keys[i] + '}';
        rendered = rendered.split(token).join(values[keys[i]]);
    }
    return rendered;
}

function appendHistory(plan) {
    var entry = {
        runId: plan.runId,
        generatedAt: plan.generatedAt,
        objectiveScore: plan.metricsSnapshot.objectiveScore,
        speechRecall: plan.metricsSnapshot.speechRecall,
        reviewRecall: plan.metricsSnapshot.reviewRecall,
        ignoreRecall: plan.metricsSnapshot.ignoreRecall,
        durationGoodOrNearRatio: plan.metricsSnapshot.durationGoodOrNearRatio,
        decisions: plan.decisions,
        nextTaskHint: plan.nextTaskHint,
        tasks: mapTaskAgents(plan.tasks)
    };
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

function buildMetricsSnapshot(metrics) {
    return {
        objectiveScore: toNumber(metrics.objectiveScore, 0),
        speechRecall: toNumber(metrics.recall && metrics.recall.speech, 0),
        reviewRecall: toNumber(metrics.recall && metrics.recall.review, 0),
        ignoreRecall: toNumber(metrics.recall && metrics.recall.ignore, 0),
        durationGoodOrNearRatio: toNumber(metrics.durationQuality && metrics.durationQuality.goodOrNearRatio, 0)
    };
}

function mapTaskAgents(tasks) {
    var out = [];
    for (var i = 0; i < tasks.length; i++) {
        out.push({
            agent: tasks[i].agent,
            goal: tasks[i].goal,
            priority: tasks[i].priority,
            methodIds: (tasks[i].methods || []).map(function (m) { return m.id; })
        });
    }
    return out;
}

function hasDecision(decisions, value) {
    for (var i = 0; i < decisions.length; i++) {
        if (decisions[i] === value) return true;
    }
    return false;
}

function resolveRootPath(relOrAbs) {
    if (!relOrAbs) return ROOT;
    if (path.isAbsolute(relOrAbs)) return relOrAbs;
    return path.join(ROOT, relOrAbs);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
    writeText(filePath, JSON.stringify(payload, null, 2));
}

function writeText(filePath, content) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf8');
}

function ensureDir(dirPath) {
    if (fs.existsSync(dirPath)) return;
    fs.mkdirSync(dirPath, { recursive: true });
}

function buildRunId() {
    var now = new Date();
    return '' +
        now.getUTCFullYear() +
        pad2(now.getUTCMonth() + 1) +
        pad2(now.getUTCDate()) +
        '_' +
        pad2(now.getUTCHours()) +
        pad2(now.getUTCMinutes()) +
        pad2(now.getUTCSeconds());
}

function pad2(value) {
    return value < 10 ? '0' + value : String(value);
}

function sanitizeName(value) {
    return String(value || 'task').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

function formatNum(value, digits) {
    return toNumber(value, 0).toFixed(digits || 2);
}

function toNumber(value, fallback) {
    var parsed = parseFloat(value);
    return isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback) {
    var parsed = parseInt(value, 10);
    return isFinite(parsed) ? parsed : fallback;
}

function ensureObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function quoteForShell(text) {
    return '"' + String(text).replace(/"/g, '\\"') + '"';
}

function trimOutput(text) {
    if (!text) return '';
    var out = String(text).trim();
    if (out.length > 1500) return out.slice(0, 1500);
    return out;
}

main();
