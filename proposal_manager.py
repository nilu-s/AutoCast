#!/usr/bin/env python3
"""Proposal Manager - Handle approve/reject workflow for proposals.

Verwaltet den Übergang von proposals → methods.
Usage:
    python proposal_manager.py --list
    python proposal_manager.py --approve proposal_001
    python proposal_manager.py --reject proposal_001
    python proposal_manager.py --promote proposal_001
"""

import argparse
import json
import sys
from pathlib import Path

workspace_root = Path(__file__).parent
sys.path.insert(0, str(workspace_root))

from learning.chroma_client import ChromaLearningDB


def list_proposals(db: ChromaLearningDB, status: str = None):
    """List all proposals with their status."""
    try:
        proposals_coll = db.client.get_collection("proposals")
        
        # Get all proposals
        if status:
            results = proposals_coll.get(
                where={"status": status},
                include=["metadatas"]
            )
        else:
            results = proposals_coll.get(include=["metadatas"])
        
        ids = results.get("ids", [])
        metadatas = results.get("metadatas", [])
        
        if not ids:
            print("\n📭 No proposals found.")
            return []
        
        print(f"\n📋 Proposals ({len(ids)} total):")
        print("-" * 70)
        
        proposals = []
        for pid, meta in zip(ids, metadatas):
            p = {
                "id": pid,
                **meta
            }
            proposals.append(p)
            
            expected = float(meta.get("expected_improvement", 0)) * 100
            conf = float(meta.get("confidence", 0))
            status_icon = "⏳" if meta.get("status") == "pending_review" else "✅" if meta.get("status") == "approved" else "❌"
            
            print(f"\n  {status_icon} {pid}")
            print(f"     Title: {meta.get('title', 'N/A')[:50]}...")
            print(f"     Expected: +{expected:.0f}% WER | Confidence: {conf:.2f}")
            print(f"     Status: {meta.get('status', 'unknown')}")
        
        return proposals
        
    except Exception as e:
        print(f"❌ Error listing proposals: {e}")
        return []


def approve_proposal(db: ChromaLearningDB, proposal_id: str):
    """Approve a proposal (changes status to approved)."""
    try:
        proposals_coll = db.client.get_collection("proposals")
        
        # Get proposal
        result = proposals_coll.get(ids=[proposal_id], include=["metadatas"])
        
        if not result.get("ids"):
            print(f"❌ Proposal '{proposal_id}' not found")
            return False
        
        metadata = result["metadatas"][0]
        
        # Update status
        metadata["status"] = "approved"
        metadata["approved_at"] = datetime.now().isoformat()
        
        # Re-add with updated metadata
        embedding = db.encoder.encode(
            f"{metadata['title']} {metadata['hypothesis']} {metadata['description']}"
        )
        
        if hasattr(embedding, 'tolist'):
            embedding = embedding.tolist()
        
        proposals_coll.update(
            ids=[proposal_id],
            embeddings=[embedding],
            metadatas=[metadata]
        )
        
        print(f"✅ Proposal '{proposal_id}' approved!")
        print(f"   Title: {metadata.get('title')}")
        print(f"\n   To promote to methods collection, run:")
        print(f"   python proposal_manager.py --promote {proposal_id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error approving proposal: {e}")
        return False


def reject_proposal(db: ChromaLearningDB, proposal_id: str):
    """Reject a proposal (changes status to rejected)."""
    try:
        proposals_coll = db.client.get_collection("proposals")
        
        # Get proposal
        result = proposals_coll.get(ids=[proposal_id], include=["metadatas"])
        
        if not result.get("ids"):
            print(f"❌ Proposal '{proposal_id}' not found")
            return False
        
        metadata = result["metadatas"][0]
        
        # Update status
        metadata["status"] = "rejected"
        metadata["rejected_at"] = datetime.now().isoformat()
        
        # Re-add with updated metadata
        embedding = db.encoder.encode(
            f"{metadata['title']} {metadata['hypothesis']} {metadata['description']}"
        )
        
        if hasattr(embedding, 'tolist'):
            embedding = embedding.tolist()
        
        proposals_coll.update(
            ids=[proposal_id],
            embeddings=[embedding],
            metadatas=[metadata]
        )
        
        print(f"❌ Proposal '{proposal_id}' rejected.")
        print(f"   Title: {metadata.get('title')}")
        print(f"\n   Proposal remains in proposals collection for reference.")
        
        return True
        
    except Exception as e:
        print(f"❌ Error rejecting proposal: {e}")
        return False


