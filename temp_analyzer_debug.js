// temp_analyzer_debug.js
'use strict';

var path = require('path');
var fs = require('fs');
var analyzer = require('./node/analyzer');
var wavReader = require('./node/wav_reader');
var rmsCalc = require('./node/rms_calculator');
var gainNormalizer = require('./node/gain_normalizer');
var vadGate = require('./node/vad_gate');
var spectralVad = require('./node/spectral_vad');
var segmentBuilder = require('./node/segment_builder');

// Nutze die gleichen Tracks wie der User in Premiere (falls wir Pfade wüssten).
// Da wir sie nicht wissen, machen wir einen Trockenlauf auf den vorhandenen Test-WAVs,
// oder wir bauen einen "Sniffer" in analyzer.js ein.

// Am besten wir modifizieren analyzer.js kurzfristig, um detaillierte Logs für
// JEDEN Track in JEDEM Schritt auszugeben.
