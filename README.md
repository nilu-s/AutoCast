# AutoCast

**Automatic podcast multi-track ducking plugin for Adobe Premiere Pro.**

AutoCast analyzes your multi-track podcast recordings and automatically ducks inactive speakers, so only the person currently talking is at full volume – with smooth crossfades and room tone preservation.

## Features

- **Automatic Voice Activity Detection** – Per-track RMS/VAD analysis with adaptive noise floor
- **Smart Ducking** – Volume-automation keyframes (not destructive cuts)
- **Bleed Rejection** – Handles same-room recordings with microphone crosstalk
- **Overlap Handling** – Configurable policy: dominant speaker wins or all stay active
- **Crossfades** – Smooth ramps (5–200ms) to avoid hard cuts
- **Room Tone Preservation** – Inactive tracks at -24dB (not muted) for natural sound
- **Preview Markers** – See detected speaker changes on the timeline before committing
- **Full Reset** – Remove all AutoCast keyframes with one click
- **Zero Dependencies** – Single `.zxp` file, nothing to install

## Requirements

- Adobe Premiere Pro CC 2021 or later (v15.0+)
- Windows 10/11 or macOS 10.14+

## Installation

### Development / Debug Mode

1. Enable unsigned extensions (one-time setup):
   - **Windows:** Open Registry Editor, navigate to `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.11` and set `PlayerDebugMode` to `1`
   - **macOS:** Run `defaults write com.adobe.CSXS.11 PlayerDebugMode 1`

2. Symlink or copy the `AutoCast` folder to your extensions directory:
   - **Windows:** `C:\Users\<user>\AppData\Roaming\Adobe\CEP\extensions\AutoCast`
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/AutoCast`

3. Restart Premiere Pro

4. Open: `Window > Extensions > AutoCast`

### Production

Install the `.zxp` file via [ZXP Installer](https://zxpinstaller.com/) or [Anastasiy's Extension Manager](https://install.anastasiy.com/).

## Usage

1. Open your podcast sequence with one audio track per speaker
2. Open `Window > Extensions > AutoCast`
3. Click **Load Tracks** to read from the active sequence
4. Adjust parameters or use defaults
5. Click **Analyze** to detect speaker activity
6. Click **Preview Markers** to inspect the detected segments (optional)
7. Click **Apply Edits** to generate volume keyframes
8. Fine-tune manually as needed

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Sensitivity | 12 dB | Threshold above noise floor. Higher = more aggressive gating |
| Hold Time | 500 ms | Minimum time gate stays open (prevents pumping) |
| Min Segment | 300 ms | Segments shorter than this are filtered out |
| Ducking Level | -24 dB | Volume of inactive tracks (not silent = room tone) |
| Crossfade | 30 ms | Ramp time for ducking transitions |
| Overlap Policy | Dominant Wins | How to handle two speakers at once |

## Development

### Project Structure

```
AutoCast/
├── CSXS/manifest.xml        # CEP configuration
├── index.html                # Panel UI
├── css/styles.css            # Dark-mode Adobe theme
├── js/
│   ├── main.js               # UI controller
│   ├── csi_bridge.js         # ExtendScript bridge
│   └── mock_csi.js           # Browser mock layer
├── jsx/
│   ├── host.jsx              # ExtendScript dispatcher
│   ├── get_track_info.jsx    # Read sequence info
│   ├── apply_keyframes.jsx   # Volume automation
│   └── apply_markers.jsx     # Timeline markers
├── node/
│   ├── analyzer.js           # Analysis pipeline
│   ├── wav_reader.js         # WAV file parser
│   ├── rms_calculator.js     # RMS energy
│   ├── vad_gate.js           # Voice activity detection
│   ├── segment_builder.js    # Segment builder
│   └── overlap_resolver.js   # Overlap resolution
└── test/
    ├── run_all_tests.js      # Test runner
    ├── generate_test_wav.js   # Synthetic WAV generator
    └── test_*.js             # Unit & E2E tests
```

### Testing Without Premiere Pro

**~80% of the plugin is testable without Premiere:**

```bash
# Run all tests (WAV, RMS, VAD, segmentation, overlap, E2E)
node test/run_all_tests.js

# Generate test WAV files
node test/generate_test_wav.js

# CLI analysis
node node/analyzer.js --tracks test/test_data/track_a_host.wav test/test_data/track_b_guest1.wav --output result.json

# UI in browser: just open index.html in Chrome (mock mode auto-activates)
```

### Debugging

- Chrome DevTools: navigate to `localhost:8088` while Premiere is running
- Console logs from both Node.js and JSX are visible in DevTools
- Set `PlayerDebugMode` to `1` in registry/defaults (see Installation)

## Known Limitations

- Clips should ideally be continuous per track (one clip per speaker per track)
- Analysis reads the original media files directly (must be WAV format)
- ExtendScript keyframe application is the performance bottleneck (~30-90s for 60min × 3 tracks)

## License

MIT