def promote_proposal(db: ChromaLearningDB, proposal_id: str):
    """Promote an approved proposal to the methods collection."""
    try:
        proposals_coll = db.client.get_collection("proposals")
        methods_coll = db.client.get_collection("methods")
        
        # Get proposal
        result = proposals_coll.get(ids=[proposal_id], include=["metadatas"])
        
        if not result.get("ids"):
            print(f"❌ Proposal '{proposal_id}' not found")
            return False
        
        metadata = result["metadatas"][0]
        
        if metadata.get("status") != "approved":
            print(f"⚠️  Proposal must be approved first!")
            print(f"   Current status: {metadata.get('status')}")
            print(f"   Run: python proposal_manager.py --approve {proposal_id}")
            return False
        
        # Create new method ID (remove 'proposal_' prefix)
        new_method_id = proposal_id.replace("proposal_", "method_")
        if new_method_id == proposal_id:
            new_method_id = f"method_{proposal_id}"
        
        # Prepare method metadata
        method_metadata = {
            "category": metadata.get("category", "unknown"),
            "title": metadata.get("title", "Untitled"),
            "hypothesis": metadata.get("hypothesis", ""),
            "description": metadata.get("description", ""),
            "code_scope": metadata.get("code_scope", "[]"),
            "success_rate": 0.0,  # New method, no runs yet
            "attempts": 0,
            "parameters": metadata.get("parameters", "{}"),
            "created_at": datetime.now().isoformat(),
            "promoted_from": proposal_id
        }
        
        # Add to methods collection
        embedding = db.encoder.encode(
            f"{method_metadata['title']} {method_metadata['hypothesis']} {method_metadata['description']}"
        )
        
        if hasattr(embedding, 'tolist'):
            embedding = embedding.tolist()
        
        methods_coll.add(
            ids=[new_method_id],
            embeddings=[embedding],
            metadatas=[method_metadata]
        )
        
        print(f"✅ Proposal promoted to methods!")
        print(f"   New method ID: {new_method_id}")
        print(f"   Title: {method_metadata['title']}")
        print(f"\n   You can now use this method with:")
        print(f"   python execute_apply_method.py --method-id {new_method_id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error promoting proposal: {e}")
        return False


def main():
    from datetime import datetime
    
    parser = argparse.ArgumentParser(
        description="Manage method proposals",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python proposal_manager.py --list
  python proposal_manager.py --list --status pending_review
  python proposal_manager.py --approve proposal_001
  python proposal_manager.py --reject proposal_001
  python proposal_manager.py --promote proposal_001
        """
    )
    
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List all proposals"
    )
    
    parser.add_argument(
        "--status",
        choices=["pending_review", "approved", "rejected"],
        help="Filter by status"
    )
    
    parser.add_argument(
        "--approve",
        metavar="PROPOSAL_ID",
        help="Approve a proposal"
    )
    
    parser.add_argument(
        "--reject",
        metavar="PROPOSAL_ID",
        help="Reject a proposal"
    )
    
    parser.add_argument(
        "--promote",
        metavar="PROPOSAL_ID",
        help="Promote approved proposal to methods collection"
    )
    
    args = parser.parse_args()
    
    # Initialize ChromaDB
    db = ChromaLearningDB(persist_dir=str(workspace_root / "chroma_data"))
    
    if db.client is None:
        print("❌ ChromaDB client not available")
        return 1
    
    # Execute command
    if args.list:
        list_proposals(db, args.status)
        return 0
    elif args.approve:
        return 0 if approve_proposal(db, args.approve) else 1
    elif args.reject:
        return 0 if reject_proposal(db, args.reject) else 1
    elif args.promote:
        return 0 if promote_proposal(db, args.promote) else 1
    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
