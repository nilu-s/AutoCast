# Test Fixtures for Analyzer

This directory contains categorized, static test data for the AutoCast analyzer. Unlike the dynamically generated `test_data`, these fixtures are intended to be persistent real-world or specifically tailored samples to verify analyzer behavior across different acoustic scenarios.

## Structure

- **`audio/`**: Categorized WAV samples.
  - `clean_speech/`: High-quality, noise-free mono speech.
  - `laughter/`: Pure laughter bursts.
  - `bleed/`: Samples featuring significant microphone bleed from other speakers.
  - `noise/`: Baseline noise profiles (HVAC, street noise, etc.).
- **`metadata/`**: JSON files defining test cases, expected results, and thresholds for the samples in `audio/`.
- **`ground_truth/`**: Reference analysis results (e.g., spectral fingerprints or segment lists) used for regression testing.

## Usage

Test suites should reference samples via relative paths from this directory. 
Example (integration test):
```javascript
var fixtures = require('../fixtures/metadata/review_cases.json');
// ... iterate and test ...
```
