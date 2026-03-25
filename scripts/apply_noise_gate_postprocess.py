#!/usr/bin/env python3
"""
Noise Gate Postprocess Script für AutoCast
Identifiziert kurze 'ignore' Segmente zwischen Sprachpassagen als Bleed/Noise
"""
import json
import sys

def apply_noise_gate_optimization(segments):
    """Transformiert kurze ignore Segmente zu review für strikteres Noise-Gate Pruning"""
    
    modifications = []
    
    for seg in segments:
        duration = seg["duration"]
        content_type = seg["contentType"]
        track_name = seg["trackName"]
        start = seg["start"]
        
        # Kurze ignore Segmente (<1.5s) zwischen Sprachpassagen
        if content_type == "ignore" and duration < 1.5:
            # Finde benachbarte Segmente
            seg["contentType"] = "review"
            modifications.append({
                "track": track_name,
                "start": start,
                "duration": duration,
                "change": "ignore -> review (kurzes Segment, <1.5s)"
            })
            
        # Sehr kurze Segmente (<0.6s) als potentielles Noise
        if content_type == "ignore" and duration < 0.6:
            seg["contentType"] = "review"
            modifications.append({
                "track": track_name,
                "start": start,
                "duration": duration,
                "change": "ignore -> review (Noise-Verdacht, <0.6s)"
            })
    
    return segments, modifications

if __name__ == "__main__":
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    with open(input_file, 'r') as f:
        segments = json.load(f)
    
    segments, mods = apply_noise_gate_optimization(segments)
    
    with open(output_file, 'w') as f:
        json.dump(segments, f, indent=2)
    
    print(f"Applied {len(mods)} modifications")
    for m in mods[:10]:
        print(f"  {m['track']} @ {m['start']:.2f}s ({m['duration']:.2f}s): {m['change']}")
