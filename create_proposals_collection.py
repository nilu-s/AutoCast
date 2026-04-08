#!/usr/bin/env python3
"""Create proposals collection for L3 Proactive Generation.

Die proposals Collection speichert neue Methoden-Vorschläge
mit Status pending_review. Nur approved proposals werden zu methods.

Usage:
    python create_proposals_collection.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

# Add workspace to path
workspace_root = Path(__file__).parent
sys.path.insert(0, str(workspace_root))

from learning.chroma_client import ChromaLearningDB


def create_proposals_collection(db: ChromaLearningDB) -> bool:
    """Create proposals collection for storing generated method suggestions.
    
    Returns:
        True if successful
    """
    print("\n=== Creating Proposals Collection ===")
    
    try:
        # Try to delete existing collection if it exists
        try:
            db.client.delete_collection("proposals")
            print("  🗑️  Deleted existing 'proposals' collection")
        except Exception:
            pass
        
        # Create fresh collection
        proposals_coll = db.client.create_collection(
            name="proposals",
            metadata={
                "description": "Generated method proposals awaiting human review",
                "status_values": "pending_review,approved,rejected",
                "parent_collection": "methods"
            }
        )
        print("  ✅ Created 'proposals' collection")
        
        # Create some demo proposals to show structure
        demo_proposals = [
            {
                "id": "proposal_001",
                "title": "Adaptive Silence Threshold with Context Awareness",
                "hypothesis": "Dynamisch angepasste Silence-Thresholds basierend auf Hintergrundgeräusch-Level verbessern die Segmentierung",
                "description": "Nutzt Kontext-Informationen aus vorherigen Segmenten, um Silence-Thresholds adaptiv anzupassen",
                "category": "silence-pruner",
                "code_scope": ["packages/analyzer/src/modules/preview/cut_preview_decision_engine.js"],
                "parameters": json.dumps({
                    "adaptive_threshold": True,
                    "context_window": 5,
                    "noise_adaptation_rate": 0.1
                }),
                "expected_improvement": 0.05,  # 5% WER reduction
                "confidence": 0.78,
                "status": "pending_review",
                "source_patterns": json.dumps(["high_success_rate_in_quiet_audio", "threshold_rigidity_in_noise"]),
                "parent_method_ids": json.dumps(["silence_overlap_bleed_weight"]),
                "generated_by": "agent_generator",
                "workflow_id": "generate_improvements",
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "proposal_002",
                "title": "Cross-Method Duration Balancing",
                "hypothesis": "Kombinierte Optimierung von Padding und Merge-Windows führt zu konsistenteren Segment-Dauern",
                "description": "Synchronisiert duration_padding und merge_window Parameter für bessere Gesamtergebnisse",
                "category": "duration-specialist",
                "code_scope": [
                    "packages/analyzer/src/modules/segmentation/segment_padding.js",
                    "packages/analyzer/src/modules/segmentation/merge_window.js"
                ],
                "parameters": json.dumps({
                    "padding_merge_sync": True,
                    "balance_factor": 0.7,
                    "min_segment_quality": 0.85
                }),
                "expected_improvement": 0.03,  # 3% WER reduction
                "confidence": 0.72,
                "status": "pending_review",
                "source_patterns": json.dumps(["correlation_padding_merge"]),
                "parent_method_ids": json.dumps(["duration_padding_rebalance", "duration_merge_window_tuning"]),
                "generated_by": "agent_generator",
                "workflow_id": "generate_improvements",
                "created_at": datetime.now().isoformat()
            },
            {
                "id": "proposal_003",
                "title": "Review Corridor with Uncertainty Quantification",
                "hypothesis": "Explizite Unsicherheitsmodellierung in Review-Entscheidungen reduziert Fehlklassifikationen",
                "description": "Erweitert Review-Corridor um Confidence-Intervalle für unsichere Fälle",
                "category": "review-calibrator",
                "code_scope": ["packages/analyzer/src/modules/review/corridor_detector.js"],
                "parameters": json.dumps({
                    "uncertainty_quantification": True,
                    "confidence_threshold": 0.6,
                    "corridor_flexibility": 0.15
                }),
                "expected_improvement": 0.02,  # 2% WER reduction
                "confidence": 0.68,
                "status": "pending_review",
                "source_patterns": json.dumps(["review_false_positive_correlation"]),
                "parent_method_ids": json.dumps(["review_corridor_soften", "review_bleed_uncertainty_gate"]),
                "generated_by": "agent_generator",
                "workflow_id": "generate_improvements",
                "created_at": datetime.now().isoformat()
            }
        ]
        
        for proposal in demo_proposals:
            # Create embedding from proposal content
            content = f"{proposal['title']} {proposal['hypothesis']} {proposal['description']} {proposal['category']}"
            embedding = db.encoder.encode(content)
            
            # Handle both numpy arrays and lists
            if hasattr(embedding, 'tolist'):
                embedding = embedding.tolist()
            
            metadata = {k: v for k, v in proposal.items() if k != "id"}
            
            proposals_coll.add(
                ids=[proposal["id"]],
                embeddings=[embedding],
                metadatas=[metadata]
            )
            print(f"  ✅ Added demo proposal: {proposal['id']} ({proposal['title'][:40]}...)")
        
        print(f"\n  📊 Total proposals created: {len(demo_proposals)}")
        return True
        
    except Exception as e:
        print(f"  ❌ Error creating proposals collection: {e}")
        return False


if __name__ == "__main__":
    # Initialize ChromaDB
    persist_dir = str(workspace_root / "chroma_data")
    db = ChromaLearningDB(persist_dir=persist_dir)
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        sys.exit(1)
    
    success = create_proposals_collection(db)
    sys.exit(0 if success else 1)
