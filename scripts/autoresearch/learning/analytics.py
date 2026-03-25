#!/usr/bin/env python3
"""
Method Analytics Module
Provides analytics and ML-like predictions for method performance
"""

from typing import Tuple, List, Dict, Any, Optional
from learning_db import LearningDB


class MethodAnalytics:
    """Analytics engine for method performance"""
    
    def __init__(self, db: LearningDB):
        self.db = db
    
    def predict_success(self, method_id: str) -> Tuple[float, str]:
        """
        Predict success rate for a method
        Returns: (predicted_rate, category)
        """
        # Get method stats
        row = self.db.conn.execute("""
            SELECT 
                COUNT(CASE WHEN decision = 'KEEP' THEN 1 END) as keep_count,
                COUNT(CASE WHEN decision = 'REJECT' THEN 1 END) as reject_count,
                COUNT(CASE WHEN decision = 'FAILED' THEN 1 END) as failed_count,
                AVG(improvement) as avg_improvement
            FROM method_runs
            WHERE method_id = ?
        """, (method_id,)).fetchone()
        
        if not row or row[0] + row[1] + row[2] == 0:
            # No data - new method
            return (0.0, 'unknown')
        
        keep_count = row[0] or 0
        reject_count = row[1] or 0
        failed_count = row[2] or 0
        avg_improvement = row[3] or 0
        
        total = keep_count + reject_count + failed_count
        if total == 0:
            return (0.0, 'unknown')
        
        success_rate = keep_count / total
        
        # Categorize based on success rate
        if success_rate >= 0.7:
            category = 'high_performer'
        elif success_rate >= 0.4:
            category = 'average'
        else:
            category = 'underperformer'
        
        return (round(success_rate, 2), category)
    
    def cluster_methods(self, n_clusters: int = 5) -> List[Dict[str, Any]]:
        """
        Simple clustering based on success rate and improvement
        """
        rows = self.db.conn.execute("""
            SELECT 
                m.method_id,
                m.name,
                COUNT(CASE WHEN mr.decision = 'KEEP' THEN 1 END) as keep_count,
                COUNT(CASE WHEN mr.decision = 'REJECT' THEN 1 END) as reject_count,
                COUNT(CASE WHEN mr.decision = 'FAILED' THEN 1 END) as failed_count,
                AVG(mr.improvement) as avg_improvement
            FROM methods m
            LEFT JOIN method_runs mr ON m.method_id = mr.method_id
            GROUP BY m.method_id
        """).fetchall()
        
        clusters = []
        for i, row in enumerate(rows):
            method_id = row[0]
            name = row[1]
            keep = row[2] or 0
            reject = row[3] or 0
            failed = row[4] or 0
            avg_imp = row[5] or 0
            
            total = keep + reject + failed
            success_rate = keep / total if total > 0 else 0
            
            # Assign to cluster based on success rate
            if success_rate >= 0.7:
                cluster_id = 0
                cluster_name = 'high_performers'
            elif success_rate >= 0.4:
                cluster_id = 1
                cluster_name = 'average_performers'
            elif success_rate > 0:
                cluster_id = 2
                cluster_name = 'low_performers'
            else:
                cluster_id = 3
                cluster_name = 'untested'
            
            clusters.append({
                'method_id': method_id,
                'name': name,
                'cluster_id': cluster_id,
                'cluster_name': cluster_name,
                'success_rate': round(success_rate, 2),
                'avg_improvement': round(avg_imp, 4) if avg_imp else 0
            })
        
        return clusters
