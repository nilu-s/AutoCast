#!/usr/bin/env python3
"""L3 Interactive Demo - Show the full user interaction flow.

Demonstrates:
1. User: "Generate improvements"
2. System: "Ich habe 3 Ideen gefunden..."
3. User: "Teste Idee 1"
4. System: Startet apply_method

Usage:
    python demo_l3_interactive.py
"""

import sys
from pathlib import Path

workspace_root = Path(__file__).parent
sys.path.insert(0, str(workspace_root))

from generate_improvements import L3ProactiveGenerator, display_results, handle_user_choice


def demo_full_interaction():
    """Demonstrate the full L3 interaction flow."""
    
    print("\n" + "="*70)
    print("🎭 L3 PROACTIVE GENERATION - INTERACTIVE DEMO")
    print("="*70)
    print("\nSimulating user interaction with the AutoCast system...")
    print("\n" + "-"*70)
    
    # Step 1: User requests improvements
    print("\n👤 USER: \"Zeig mir Verbesserungsideen\"")
    print("\n   [System verarbeitet...]")
    
    # Step 2: System generates proposals
    generator = L3ProactiveGenerator(test_mode=True)
    proposals = generator.run()
    
    # Step 3: Display results
    print("\n" + "-"*70)
    print("\n🤖 SYSTEM: Hier sind meine Vorschläge:")
    
    for i, p in enumerate(proposals, 1):
        expected = p.get("expected_improvement", 0) * 100
        print(f"\n  {i}. {p['title']}")
        print(f"     Erwartete Verbesserung: +{expected:.0f}% WER")
        print(f"     Beschreibung: {p['description'][:70]}...")
    
    # Step 4: Simulate user selection
    print("\n" + "-"*70)
    print("\n👤 USER: \"Teste Idee 1\" [simuliert]")
    
    selected = proposals[0]
    print(f"\n🤖 SYSTEM: Starte apply_method für: {selected['title']}")
    print(f"   Proposal ID: {selected['id']}")
    print(f"\n   [In echter Umgebung würde jetzt execute_apply_method.py")
    print(f"    mit diesem Proposal aufgerufen werden]")
    
    # Step 5: Show next steps
    print("\n" + "-"*70)
    print("\n📋 NÄCHSTE SCHRITTE (Manuell):")
    print(f"\n   # Um das Proposal zu genehmigen:")
    print(f"   python proposal_manager.py --approve {selected['id']}")
    print(f"\n   # Um es zu methods zu promoten:")
    print(f"   python proposal_manager.py --promote {selected['id']}")
    print(f"\n   # Oder direkt testen (simuliert):")
    print(f"   python execute_apply_method.py --method-id {selected['id']}")
    
    print("\n" + "="*70)
    print("✅ DEMO COMPLETE")
    print("="*70)
    print(f"\nGenerierte Proposal ID: {selected['id']}")
    print("Diese ID kann mit proposal_manager.py oder execute_apply_method.py")
    print("weiterverarbeitet werden.")


def demo_proposal_management():
    """Demonstrate proposal management workflow."""
    
    print("\n" + "="*70)
    print("📋 PROPOSAL MANAGEMENT DEMO")
    print("="*70)
    
    print("\n📋 Aktuelle Proposals anzeigen:")
    print("   python proposal_manager.py --list")
    
    print("\n✅ Ein Proposal genehmigen:")
    print("   python proposal_manager.py --approve proposal_001")
    
    print("\n❌ Ein Proposal ablehnen:")
    print("   python proposal_manager.py --reject proposal_002")
    
    print("\n🚀 Genehmigtes Proposal zu Methods promoten:")
    print("   python proposal_manager.py --promote proposal_001")
    
    print("\n🔍 Nur ausstehende Proposals anzeigen:")
    print("   python proposal_manager.py --list --status pending_review")


if __name__ == "__main__":
    demo_full_interaction()
    demo_proposal_management()
    
    print("\n" + "="*70)
    print("L3 Proactive Generation ist bereit!")
    print("="*70)
