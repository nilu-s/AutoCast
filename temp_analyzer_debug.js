// temp_analyzer_debug.js
'use strict';

var path = require('path');
var fs = require('fs');
var analyzer = require('./packages/analyzer/src/analyzer');
var wavReader = require('./packages/analyzer/src/wav_reader');
var rmsCalc = require('./packages/analyzer/src/rms_calculator');
var gainNormalizer = require('./packages/analyzer/src/gain_normalizer');
var vadGate = require('./packages/analyzer/src/vad_gate');
var spectralVad = require('./packages/analyzer/src/spectral_vad');
var segmentBuilder = require('./packages/analyzer/src/segment_builder');

// Nutze die gleichen Tracks wie der User in Premiere (falls wir Pfade wüssten).
// Da wir sie nicht wissen, machen wir einen Trockenlauf auf den vorhandenen Test-WAVs,
// oder wir bauen einen "Sniffer" in analyzer.js ein.

// Am besten wir modifizieren analyzer.js kurzfristig, um detaillierte Logs für
// JEDEN Track in JEDEM Schritt auszugeben.
